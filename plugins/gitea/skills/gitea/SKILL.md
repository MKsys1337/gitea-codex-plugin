---
name: gitea
description: "Work with Gitea repositories through the bundled MCP server: inspect repo metadata and contents, triage issues, review pull requests, create issues/comments, and use official Gitea API routes when needed."
---

# Gitea

Use this skill when the user asks Codex to work with Gitea repositories, issues, pull requests, branches, commits, releases, or repository files.

## Source Policy

- Use the bundled `gitea` MCP tools for live Gitea data and actions.
- Prefer specific tools such as `gitea_get_repository`, `gitea_get_file`, `gitea_list_issues`, `gitea_triage_repository`, and `gitea_pr_review_context` before using generic API tools.
- Use `gitea_api_get` or `gitea_api_request` only for official Gitea `/api/v1` routes that are not covered by a specific tool.
- Use `$gitea-tea-cli` when the user explicitly asks for Tea CLI commands, local Tea login context, pull-request checkout with `tea`, or help fixing wrong `tea` syntax.
- Do not hard-code private Gitea hostnames, tokens, user names, or organization names in repo files.
- Do not print tokens or authorization headers. If a response contains secret-looking fields, treat them as sensitive even when already redacted by the MCP server.

## Setup Expectations

The MCP server reads configuration from the environment:

- `GITEA_BASE_URL`: root URL of the Gitea instance.
- `GITEA_TOKEN`: Gitea access token. `GITEA_ACCESS_TOKEN` and `GITEA_API_TOKEN` are accepted as fallbacks.
- `GITEA_AUTH_SCHEME`: optional authorization scheme, default `token`; use `bearer` only when the instance expects bearer auth.

If the server reports that `GITEA_BASE_URL` is missing, ask the user for their instance URL or help them set it in their Codex environment. If authentication fails, ask for a token with the minimum required Gitea scopes for the requested work.

## Workflow

1. Start with `gitea_get_version` when connectivity is uncertain.
2. Use `gitea_get_current_user` to verify the authenticated account when permissions look wrong.
3. Resolve the repository with `gitea_search_repositories` or `gitea_get_repository`.
4. Read repository guidance files with `gitea_get_file` before making changes or opening issues.
5. Use `gitea_triage_repository` for an initial compact snapshot when the user asks what needs attention.
6. Use `gitea_pr_review_context` before reviewing a pull request so files, commits, comments, and PR metadata stay together.
7. Use `gitea_create_bundled_issue` when several findings should become one actionable issue.
8. Use `gitea_deploy_current_repo` only with an explicit `local_path`, `owner`, and `repo`; confirm the target before pushing.
9. For write actions, state the intended repository, branch, issue, or pull request target before calling the write tool.
10. After writes, fetch the created or updated resource and summarize the exact Gitea URL or index returned by the API.
