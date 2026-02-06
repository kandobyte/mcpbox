# AGENTS.md

- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, `docs:`)
- Project Implements the [MCP authorization spec (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- Project implements its own authorization server — spec requirements that assume a separate/shared authorization server (e.g., audience binding, resource indicators) do not apply

## Documentation Guidelines

- Docs follow progressive disclosure: open with the decision/choice, then a minimal example, then reference details — lead with *when/why* before *what/how*
- One idea per sentence, no filler
- Task headers ("Authentication"), not categories ("Overview")
- Tables over prose for options/parameters
- Maintain consistent rhythm throughout one document.

## General Coding Guidelines

- Maintain consistency with existing patterns and style in the codebase
- Use TypeScript strictly: enable `strict: true`, prefer `unknown` over `any`, avoid type assertions unless necessary
- Write comments that explain *why*, not *what*—update or remove stale comments when modifying code
- Prefer renaming over commenting: if code needs a comment to explain what it does, rename instead
- Use JSDoc (`/** */`) only for exported functions/types; use `//` for implementation notes
- Use `@package` on exports internal to their feature package
- Include `@example` in JSDoc when input/output isn't obvious from the signature
- No commented-out code, no TODO/FIXME without a linked issue
- Naming: camelCase functions/variables, PascalCase types/classes, UPPER_SNAKE_CASE constants; prefix booleans with `is`/`has`/`should`
- Keep functions focused and single-responsibility; favor immutable patterns (`readonly`, no mutation)
- Handle errors consistently: prefer typed errors or Result patterns, handle promise rejections explicitly
- Use modern syntax: optional chaining (`?.`), nullish coalescing (`??`), `satisfies`, ES modules
- After refactoring, run `npm run test` to verify tests pass and coverage requirements are met
- Write tests covering happy path, edge cases, and error conditions with descriptive names
