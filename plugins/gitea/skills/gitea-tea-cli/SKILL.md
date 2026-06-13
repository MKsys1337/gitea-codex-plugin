---
name: gitea-tea-cli
description: Use when Codex needs to run, author, or troubleshoot Gitea Tea CLI (`tea`) commands for Gitea repositories, logins, issues, pull requests, labels, releases, cloning, or authenticated `tea api` calls; especially when avoiding wrong Tea flags, choosing between bundled Gitea MCP tools and local Tea workflows, or verifying Tea command syntax before execution.
---

# Gitea Tea CLI

Use this skill to make Tea CLI usage conservative, verified, and reproducible.
The goal is to prevent Codex from inventing `tea` commands or flags.

## Decision Rules

1. Prefer bundled Gitea MCP tools for structured repository, issue, pull request, file, branch, commit, label, and migration workflows unless the user explicitly asks for `tea` or the task needs local CLI behavior.
2. Use `tea` for local workflows: inspecting saved Tea logins, resolving local repository context, cloning, checking out pull requests, running human-parity CLI commands, or when a user specifically asks for Tea syntax.
3. Before using any `tea` command pattern that is not covered here, run `tea <command> --help` or `tea <command> <subcommand> --help` and adapt to the installed version.
4. For exact command patterns, read `references/commands.md` before writing or running Tea commands beyond `tea --help`, `tea --version`, or `tea logins list`.
5. Do not use generic shell guessing when a dedicated bundled MCP tool exists and the user did not ask for Tea.

## Safety Rules

- Never print tokens, authorization headers, or raw Tea config contents.
- Use placeholders such as `LOGIN`, `OWNER/REPO`, `ISSUE_INDEX`, `PR_INDEX`, and `https://git.example.com`.
- Prefer `--repo OWNER/REPO` when running outside a local checkout or when repository context is ambiguous.
- Prefer `--login LOGIN` when multiple Tea logins may exist or when a specific instance is required.
- Use `--output json` for list/detail commands when Codex must parse output.
- Use `GIT_TERMINAL_PROMPT=0` for Git reachability checks so credential prompts fail explicitly instead of hanging.

## Workflow

1. Determine whether the user needs MCP or Tea:
   - MCP: remote Gitea data/actions, structured JSON, marketplace-safe workflows.
   - Tea: local checkout, local login state, PR checkout/review parity, direct CLI examples.
2. Inspect context without leaking secrets:
   - `tea --version`
   - `tea logins list`
   - `git remote -v` when inside a checkout
3. Read `references/commands.md` for the relevant command family.
4. Run the narrowest command, including `--repo OWNER/REPO` and `--login LOGIN` when needed.
5. After writes, verify with a read command or a bundled Gitea MCP tool and summarize the resulting issue, PR, release, repository, or URL.

## Common Corrections

- Use `tea issues create --description`, not `--body`, for issue bodies.
- Use `tea comment ISSUE_INDEX "text"` for comments; do not assume `tea issues comment` exists.
- Use `tea repos edit --repo OWNER/REPO ...` outside a local repository; do not pass `OWNER/REPO` positionally.
- Use `tea api repos/OWNER/REPO` for reliable repository detail when `tea repos show` is unavailable or ambiguous.
- Quote `tea api` endpoints containing `?` or `&`.
- Use `tea pulls approve PR_INDEX "comment"` or `tea pulls reject PR_INDEX "reason"` for non-interactive PR review outcomes; `tea pulls review` is interactive.
