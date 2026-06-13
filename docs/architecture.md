# Architecture

## Design

The plugin has two layers:

1. Codex plugin packaging with `.codex-plugin/plugin.json`, `.mcp.json`, and `skills/gitea/SKILL.md`.
2. A stdio MCP server in `src/` that exposes Gitea tools and calls the configured instance's official REST API.

The MCP server is dependency-free. This keeps local plugin installs simple and avoids requiring a package manager step before Codex can launch the server.

## Configuration Boundary

Private deployment details live outside the repository:

- `GITEA_BASE_URL` selects the instance.
- `GITEA_TOKEN`, `GITEA_ACCESS_TOKEN`, or `GITEA_API_TOKEN` supplies authentication.
- `.env` files are ignored.

No default host, token, owner, or repository is embedded in source files.

## Tool Shape

Dedicated tools cover common Codex workflows:

- Repository discovery and metadata.
- Repository contents and Git trees.
- File create, update, and delete actions.
- Issues and issue comments.
- Pull requests and pull request files.
- Branches and commits.

Generic `gitea_api_get` and `gitea_api_request` tools provide escape hatches for official Gitea API routes that are not yet represented by dedicated tools. They accept only relative routes, so they cannot be used as arbitrary URL fetchers.

## Compatibility

The server implements the MCP stdio lifecycle directly:

- `initialize`
- `notifications/initialized`
- `ping`
- `tools/list`
- `tools/call`

It advertises the `tools` capability and supports current and recent MCP protocol versions used by Codex-compatible clients.
