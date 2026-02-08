# MCP Conformance

MCPBox implements [MCP Streamable HTTP Transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http) using request/response only. For clients setting `Accept: text/event-stream`, requests still succeed but progress/log notifications are not streamed.

Passes **19/30** scenarios in the official [MCP conformance test suite](https://github.com/modelcontextprotocol/conformance).

| Scenario | Status | Notes |
|----------|--------|-------|
| server-initialize | ✓ | Protocol version `2025-11-25`, capabilities: tools, resources, prompts, completions |
| ping | ✓ | |
| tools-list | ✓ | |
| tools-call-simple-text | ✓ | |
| tools-call-image | ✓ | |
| tools-call-audio | ✓ | |
| tools-call-embedded-resource | ✓ | |
| tools-call-mixed-content | ✓ | |
| tools-call-error | ✓ | |
| tools-call-with-logging | ✗ | Not implemented |
| tools-call-with-progress | ✗ | Not implemented |
| tools-call-sampling | ✗ | Not implemented |
| tools-call-elicitation | ✗ | Not implemented |
| resources-list | ✓ | |
| resources-read-text | ✓ | |
| resources-read-binary | ✓ | |
| resources-templates-read | ✗ | Not implemented |
| resources-subscribe | ✗ | Not implemented |
| resources-unsubscribe | ✗ | Not implemented |
| prompts-list | ✓ | |
| prompts-get-simple | ✓ | |
| prompts-get-with-args | ✓ | |
| prompts-get-embedded-resource | ✓ | |
| prompts-get-with-image | ✓ | |
| logging-set-level | ✗ | N/A without `tools-call-with-logging` |
| completion-complete | ✓ | |
| server-sse-multiple-streams | ✗ | Not implemented |
| elicitation-sep1034-defaults | ✗ | Not implemented |
| elicitation-sep1330-enums | ✗ | Not implemented |
| dns-rebinding-protection | ✗ | Not implemented |

## Running Tests

```bash
npm run test:conformance
```

Runs the official `@modelcontextprotocol/conformance` suite against MCPBox with a downstream test MCP server.
