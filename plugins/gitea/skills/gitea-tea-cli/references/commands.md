# Tea CLI Command Patterns

These patterns are for `tea` 0.14.x style syntax. Run `tea <command> --help`
first when a user's installed version may differ.

## Context And Logins

Show version:

```sh
tea --version
```

List configured logins without printing tokens:

```sh
tea logins list
```

Add a login using a token from the environment:

```sh
tea logins add --name LOGIN --url https://git.example.com --token "$GITEA_TOKEN"
```

Set or inspect the default login:

```sh
tea logins default LOGIN
tea logins default
```

## Repository Discovery

Search repositories:

```sh
tea repos search "query" --login LOGIN --output table
```

List repositories for an owner or organization:

```sh
tea repos list --owner OWNER --fields owner,name,description,url --output table --login LOGIN
```

Get reliable repository metadata through the API helper:

```sh
tea api repos/OWNER/REPO --login LOGIN
```

Edit repository properties outside a checkout:

```sh
tea repos edit --repo OWNER/REPO --description "New description" --login LOGIN
```

Use string booleans for repository edit flags when needed:

```sh
tea repos edit --repo OWNER/REPO --private false --login LOGIN
tea repos edit --repo OWNER/REPO --archived true --login LOGIN
```

Avoid:

```sh
tea repos edit OWNER/REPO --description "New description"
tea repos show OWNER/REPO
```

The positional edit form can fail outside a checkout, and `repos show` may not
exist or may behave differently across versions.

## Issues

List issues in parseable form:

```sh
tea issues list --repo OWNER/REPO --state open --output json --login LOGIN
```

Create an issue:

```sh
tea issues create --repo OWNER/REPO --title "Title" --description "Body" --login LOGIN
```

Create an issue from a file body:

```sh
tea issues create --repo OWNER/REPO --title "Title" --description "$(cat issue.md)" --login LOGIN
```

Edit an issue:

```sh
tea issues edit --repo OWNER/REPO ISSUE_INDEX --title "New title" --description "New body" --login LOGIN
```

Add labels or assignees:

```sh
tea issues edit --repo OWNER/REPO ISSUE_INDEX --add-labels "bug,triage" --login LOGIN
tea issues edit --repo OWNER/REPO ISSUE_INDEX --add-assignees "alice,bob" --login LOGIN
```

Close or reopen:

```sh
tea issues close --repo OWNER/REPO ISSUE_INDEX --login LOGIN
tea issues reopen --repo OWNER/REPO ISSUE_INDEX --login LOGIN
```

Avoid:

```sh
tea issues create --repo OWNER/REPO --title "Title" --body "Body"
tea issues comment ISSUE_INDEX "comment"
```

Tea uses `--description` for issue bodies, and comments are handled by
`tea comment`.

## Comments

Comment on an issue or pull request:

```sh
tea comment --repo OWNER/REPO ISSUE_OR_PR_INDEX "Comment body" --login LOGIN
```

## Pull Requests

List pull requests:

```sh
tea pulls list --repo OWNER/REPO --state open --output json --login LOGIN
```

Check out a pull request locally:

```sh
tea pulls checkout --repo OWNER/REPO PR_INDEX --login LOGIN
tea pulls checkout --repo OWNER/REPO PR_INDEX --branch --login LOGIN
```

Create a pull request:

```sh
tea pulls create --repo OWNER/REPO --head feature-branch --base main --title "Title" --description "Body" --login LOGIN
```

Approve a pull request non-interactively:

```sh
tea pulls approve --repo OWNER/REPO PR_INDEX "Looks good." --login LOGIN
```

Request changes:

```sh
tea pulls reject --repo OWNER/REPO PR_INDEX "Reason for requested changes." --login LOGIN
```

Merge a pull request:

```sh
tea pulls merge --repo OWNER/REPO PR_INDEX --style merge --title "Merge title" --message "Merge message" --login LOGIN
```

Use `tea pulls review PR_INDEX` only when an interactive review flow is desired.

## Labels

List labels:

```sh
tea labels list --repo OWNER/REPO --output json --login LOGIN
```

Create a label:

```sh
tea labels create --repo OWNER/REPO --name "triage" --color "#2f80ed" --description "Needs triage" --login LOGIN
```

## Releases

List releases:

```sh
tea releases list --repo OWNER/REPO --output json --login LOGIN
```

Create a release:

```sh
tea releases create --repo OWNER/REPO --tag v1.0.0 --title "v1.0.0" --note-file RELEASE_NOTES.md --login LOGIN
```

Attach assets:

```sh
tea releases create --repo OWNER/REPO --tag v1.0.0 --title "v1.0.0" --note "Notes" --asset dist/app.zip --login LOGIN
```

## API Helper

Get an API endpoint. `tea api` prefixes endpoints with `/api/v1/` unless the
endpoint already starts with `/api/` or `http(s)://`.

```sh
tea api repos/OWNER/REPO --login LOGIN
```

Quote endpoints containing query strings:

```sh
tea api 'repos/OWNER/REPO/issues?state=open&type=issues' --login LOGIN
```

Send typed fields with `-F`:

```sh
tea api repos/OWNER/REPO/issues -F title="Title" -F body=@issue.md --login LOGIN
```

Send raw JSON with `--data`; do not combine `--data` with `-f` or `-F`:

```sh
tea api repos/OWNER/REPO/issues --method POST --data @issue.json --login LOGIN
```

## Clone And Git Reachability

Clone by slug:

```sh
tea clone --login LOGIN OWNER/REPO /path/to/target
```

If a clone or remote check may prompt for credentials, force explicit failure:

```sh
GIT_TERMINAL_PROMPT=0 git ls-remote https://git.example.com/OWNER/REPO.git
```

If SSH fails or is unavailable for an instance, prefer the HTTPS clone URL from
`tea api repos/OWNER/REPO` and verify with `GIT_TERMINAL_PROMPT=0`.
