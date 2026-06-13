# Security

## Secrets

Never commit private Gitea instance URLs, tokens, organization names, or repository-specific test fixtures. Use environment variables for local testing.

Ignored local files:

- `.env`
- `.env.*`
- `node_modules/`
- generated coverage or build output

## Authentication

Use least-privilege Gitea access tokens. For read-only work, prefer a read-scoped token. For write workflows such as issue creation, file updates, or pull request merging, grant only the scopes needed for that workflow.

Common scopes:

- `read:repository` for repository metadata, files, commits, branches, pull requests, and releases.
- `write:repository` for file writes, pull request creation, pull request merging, release writes, and other repository mutations.
- `read:issue` for issues, labels, milestones, and comments.
- `write:issue` for issue creation, comments, labels, milestones, and other issue mutations.
- `read:user` and `read:organization` when workflows need user, organization, or team context.

The default authorization header is:

```text
Authorization: token <token>
```

Set `GITEA_AUTH_SCHEME=bearer` only for instances that expect bearer-token authorization.

## Generic API Tools

The generic API tools reject absolute URLs and only call routes relative to the configured Gitea `/api/v1` base. This prevents the plugin from becoming a general network fetcher.

## Response Redaction

The server redacts common secret-like fields from tool responses before returning them to Codex, including token, password, secret, authorization, authorization_header, and private_key fields.

Redaction is a safety belt, not a replacement for careful tool use. Avoid requesting or storing secret values through Gitea issues, comments, files, or settings.
