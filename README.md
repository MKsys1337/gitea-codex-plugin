# Gitea Codex Plugin

This repository is a public Codex marketplace source for a Gitea plugin. The plugin gives Codex live access to Gitea through a bundled stdio MCP server backed by the official Gitea REST API.

The plugin is designed for public distribution. Gitea instance URLs and access tokens are read only from the user's environment and must not be committed to the repository.

## Capabilities

- Inspect Gitea instance connectivity and authenticated user details.
- Search repositories, list personal repositories, and list organization repositories visible to the authenticated account.
- Create repositories and update repository metadata, feature flags, visibility, and merge policy.
- Read repository metadata, branches, commits, trees, directories, and files.
- Create, update, and delete repository files through Gitea's contents API.
- Triage repositories with compact snapshots of metadata, issues, pull requests, labels, and recent commits.
- List, create, update, label, and comment on issues.
- List and create labels.
- Bundle multiple findings into one consistently formatted issue.
- List, inspect, create, review-context, and merge pull requests.
- Sync a GitHub or arbitrary Git repository into Gitea through Gitea's migration API.
- Deploy a local Git repository to Gitea by creating or reusing a Gitea repository, configuring a local remote, and pushing a branch.
- Guide Codex toward verified Tea CLI command patterns when users explicitly ask for local `tea` workflows.
- Use generic `/api/v1` GET and write requests for official Gitea routes not yet wrapped by a dedicated tool.

## Configuration

## Install From Codex Marketplace

This repository is also a Codex marketplace source. Add it with:

```sh
codex plugin marketplace add https://github.com/MKsys1337/gitea-codex-plugin.git
codex plugin add gitea@gitea-codex-plugin
```

Then start a new Codex thread and configure the environment variables below.

Set these environment variables in the Codex environment that launches the plugin:

```sh
GITEA_BASE_URL=https://gitea.example.com
GITEA_TOKEN=your-gitea-access-token
```

Optional variables:

```sh
GITEA_AUTH_SCHEME=token
GITEA_TIMEOUT_MS=30000
GITEA_MAX_RESPONSE_CHARS=200000
```

`GITEA_ACCESS_TOKEN` and `GITEA_API_TOKEN` are accepted as fallbacks for `GITEA_TOKEN`.

## Local Development

The MCP server uses only Node.js built-ins, so there is no install step for runtime dependencies.

```sh
cd plugins/gitea
npm test
npm start
```

To test the MCP handshake manually:

```sh
cd plugins/gitea
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"manual","version":"1.0.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' | npm start
```

## Codex Plugin Structure

- `.agents/plugins/marketplace.json`: public Codex marketplace catalog for this repository.
- `plugins/gitea/.codex-plugin/plugin.json`: Codex plugin manifest.
- `plugins/gitea/.mcp.json`: bundled MCP server configuration.
- `plugins/gitea/skills/gitea/SKILL.md`: Codex workflow guidance for Gitea tasks.
- `plugins/gitea/skills/gitea-tea-cli/SKILL.md`: Tea CLI command guidance for local Gitea workflows.
- `plugins/gitea/src/`: dependency-free stdio MCP server and Gitea API client.
- `plugins/gitea/test/`: Node test suite.

## Security Notes

- Do not commit `.env` files or real Gitea instance details.
- Prefer least-privilege Gitea access tokens for the work being performed.
- For repository-only reads, start with `read:repository`; for file updates, pull requests, and releases use `write:repository`; for issues, labels, milestones, and comments use `read:issue` or `write:issue`.
- Add `read:user` or `read:organization` only when workflows need user, organization, or team context.
- The MCP server rejects full URLs in generic API tools; routes must be relative to the configured Gitea host.
- Tool responses redact common secret-like fields before returning data to Codex.
- Codex approval settings still apply to MCP tool use. Treat repository writes, issue updates, pull request merges, and generic write requests as sensitive actions.

## Trademark and Logo Notice

This plugin uses the Gitea logo from the official `go-gitea/gitea` repository, which is MIT licensed. The Gitea name and logo may also function as trademarks. This plugin is an independent community integration and is not affiliated with, endorsed by, or sponsored by Gitea or CommitGo.

## Official References

- Codex plugins bundle skills, app integrations, and MCP servers into reusable workflows.
- Codex can launch plugin-provided stdio MCP servers from plugin manifests.
- Gitea publishes an instance-specific Swagger UI at `/api/swagger` and an OpenAPI document at `/swagger.v1.json`.
- Gitea API routes are served under `/api/v1`.
