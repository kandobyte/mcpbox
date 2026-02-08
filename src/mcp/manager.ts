import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { validateToolName } from "@modelcontextprotocol/sdk/shared/toolNameValidation.js";
import type {
  CallToolResult,
  CompleteRequestParams,
  CompleteResult,
  GetPromptResult,
  Prompt,
  ReadResourceResult,
  Resource,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import type { LogConfig, McpConfig } from "../config/types.js";
import { logger } from "../logger.js";
import { NAME, VERSION } from "../version.js";
import { namespaceName, stripNamespace } from "./namespace.js";

export interface ManagedMcp {
  name: string;
  client: Client;
  transport: StdioClientTransport;
  tools: Tool[];
  resources: Resource[];
  prompts: Prompt[];
}

export class McpManager {
  private mcps: Map<string, ManagedMcp> = new Map();
  private toolToMcp: Map<string, string> = new Map(); // tool name -> mcp name
  private resourceToMcp: Map<string, string> = new Map(); // uri -> mcp name
  private promptToMcp: Map<string, string> = new Map(); // prompt name -> mcp name
  private mcpDebug: boolean;
  private useNamespacing = true;

  constructor(logConfig?: LogConfig) {
    this.mcpDebug = logConfig?.mcpDebug ?? false;
  }

  async start(configs: McpConfig[]): Promise<void> {
    if (configs.length === 0) {
      return;
    }

    //Can be disabled via internal env var for conformance test.
    this.useNamespacing = process.env.__MCPBOX_SKIP_NAMESPACE !== "true";

    logger.info(
      { count: configs.length, namespacing: this.useNamespacing },
      "Starting MCPs",
    );

    let succeeded = 0;
    let failed = 0;

    for (const config of configs) {
      try {
        await this.startMcp(config);
        succeeded++;
      } catch (error) {
        failed++;
        // Redact sensitive values from args for logging
        const redactedArgs = config.args?.map((arg) =>
          arg.replace(/(PASSWORD|SECRET|TOKEN|KEY|PIN)=.*/i, "$1=***"),
        );
        logger.error(
          {
            mcp: config.name,
            error: error instanceof Error ? error.message : String(error),
            command: config.command,
            args: redactedArgs,
          },
          `MCP failed to start: ${config.name}`,
        );
      }
    }

    if (failed > 0) {
      logger.warn(
        { succeeded, failed, total: configs.length },
        `MCPs started with failures: ${succeeded}/${configs.length}`,
      );
    } else {
      logger.info({ count: succeeded }, "All MCPs started successfully");
    }
  }

  private async startMcp(config: McpConfig): Promise<void> {
    logger.debug({ mcp: config.name }, `Starting MCP: ${config.name}`);

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: { ...getDefaultEnvironment(), ...config.env },
      stderr: this.mcpDebug ? "pipe" : "ignore",
    });

    // Forward MCP stderr to our logger when debug is enabled
    if (this.mcpDebug && transport.stderr) {
      transport.stderr.on("data", (data: Buffer) => {
        const message = data.toString().trim();
        if (message) {
          logger.info(`[mcp:${config.name}] ${message}`);
        }
      });
    }

    const client = new Client({
      name: NAME,
      version: VERSION,
    });

    await client.connect(transport);

    // Get tools from this MCP (filter by allowlist if configured, then namespace)
    const { tools: rawTools } = await client.listTools();
    const toolsAllowlist = config.tools;
    const filteredTools = toolsAllowlist
      ? rawTools.filter((tool) => toolsAllowlist.includes(tool.name))
      : rawTools;
    if (toolsAllowlist) {
      const availableToolNames = rawTools.map((t) => t.name);
      const unknownTools = toolsAllowlist.filter(
        (name) => !availableToolNames.includes(name),
      );
      if (unknownTools.length > 0) {
        logger.warn(
          {
            mcp: config.name,
            unknownTools,
            availableTools: availableToolNames,
          },
          "Tools allowlist contains unknown tool names (possible typo)",
        );
      }
      logger.info(
        {
          mcp: config.name,
          allowed: filteredTools.length,
          total: rawTools.length,
        },
        "Filtered tools by allowlist",
      );
    }
    const tools: Tool[] = this.useNamespacing
      ? filteredTools.map((tool) => ({
          ...tool,
          name: namespaceName(config.name, tool.name),
        }))
      : filteredTools;
    for (const tool of tools) {
      const validation = validateToolName(tool.name);
      if (!validation.isValid || validation.warnings.length > 0) {
        logger.warn(
          { tool: tool.name, warnings: validation.warnings },
          `Tool name may not comply with SEP-986: ${tool.name}`,
        );
      }
      this.toolToMcp.set(tool.name, config.name);
    }

    // Get resources from this MCP (namespace them if multiple servers)
    let resources: Resource[] = [];
    try {
      const { resources: rawResources } = await client.listResources();
      resources = this.useNamespacing
        ? rawResources.map((resource) => ({
            ...resource,
            uri: namespaceName(config.name, resource.uri),
          }))
        : rawResources;
      for (const resource of resources) {
        this.resourceToMcp.set(resource.uri, config.name);
      }
    } catch {
      logger.debug({ mcp: config.name }, "Server doesn't support resources");
    }

    // Get prompts from this MCP (namespace them if multiple servers)
    let prompts: Prompt[] = [];
    try {
      const { prompts: rawPrompts } = await client.listPrompts();
      prompts = this.useNamespacing
        ? rawPrompts.map((prompt) => ({
            ...prompt,
            name: namespaceName(config.name, prompt.name),
          }))
        : rawPrompts;
      for (const prompt of prompts) {
        this.promptToMcp.set(prompt.name, config.name);
      }
    } catch {
      logger.debug({ mcp: config.name }, "Server doesn't support prompts");
    }

    this.mcps.set(config.name, {
      name: config.name,
      client,
      transport,
      tools,
      resources,
      prompts,
    });

    logger.info(
      {
        mcp: config.name,
        tools: tools.length,
        resources: resources.length,
        prompts: prompts.length,
      },
      `MCP ready: ${config.name}`,
    );
  }

  async stop(): Promise<void> {
    const stopPromises: Promise<void>[] = [];

    for (const [name, mcp] of this.mcps) {
      logger.info(`Stopping MCP: ${name}`);
      stopPromises.push(
        mcp.transport.close().catch((error) => {
          logger.error(
            {
              error: error instanceof Error ? error.message : String(error),
            },
            `Error stopping MCP: ${name}`,
          );
        }),
      );
    }

    await Promise.all(stopPromises);
    this.mcps.clear();
    this.toolToMcp.clear();
    this.resourceToMcp.clear();
    this.promptToMcp.clear();
    logger.info("All MCPs stopped");
  }

  get count(): number {
    return this.mcps.size;
  }

  listTools(): Tool[] {
    const allTools: Tool[] = [];
    for (const mcp of this.mcps.values()) {
      allTools.push(...mcp.tools);
    }
    return allTools;
  }

  listResources(): Resource[] {
    const allResources: Resource[] = [];
    for (const mcp of this.mcps.values()) {
      allResources.push(...mcp.resources);
    }
    return allResources;
  }

  listPrompts(): Prompt[] {
    const allPrompts: Prompt[] = [];
    for (const mcp of this.mcps.values()) {
      allPrompts.push(...mcp.prompts);
    }
    return allPrompts;
  }

  async checkHealth(): Promise<{
    servers: Record<
      string,
      {
        status: "up" | "down";
        tools: number;
        resources: number;
        prompts: number;
      }
    >;
  }> {
    const servers: Record<
      string,
      {
        status: "up" | "down";
        tools: number;
        resources: number;
        prompts: number;
      }
    > = {};

    for (const [name, mcp] of this.mcps) {
      try {
        await mcp.client.ping();
        servers[name] = {
          status: "up",
          tools: mcp.tools.length,
          resources: mcp.resources.length,
          prompts: mcp.prompts.length,
        };
      } catch {
        servers[name] = {
          status: "down",
          tools: mcp.tools.length,
          resources: mcp.resources.length,
          prompts: mcp.prompts.length,
        };
      }
    }

    return { servers };
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const mcpName = this.toolToMcp.get(toolName);
    if (!mcpName) {
      logger.warn(`Unknown tool called: ${toolName}`);
      throw new Error(`Unknown tool: ${toolName}`);
    }

    const mcp = this.mcps.get(mcpName);
    if (!mcp) {
      logger.error({ mcpName }, `MCP not found for tool: ${toolName}`);
      throw new Error(`MCP not found: ${mcpName}`);
    }

    // Strip namespace prefix to get original tool name
    const originalName = this.useNamespacing
      ? stripNamespace(mcpName, toolName)
      : toolName;

    logger.info({ args }, `Tool call: ${toolName}`);

    const startTime = Date.now();
    const result = await mcp.client.callTool({
      name: originalName,
      arguments: args,
    });
    const duration = Date.now() - startTime;

    logger.info(
      {
        duration: `${duration}ms`,
        isError: result.isError ?? false,
      },
      `Tool result: ${toolName}`,
    );

    return result as CallToolResult;
  }

  async readResource(resourceUri: string): Promise<ReadResourceResult> {
    const mcpName = this.resourceToMcp.get(resourceUri);
    if (!mcpName) {
      logger.warn(`Unknown resource: ${resourceUri}`);
      throw new Error(`Unknown resource: ${resourceUri}`);
    }

    const mcp = this.mcps.get(mcpName);
    if (!mcp) {
      logger.error({ mcpName }, `MCP not found for resource: ${resourceUri}`);
      throw new Error(`MCP not found: ${mcpName}`);
    }

    // Strip namespace prefix to get original URI
    const originalUri = this.useNamespacing
      ? stripNamespace(mcpName, resourceUri)
      : resourceUri;

    logger.info(`Resource read: ${resourceUri}`);

    const startTime = Date.now();
    const result = await mcp.client.readResource({ uri: originalUri });
    const duration = Date.now() - startTime;

    logger.info(
      { duration: `${duration}ms` },
      `Resource result: ${resourceUri}`,
    );

    return result as ReadResourceResult;
  }

  async getPrompt(
    promptName: string,
    args?: Record<string, string>,
  ): Promise<GetPromptResult> {
    const mcpName = this.promptToMcp.get(promptName);
    if (!mcpName) {
      logger.warn(`Unknown prompt: ${promptName}`);
      throw new Error(`Unknown prompt: ${promptName}`);
    }

    const mcp = this.mcps.get(mcpName);
    if (!mcp) {
      logger.error({ mcpName }, `MCP not found for prompt: ${promptName}`);
      throw new Error(`MCP not found: ${mcpName}`);
    }

    // Strip namespace prefix to get original name
    const originalName = this.useNamespacing
      ? stripNamespace(mcpName, promptName)
      : promptName;

    logger.info({ args }, `Prompt get: ${promptName}`);

    const startTime = Date.now();
    const result = await mcp.client.getPrompt({
      name: originalName,
      arguments: args,
    });
    const duration = Date.now() - startTime;

    logger.info({ duration: `${duration}ms` }, `Prompt result: ${promptName}`);

    return result as GetPromptResult;
  }

  async complete(
    ref: CompleteRequestParams["ref"],
    argument: CompleteRequestParams["argument"],
  ): Promise<CompleteResult> {
    const { mcpName, originalRef } = this.resolveCompletionRef(ref);

    const mcp = this.mcps.get(mcpName);
    if (!mcp) {
      logger.error({ mcpName }, "MCP not found for completion");
      throw new Error(`MCP not found: ${mcpName}`);
    }

    logger.info({ ref, argument }, "Completion request");

    const startTime = Date.now();
    const result = await mcp.client.complete({ ref: originalRef, argument });
    const duration = Date.now() - startTime;

    logger.info({ duration: `${duration}ms` }, "Completion result");

    return result as CompleteResult;
  }

  private resolveCompletionRef(
    ref: CompleteRequestParams["ref"],
  ):
    | { mcpName: string; originalRef: { type: "ref/prompt"; name: string } }
    | { mcpName: string; originalRef: { type: "ref/resource"; uri: string } } {
    if (ref.type === "ref/prompt" && ref.name) {
      const mcpName = this.promptToMcp.get(ref.name);
      if (!mcpName) {
        logger.warn(`Unknown prompt for completion: ${ref.name}`);
        throw new Error(`Unknown prompt: ${ref.name}`);
      }
      const originalName = this.useNamespacing
        ? stripNamespace(mcpName, ref.name)
        : ref.name;
      return {
        mcpName,
        originalRef: { type: "ref/prompt", name: originalName },
      };
    }

    if (ref.type === "ref/resource" && ref.uri) {
      const mcpName = this.resourceToMcp.get(ref.uri);
      if (!mcpName) {
        logger.warn(`Unknown resource for completion: ${ref.uri}`);
        throw new Error(`Unknown resource: ${ref.uri}`);
      }
      const originalUri = this.useNamespacing
        ? stripNamespace(mcpName, ref.uri)
        : ref.uri;
      return {
        mcpName,
        originalRef: { type: "ref/resource", uri: originalUri },
      };
    }

    throw new Error(`Invalid completion ref type: ${ref.type}`);
  }
}
