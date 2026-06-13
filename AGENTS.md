# Repository Guidance

- Keep this repository free of private Gitea hostnames, tokens, organization names, and repository-specific fixtures.
- Follow official Codex plugin and MCP guidance when changing `.codex-plugin/plugin.json`, `.mcp.json`, or MCP protocol behavior.
- Follow official Gitea API docs for routes, request bodies, and token behavior.
- Prefer dedicated MCP tools over generic API tools when adding supported workflows.
- Run `npm test` from `plugins/gitea` and the plugin validator against `plugins/gitea` before handing off changes.
