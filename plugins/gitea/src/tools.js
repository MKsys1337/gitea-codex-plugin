import { execFile } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  contentRoute,
  decodeGiteaContent,
  encodeSegment,
  getGiteaConfig,
  giteaRequest,
  publicResponse,
  repoRoute,
  toBase64
} from "./gitea.js";

const execFileAsync = promisify(execFile);

const paginationProperties = {
  page: {
    type: "integer",
    minimum: 1,
    description: "Page number for paginated Gitea API results."
  },
  limit: {
    type: "integer",
    minimum: 1,
    maximum: 100,
    description: "Maximum number of items to return."
  }
};

const repoProperties = {
  owner: {
    type: "string",
    description: "Repository owner or organization."
  },
  repo: {
    type: "string",
    description: "Repository name."
  }
};

const organizationProperties = {
  page: paginationProperties.page,
  limit: paginationProperties.limit
};

const repoCreateProperties = {
  name: { type: "string", description: "Repository name to create." },
  owner: {
    type: "string",
    description: "Optional organization owner. Omit to create under the authenticated user."
  },
  description: { type: "string", description: "Repository description." },
  private: { type: "boolean", description: "Whether the repository should be private." },
  auto_init: { type: "boolean", description: "Initialize the repository with an initial commit." },
  default_branch: { type: "string", description: "Default branch name." },
  gitignores: { type: "string", description: "Gitignore template name." },
  issue_labels: { type: "string", description: "Issue label template name." },
  license: { type: "string", description: "License template name." },
  readme: { type: "string", description: "Readme template name." },
  template: { type: "boolean", description: "Whether the repository should be a template." },
  trust_model: {
    type: "string",
    enum: ["default", "collaborator", "committer", "collaboratorcommitter"],
    description: "Repository trust model."
  }
};

const repoUpdateProperties = {
  ...repoProperties,
  name: { type: "string", description: "New repository name." },
  description: { type: "string", description: "Repository description." },
  website: { type: "string", description: "Repository website URL." },
  default_branch: { type: "string", description: "Default branch name." },
  private: { type: "boolean", description: "Whether the repository is private." },
  template: { type: "boolean", description: "Whether the repository is a template." },
  archived: { type: "boolean", description: "Whether the repository is archived." },
  has_issues: { type: "boolean", description: "Enable or disable issues." },
  has_wiki: { type: "boolean", description: "Enable or disable wiki." },
  has_pull_requests: { type: "boolean", description: "Enable or disable pull requests." },
  has_projects: { type: "boolean", description: "Enable or disable projects." },
  has_releases: { type: "boolean", description: "Enable or disable releases." },
  has_packages: { type: "boolean", description: "Enable or disable packages." },
  has_actions: { type: "boolean", description: "Enable or disable actions." },
  allow_merge_commits: { type: "boolean", description: "Allow merge commits." },
  allow_rebase: { type: "boolean", description: "Allow rebasing pull requests." },
  allow_rebase_explicit: { type: "boolean", description: "Allow explicit rebase merges." },
  allow_squash_merge: { type: "boolean", description: "Allow squash merges." },
  allow_fast_forward_only_merge: { type: "boolean", description: "Allow fast-forward-only merges." },
  default_delete_branch_after_merge: {
    type: "boolean",
    description: "Delete PR branches after merge by default."
  },
  default_merge_style: {
    type: "string",
    enum: ["merge", "rebase", "rebase-merge", "squash", "fast-forward-only"],
    description: "Default merge style."
  }
};

const bodyControlProperties = {
  include_body: {
    type: "boolean",
    description: "Include full body text in list responses. Defaults to false."
  },
  body_preview_chars: {
    type: "integer",
    minimum: 0,
    maximum: 2000,
    description: "Body preview length for list and summary responses. Defaults to 280."
  }
};

export const tools = [
  {
    name: "gitea_get_version",
    title: "Get Gitea Version",
    description: "Check connectivity to the configured Gitea instance and return its version.",
    inputSchema: objectSchema({}, []),
    handler: async () => publicResponse(await giteaRequest("/version"))
  },
  {
    name: "gitea_get_current_user",
    title: "Get Current Gitea User",
    description: "Return the authenticated Gitea user for the configured token.",
    inputSchema: objectSchema({}, []),
    handler: async () => publicResponse(await giteaRequest("/user"))
  },
  {
    name: "gitea_search_repositories",
    title: "Search Gitea Repositories",
    description: "Search repositories visible to the authenticated user.",
    inputSchema: objectSchema(
      {
        q: { type: "string", description: "Search query." },
        uid: { type: "integer", description: "Owner user or organization numeric id." },
        priority_owner_id: {
          type: "integer",
          description: "Owner id whose repositories should be prioritized."
        },
        team_id: { type: "integer", description: "Team id to restrict results." },
        topic: { type: "boolean", description: "Search repository topics." },
        includeDesc: { type: "boolean", description: "Include descriptions in search." },
        private: { type: "boolean", description: "Include private repositories when allowed." },
        template: { type: "boolean", description: "Filter template repositories." },
        archived: { type: "boolean", description: "Filter archived repositories." },
        mode: {
          type: "string",
          enum: ["source", "fork", "mirror", "collaborative"],
          description: "Repository mode filter."
        },
        exclusive: { type: "boolean", description: "Use exclusive mode matching." },
        sort: { type: "string", description: "Sort field supported by the Gitea API." },
        order: {
          type: "string",
          enum: ["asc", "desc"],
          description: "Sort order."
        },
        ...paginationProperties
      },
      []
    ),
    handler: async (args) => publicResponse(await giteaRequest("/repos/search", { query: args }))
  },
  {
    name: "gitea_list_my_repositories",
    title: "List My Gitea Repositories",
    description: "List repositories owned by or visible to the authenticated user.",
    inputSchema: objectSchema(paginationProperties, []),
    handler: async (args) => publicResponse(await giteaRequest("/user/repos", { query: args }))
  },
  {
    name: "gitea_list_organizations",
    title: "List My Gitea Organizations",
    description: "List organizations visible to the authenticated user.",
    inputSchema: objectSchema(organizationProperties, []),
    handler: async (args) => publicResponse(await giteaRequest("/user/orgs", { query: args }))
  },
  {
    name: "gitea_list_org_repositories",
    title: "List Organization Repositories",
    description: "List repositories owned by a Gitea organization.",
    inputSchema: objectSchema(
      {
        org: { type: "string", description: "Organization name." },
        ...paginationProperties
      },
      ["org"]
    ),
    handler: async (args) =>
      publicResponse(
        await giteaRequest(`/orgs/${encodeSegment(args.org, "org")}/repos`, {
          query: { page: args.page, limit: args.limit }
        })
      )
  },
  {
    name: "gitea_create_repository",
    title: "Create Gitea Repository",
    description: "Create a repository under the authenticated user or a specified organization.",
    inputSchema: objectSchema(repoCreateProperties, ["name"]),
    handler: async (args) => {
      const route = args.owner
        ? `/orgs/${encodeSegment(args.owner, "owner")}/repos`
        : "/user/repos";
      return publicResponse(
        await giteaRequest(route, {
          method: "POST",
          body: pruneUndefined(omitKeys(args, ["owner"]))
        })
      );
    }
  },
  {
    name: "gitea_get_repository",
    title: "Get Gitea Repository",
    description: "Return repository metadata, permissions, clone URLs, default branch, and counters.",
    inputSchema: objectSchema(repoProperties, ["owner", "repo"]),
    handler: async (args) => publicResponse(await giteaRequest(repoRoute(args.owner, args.repo)))
  },
  {
    name: "gitea_update_repository",
    title: "Update Gitea Repository",
    description:
      "Update common repository settings such as description, website, visibility, units, and merge policy.",
    inputSchema: objectSchema(repoUpdateProperties, ["owner", "repo"]),
    handler: async (args) =>
      publicResponse(
        await giteaRequest(repoRoute(args.owner, args.repo), {
          method: "PATCH",
          body: pruneUndefined(omitRepoArgs(args))
        })
      )
  },
  {
    name: "gitea_triage_repository",
    title: "Triage Gitea Repository",
    description:
      "Fetch a compact repository triage snapshot with repo metadata, open issues, open pull requests, labels, and recent commits.",
    inputSchema: objectSchema(
      {
        ...repoProperties,
        issue_limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Maximum open issues to include."
        },
        pr_limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Maximum open pull requests to include."
        },
        commit_limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Maximum recent commits to include."
        },
        include_labels: { type: "boolean", description: "Include repository labels. Defaults to true." },
        ...bodyControlProperties
      },
      ["owner", "repo"]
    ),
    handler: async (args) => {
      const previewChars = previewLength(args);
      const issueLimit = args.issue_limit || 20;
      const prLimit = args.pr_limit || 20;
      const commitLimit = args.commit_limit || 10;
      const [repoResponse, issuesResponse, pullsResponse, commitsResponse] = await Promise.all([
        giteaRequest(repoRoute(args.owner, args.repo)),
        giteaRequest(repoRoute(args.owner, args.repo, "/issues"), {
          query: { state: "open", type: "issues", limit: issueLimit }
        }),
        giteaRequest(repoRoute(args.owner, args.repo, "/pulls"), {
          query: { state: "open", limit: prLimit }
        }),
        giteaRequest(repoRoute(args.owner, args.repo, "/commits"), {
          query: { limit: commitLimit }
        })
      ]);
      const labelsResponse =
        args.include_labels === false
          ? { data: undefined }
          : await giteaRequest(repoRoute(args.owner, args.repo, "/labels"), {
              query: { limit: 100 }
            });

      return publicResponse({
        status: 200,
        data: {
          repository: compactRepository(repoResponse.data),
          open_issues: Array.isArray(issuesResponse.data)
            ? issuesResponse.data.map((issue) => compactIssue(issue, { previewChars }))
            : issuesResponse.data,
          open_pull_requests: Array.isArray(pullsResponse.data)
            ? pullsResponse.data.map((pull) => compactPullRequest(pull, { previewChars }))
            : pullsResponse.data,
          recent_commits: Array.isArray(commitsResponse.data)
            ? commitsResponse.data.map(compactCommit)
            : commitsResponse.data,
          labels: Array.isArray(labelsResponse.data) ? labelsResponse.data.map(compactLabel) : labelsResponse.data
        }
      });
    }
  },
  {
    name: "gitea_list_repository_contents",
    title: "List Repository Contents",
    description: "List files or directories at a path using Gitea's repository contents API.",
    inputSchema: objectSchema(
      {
        ...repoProperties,
        path: { type: "string", description: "Directory or file path. Empty means repository root." },
        ref: { type: "string", description: "Branch, tag, or commit SHA." }
      },
      ["owner", "repo"]
    ),
    handler: async (args) =>
      publicResponse(
        await giteaRequest(contentRoute(args.owner, args.repo, args.path || ""), {
          query: { ref: args.ref }
        })
      )
  },
  {
    name: "gitea_get_file",
    title: "Get Repository File",
    description: "Read a repository file and decode base64 content when Gitea returns file content.",
    inputSchema: objectSchema(
      {
        ...repoProperties,
        path: { type: "string", description: "File path to read." },
        ref: { type: "string", description: "Branch, tag, or commit SHA." }
      },
      ["owner", "repo", "path"]
    ),
    handler: async (args) => {
      const response = await giteaRequest(contentRoute(args.owner, args.repo, args.path), {
        query: { ref: args.ref }
      });
      return publicResponse({ ...response, data: decodeGiteaContent(response.data) });
    }
  },
  {
    name: "gitea_get_repository_tree",
    title: "Get Repository Tree",
    description: "Read a Git tree for a branch, tag, or commit SHA. Defaults to the repository default branch.",
    inputSchema: objectSchema(
      {
        ...repoProperties,
        ref: { type: "string", description: "Branch, tag, or commit SHA. Defaults to default_branch." },
        recursive: { type: "boolean", description: "Return recursive tree entries." },
        ...paginationProperties
      },
      ["owner", "repo"]
    ),
    handler: async (args) => {
      const ref = args.ref || (await getDefaultBranch(args.owner, args.repo));
      return publicResponse(
        await giteaRequest(repoRoute(args.owner, args.repo, `/git/trees/${encodeSegment(ref, "ref")}`), {
          query: {
            recursive: args.recursive,
            page: args.page,
            limit: args.limit
          }
        })
      );
    }
  },
  {
    name: "gitea_create_or_update_file",
    title: "Create Or Update Repository File",
    description: "Create or update a repository file through Gitea's contents API.",
    inputSchema: objectSchema(
      {
        ...repoProperties,
        path: { type: "string", description: "File path to create or update." },
        content: { type: "string", description: "File content. UTF-8 by default." },
        content_is_base64: {
          type: "boolean",
          description: "Set true when content is already base64 encoded."
        },
        message: { type: "string", description: "Commit message." },
        branch: { type: "string", description: "Target branch." },
        new_branch: { type: "string", description: "Optional branch to create from branch." },
        sha: {
          type: "string",
          description: "Current file blob SHA. Required by Gitea when updating an existing file."
        },
        author: personSchema("Commit author."),
        committer: personSchema("Commit committer.")
      },
      ["owner", "repo", "path", "content", "message"]
    ),
    handler: async (args) => {
      const body = {
        message: args.message,
        content: args.content_is_base64 ? args.content : toBase64(args.content),
        branch: args.branch,
        new_branch: args.new_branch,
        sha: args.sha,
        author: args.author,
        committer: args.committer
      };
      return publicResponse(
        await giteaRequest(contentRoute(args.owner, args.repo, args.path), {
          method: "PUT",
          body: pruneUndefined(body)
        })
      );
    }
  },
  {
    name: "gitea_delete_file",
    title: "Delete Repository File",
    description: "Delete a repository file through Gitea's contents API.",
    inputSchema: objectSchema(
      {
        ...repoProperties,
        path: { type: "string", description: "File path to delete." },
        sha: { type: "string", description: "Current file blob SHA." },
        message: { type: "string", description: "Commit message." },
        branch: { type: "string", description: "Target branch." },
        new_branch: { type: "string", description: "Optional branch to create from branch." },
        author: personSchema("Commit author."),
        committer: personSchema("Commit committer.")
      },
      ["owner", "repo", "path", "sha", "message"]
    ),
    handler: async (args) =>
      publicResponse(
        await giteaRequest(contentRoute(args.owner, args.repo, args.path), {
          method: "DELETE",
          body: pruneUndefined({
            message: args.message,
            sha: args.sha,
            branch: args.branch,
            new_branch: args.new_branch,
            author: args.author,
            committer: args.committer
          })
        })
      )
  },
  {
    name: "gitea_list_issues",
    title: "List Gitea Issues",
    description: "List repository issues and filter by state, labels, assignees, dates, or issue type.",
    inputSchema: objectSchema(
      {
        ...repoProperties,
        state: {
          type: "string",
          enum: ["open", "closed", "all"],
          description: "Issue state."
        },
        type: {
          type: "string",
          enum: ["issues", "pulls"],
          description: "Issue listing type supported by Gitea."
        },
        labels: { type: "string", description: "Comma-separated label names." },
        q: { type: "string", description: "Search query." },
        milestones: { type: "string", description: "Comma-separated milestone names." },
        since: { type: "string", description: "Only issues updated after this RFC3339 timestamp." },
        before: { type: "string", description: "Only issues updated before this RFC3339 timestamp." },
        created_by: { type: "string", description: "Username of creator." },
        assigned_by: { type: "string", description: "Username of assignee." },
        mentioned_by: { type: "string", description: "Username mentioned in issue." },
        ...bodyControlProperties,
        ...paginationProperties
      },
      ["owner", "repo"]
    ),
    handler: async (args) =>
      shapeIssueListResponse(
        await giteaRequest(repoRoute(args.owner, args.repo, "/issues"), {
          query: omitKeys(args, ["owner", "repo", "include_body", "body_preview_chars"])
        }),
        args
      )
  },
  {
    name: "gitea_get_issue",
    title: "Get Gitea Issue",
    description: "Return a single Gitea issue by repository-local issue index.",
    inputSchema: objectSchema(
      {
        ...repoProperties,
        index: { type: "integer", minimum: 1, description: "Repository-local issue index." }
      },
      ["owner", "repo", "index"]
    ),
    handler: async (args) =>
      publicResponse(await giteaRequest(repoRoute(args.owner, args.repo, `/issues/${args.index}`)))
  },
  {
    name: "gitea_create_issue",
    title: "Create Gitea Issue",
    description: "Create a Gitea issue in a repository.",
    inputSchema: objectSchema(
      {
        ...repoProperties,
        title: { type: "string", description: "Issue title." },
        body: { type: "string", description: "Issue body." },
        assignee: { type: "string", description: "Single assignee username." },
        assignees: {
          type: "array",
          items: { type: "string" },
          description: "Assignee usernames."
        },
        labels: {
          type: "array",
          items: { type: "integer" },
          description: "Label ids."
        },
        milestone: { type: "integer", description: "Milestone id." },
        due_date: { type: "string", description: "Due date in RFC3339 format." }
      },
      ["owner", "repo", "title"]
    ),
    handler: async (args) =>
      publicResponse(
        await giteaRequest(repoRoute(args.owner, args.repo, "/issues"), {
          method: "POST",
          body: pruneUndefined(omitRepoArgs(args))
        })
      )
  },
  {
    name: "gitea_update_issue",
    title: "Update Gitea Issue",
    description: "Update a Gitea issue title, body, state, assignees, milestone, ref, or due date.",
    inputSchema: objectSchema(
      {
        ...repoProperties,
        index: { type: "integer", minimum: 1, description: "Repository-local issue index." },
        title: { type: "string", description: "Issue title." },
        body: { type: "string", description: "Issue body." },
        state: {
          type: "string",
          enum: ["open", "closed"],
          description: "Issue state."
        },
        assignee: { type: "string", description: "Deprecated single assignee username." },
        assignees: {
          type: "array",
          items: { type: "string" },
          description: "Assignee usernames."
        },
        milestone: { type: "integer", description: "Milestone id." },
        due_date: { type: "string", description: "Due date in RFC3339 format." },
        unset_due_date: { type: "boolean", description: "Unset the due date." },
        ref: { type: "string", description: "Issue ref." },
        content_version: {
          type: "integer",
          description: "Current issue content version for edit conflict detection."
        }
      },
      ["owner", "repo", "index"]
    ),
    handler: async (args) =>
      publicResponse(
        await giteaRequest(repoRoute(args.owner, args.repo, `/issues/${args.index}`), {
          method: "PATCH",
          body: pruneUndefined(omitKeys(args, ["owner", "repo", "index"]))
        })
      )
  },
  {
    name: "gitea_list_labels",
    title: "List Gitea Labels",
    description: "List labels for a repository.",
    inputSchema: objectSchema(
      {
        ...repoProperties,
        ...paginationProperties
      },
      ["owner", "repo"]
    ),
    handler: async (args) =>
      publicResponse(
        await giteaRequest(repoRoute(args.owner, args.repo, "/labels"), {
          query: { page: args.page, limit: args.limit }
        })
      )
  },
  {
    name: "gitea_create_label",
    title: "Create Gitea Label",
    description: "Create a repository label.",
    inputSchema: objectSchema(
      {
        ...repoProperties,
        name: { type: "string", description: "Label name." },
        color: { type: "string", description: "Label color, for example #00aabb." },
        description: { type: "string", description: "Label description." },
        exclusive: { type: "boolean", description: "Whether the label is exclusive." },
        is_archived: { type: "boolean", description: "Whether the label is archived." }
      },
      ["owner", "repo", "name", "color"]
    ),
    handler: async (args) =>
      publicResponse(
        await giteaRequest(repoRoute(args.owner, args.repo, "/labels"), {
          method: "POST",
          body: pruneUndefined(omitRepoArgs(args))
        })
      )
  },
  {
    name: "gitea_add_issue_labels",
    title: "Add Issue Labels",
    description: "Add label ids to a Gitea issue.",
    inputSchema: objectSchema(
      {
        ...repoProperties,
        index: { type: "integer", minimum: 1, description: "Repository-local issue index." },
        labels: {
          type: "array",
          items: { type: "integer" },
          description: "Label ids."
        }
      },
      ["owner", "repo", "index", "labels"]
    ),
    handler: async (args) =>
      publicResponse(
        await giteaRequest(repoRoute(args.owner, args.repo, `/issues/${args.index}/labels`), {
          method: "POST",
          body: { labels: args.labels }
        })
      )
  },
  {
    name: "gitea_create_bundled_issue",
    title: "Create Bundled Findings Issue",
    description: "Create one Gitea issue that bundles multiple findings with consistent Markdown formatting.",
    inputSchema: objectSchema(
      {
        ...repoProperties,
        title: { type: "string", description: "Issue title." },
        intro: { type: "string", description: "Introductory Markdown before the findings." },
        footer: { type: "string", description: "Closing Markdown after the findings." },
        findings: {
          type: "array",
          description: "Findings to bundle into the issue.",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              severity: { type: "string" },
              location: { type: "string" },
              description: { type: "string" },
              evidence: { type: "string" },
              recommendation: { type: "string" }
            },
            required: ["title"],
            additionalProperties: false
          }
        },
        labels: {
          type: "array",
          items: { type: "integer" },
          description: "Optional label ids to apply after creating the issue."
        },
        assignee: { type: "string", description: "Single assignee username." },
        assignees: {
          type: "array",
          items: { type: "string" },
          description: "Assignee usernames."
        },
        milestone: { type: "integer", description: "Milestone id." },
        due_date: { type: "string", description: "Due date in RFC3339 format." }
      },
      ["owner", "repo", "title", "findings"]
    ),
    handler: async (args) => {
      const issue = await giteaRequest(repoRoute(args.owner, args.repo, "/issues"), {
        method: "POST",
        body: pruneUndefined({
          title: args.title,
          body: formatBundledIssueBody(args),
          assignee: args.assignee,
          assignees: args.assignees,
          milestone: args.milestone,
          due_date: args.due_date
        })
      });

      let labels = null;
      if (Array.isArray(args.labels) && args.labels.length > 0) {
        labels = await giteaRequest(
          repoRoute(args.owner, args.repo, `/issues/${issue.data.number || issue.data.index}/labels`),
          {
            method: "POST",
            body: { labels: args.labels }
          }
        );
      }

      return publicResponse({
        status: issue.status,
        data: {
          issue: compactIssue(issue.data, { includeBody: true, previewChars: 2000 }),
          labels: labels?.data
        }
      });
    }
  },
  {
    name: "gitea_list_issue_comments",
    title: "List Issue Comments",
    description: "List comments for a Gitea issue or pull request by issue index.",
    inputSchema: objectSchema(
      {
        ...repoProperties,
        index: { type: "integer", minimum: 1, description: "Repository-local issue index." },
        since: { type: "string", description: "Only comments updated after this RFC3339 timestamp." },
        before: { type: "string", description: "Only comments updated before this RFC3339 timestamp." },
        ...paginationProperties
      },
      ["owner", "repo", "index"]
    ),
    handler: async (args) =>
      publicResponse(
        await giteaRequest(repoRoute(args.owner, args.repo, `/issues/${args.index}/comments`), {
          query: {
            since: args.since,
            before: args.before,
            page: args.page,
            limit: args.limit
          }
        })
      )
  },
  {
    name: "gitea_create_issue_comment",
    title: "Create Issue Comment",
    description: "Create a comment on a Gitea issue or pull request.",
    inputSchema: objectSchema(
      {
        ...repoProperties,
        index: { type: "integer", minimum: 1, description: "Repository-local issue index." },
        body: { type: "string", description: "Comment body." }
      },
      ["owner", "repo", "index", "body"]
    ),
    handler: async (args) =>
      publicResponse(
        await giteaRequest(repoRoute(args.owner, args.repo, `/issues/${args.index}/comments`), {
          method: "POST",
          body: { body: args.body }
        })
      )
  },
  {
    name: "gitea_list_pull_requests",
    title: "List Gitea Pull Requests",
    description: "List repository pull requests.",
    inputSchema: objectSchema(
      {
        ...repoProperties,
        state: {
          type: "string",
          enum: ["open", "closed", "all"],
          description: "Pull request state."
        },
        sort: { type: "string", description: "Sort field supported by Gitea." },
        milestone: { type: "integer", description: "Milestone id." },
        labels: { type: "string", description: "Comma-separated labels." },
        ...bodyControlProperties,
        ...paginationProperties
      },
      ["owner", "repo"]
    ),
    handler: async (args) =>
      shapePullListResponse(
        await giteaRequest(repoRoute(args.owner, args.repo, "/pulls"), {
          query: omitKeys(args, ["owner", "repo", "include_body", "body_preview_chars"])
        }),
        args
      )
  },
  {
    name: "gitea_get_pull_request",
    title: "Get Gitea Pull Request",
    description: "Return a single pull request by repository-local index.",
    inputSchema: objectSchema(
      {
        ...repoProperties,
        index: { type: "integer", minimum: 1, description: "Repository-local pull request index." }
      },
      ["owner", "repo", "index"]
    ),
    handler: async (args) =>
      publicResponse(await giteaRequest(repoRoute(args.owner, args.repo, `/pulls/${args.index}`)))
  },
  {
    name: "gitea_list_pull_request_files",
    title: "List Pull Request Files",
    description: "List files changed by a pull request.",
    inputSchema: objectSchema(
      {
        ...repoProperties,
        index: { type: "integer", minimum: 1, description: "Repository-local pull request index." },
        ...paginationProperties
      },
      ["owner", "repo", "index"]
    ),
    handler: async (args) =>
      publicResponse(
        await giteaRequest(repoRoute(args.owner, args.repo, `/pulls/${args.index}/files`), {
          query: { page: args.page, limit: args.limit }
        })
      )
  },
  {
    name: "gitea_pr_review_context",
    title: "Get Pull Request Review Context",
    description: "Fetch a compact review context for a pull request: PR metadata, changed files, commits, and issue comments.",
    inputSchema: objectSchema(
      {
        ...repoProperties,
        index: { type: "integer", minimum: 1, description: "Repository-local pull request index." },
        include_files: { type: "boolean", description: "Include changed files. Defaults to true." },
        include_commits: { type: "boolean", description: "Include commits. Defaults to true." },
        include_comments: { type: "boolean", description: "Include issue comments. Defaults to true." },
        file_limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Maximum changed files to include."
        },
        commit_limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Maximum commits to include."
        },
        comment_limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Maximum comments to include."
        },
        ...bodyControlProperties
      },
      ["owner", "repo", "index"]
    ),
    handler: async (args) => {
      const includeFiles = args.include_files !== false;
      const includeCommits = args.include_commits !== false;
      const includeComments = args.include_comments !== false;
      const previewChars = previewLength(args);
      const prResponse = await giteaRequest(repoRoute(args.owner, args.repo, `/pulls/${args.index}`));
      const data = {
        pull_request: compactPullRequest(prResponse.data, {
          includeBody: true,
          previewChars
        })
      };

      if (includeFiles) {
        const files = await giteaRequest(repoRoute(args.owner, args.repo, `/pulls/${args.index}/files`), {
          query: { limit: args.file_limit || 100 }
        });
        data.files = Array.isArray(files.data)
          ? files.data.slice(0, args.file_limit || 100).map(compactFileChange)
          : files.data;
      }

      if (includeCommits) {
        const commits = await giteaRequest(repoRoute(args.owner, args.repo, `/pulls/${args.index}/commits`), {
          query: { limit: args.commit_limit || 100 }
        });
        data.commits = Array.isArray(commits.data)
          ? commits.data.slice(0, args.commit_limit || 100).map(compactCommit)
          : commits.data;
      }

      if (includeComments) {
        const comments = await giteaRequest(repoRoute(args.owner, args.repo, `/issues/${args.index}/comments`), {
          query: { limit: args.comment_limit || 100 }
        });
        data.comments = Array.isArray(comments.data)
          ? comments.data.slice(0, args.comment_limit || 100).map((comment) =>
              compactComment(comment, { previewChars })
            )
          : comments.data;
      }

      return publicResponse({ status: 200, data });
    }
  },
  {
    name: "gitea_create_pull_request",
    title: "Create Gitea Pull Request",
    description: "Create a pull request in a Gitea repository.",
    inputSchema: objectSchema(
      {
        ...repoProperties,
        title: { type: "string", description: "Pull request title." },
        head: { type: "string", description: "Head branch or owner:branch." },
        base: { type: "string", description: "Base branch." },
        body: { type: "string", description: "Pull request body." },
        assignee: { type: "string", description: "Single assignee username." },
        assignees: {
          type: "array",
          items: { type: "string" },
          description: "Assignee usernames."
        },
        labels: {
          type: "array",
          items: { type: "integer" },
          description: "Label ids."
        },
        milestone: { type: "integer", description: "Milestone id." },
        due_date: { type: "string", description: "Due date in RFC3339 format." }
      },
      ["owner", "repo", "title", "head", "base"]
    ),
    handler: async (args) =>
      publicResponse(
        await giteaRequest(repoRoute(args.owner, args.repo, "/pulls"), {
          method: "POST",
          body: pruneUndefined(omitRepoArgs(args))
        })
      )
  },
  {
    name: "gitea_merge_pull_request",
    title: "Merge Gitea Pull Request",
    description: "Merge a pull request using Gitea's pull merge API.",
    inputSchema: objectSchema(
      {
        ...repoProperties,
        index: { type: "integer", minimum: 1, description: "Repository-local pull request index." },
        do: {
          type: "string",
          enum: ["merge", "rebase", "rebase-merge", "squash", "fast-forward-only", "manually-merged"],
          description: "Merge method."
        },
        merge_title_field: { type: "string", description: "Merge commit title." },
        merge_message_field: { type: "string", description: "Merge commit message." },
        delete_branch_after_merge: {
          type: "boolean",
          description: "Delete source branch after merge."
        },
        force_merge: { type: "boolean", description: "Force merge when Gitea allows it." }
      },
      ["owner", "repo", "index", "do"]
    ),
    handler: async (args) =>
      publicResponse(
        await giteaRequest(repoRoute(args.owner, args.repo, `/pulls/${args.index}/merge`), {
          method: "POST",
          body: pruneUndefined(omitRepoArgs(args))
        })
      )
  },
  {
    name: "gitea_list_branches",
    title: "List Gitea Branches",
    description: "List repository branches.",
    inputSchema: objectSchema(
      {
        ...repoProperties,
        ...paginationProperties
      },
      ["owner", "repo"]
    ),
    handler: async (args) =>
      publicResponse(
        await giteaRequest(repoRoute(args.owner, args.repo, "/branches"), {
          query: { page: args.page, limit: args.limit }
        })
      )
  },
  {
    name: "gitea_get_branch",
    title: "Get Gitea Branch",
    description: "Return branch metadata and the current commit for a branch.",
    inputSchema: objectSchema(
      {
        ...repoProperties,
        branch: { type: "string", description: "Branch name." }
      },
      ["owner", "repo", "branch"]
    ),
    handler: async (args) =>
      publicResponse(
        await giteaRequest(
          repoRoute(args.owner, args.repo, `/branches/${encodeSegment(args.branch, "branch")}`)
        )
      )
  },
  {
    name: "gitea_list_commits",
    title: "List Gitea Commits",
    description: "List commits for a repository, branch, tag, commit SHA, or path.",
    inputSchema: objectSchema(
      {
        ...repoProperties,
        sha: { type: "string", description: "Branch, tag, or commit SHA." },
        path: { type: "string", description: "Path to filter commits." },
        stat: { type: "boolean", description: "Include commit stats when supported." },
        verification: { type: "boolean", description: "Include verification when supported." },
        files: { type: "boolean", description: "Include files when supported." },
        ...paginationProperties
      },
      ["owner", "repo"]
    ),
    handler: async (args) =>
      publicResponse(
        await giteaRequest(repoRoute(args.owner, args.repo, "/commits"), {
          query: omitRepoArgs(args)
        })
      )
  },
  {
    name: "gitea_get_commit",
    title: "Get Gitea Commit",
    description: "Return a repository commit by SHA.",
    inputSchema: objectSchema(
      {
        ...repoProperties,
        sha: { type: "string", description: "Commit SHA." }
      },
      ["owner", "repo", "sha"]
    ),
    handler: async (args) =>
      publicResponse(
        await giteaRequest(repoRoute(args.owner, args.repo, `/git/commits/${encodeSegment(args.sha, "sha")}`))
      )
  },
  {
    name: "gitea_sync_github_repo_to_gitea",
    title: "Sync GitHub Repository To Gitea",
    description: "Start a Gitea repository migration from a GitHub repository or arbitrary clone URL.",
    inputSchema: objectSchema(
      {
        github_repository: {
          type: "string",
          description: "GitHub repository in owner/name form. Used to derive clone_addr when clone_addr is omitted."
        },
        clone_addr: { type: "string", description: "Source Git clone URL." },
        repo_name: { type: "string", description: "Target Gitea repository name." },
        repo_owner: { type: "string", description: "Target Gitea user or organization owner." },
        description: { type: "string", description: "Target repository description." },
        private: { type: "boolean", description: "Whether the target repository should be private." },
        mirror: { type: "boolean", description: "Create a mirror repository." },
        mirror_interval: { type: "string", description: "Mirror interval, for example 8h." },
        service: {
          type: "string",
          enum: ["git", "github", "gitea", "gitlab", "gogs", "onedev", "gitbucket", "codebase", "codecommit"],
          description: "Source service. Defaults to github when github_repository is provided, otherwise git."
        },
        auth_username: { type: "string", description: "Optional source username for private source repositories." },
        auth_token: { type: "string", description: "Optional source token for private source repositories." },
        issues: { type: "boolean", description: "Migrate issues when supported." },
        labels: { type: "boolean", description: "Migrate labels when supported." },
        milestones: { type: "boolean", description: "Migrate milestones when supported." },
        pull_requests: { type: "boolean", description: "Migrate pull requests when supported." },
        releases: { type: "boolean", description: "Migrate releases when supported." },
        wiki: { type: "boolean", description: "Migrate wiki when supported." },
        lfs: { type: "boolean", description: "Migrate LFS objects when supported." }
      },
      ["repo_name"]
    ),
    handler: async (args) => {
      const cloneAddr = args.clone_addr || githubCloneUrl(args.github_repository);
      if (!cloneAddr) {
        throw new Error("gitea_sync_github_repo_to_gitea requires clone_addr or github_repository.");
      }
      return publicResponse(
        await giteaRequest("/repos/migrate", {
          method: "POST",
          body: pruneUndefined({
            clone_addr: cloneAddr,
            repo_name: args.repo_name,
            repo_owner: args.repo_owner,
            description: args.description,
            private: args.private,
            mirror: args.mirror,
            mirror_interval: args.mirror_interval,
            service: args.service || (args.github_repository ? "github" : "git"),
            auth_username: args.auth_username,
            auth_token: args.auth_token,
            issues: args.issues,
            labels: args.labels,
            milestones: args.milestones,
            pull_requests: args.pull_requests,
            releases: args.releases,
            wiki: args.wiki,
            lfs: args.lfs
          })
        })
      );
    }
  },
  {
    name: "gitea_deploy_current_repo",
    title: "Deploy Local Git Repository To Gitea",
    description: "Create or reuse a Gitea repository, configure a local Git remote, and push a local branch over HTTPS.",
    inputSchema: objectSchema(
      {
        local_path: {
          type: "string",
          description: "Path inside the local Git repository to deploy. Required because plugin servers may start outside the user's project."
        },
        owner: { type: "string", description: "Target Gitea owner or organization." },
        repo: { type: "string", description: "Target Gitea repository name." },
        description: { type: "string", description: "Repository description when create_repository is true." },
        private: { type: "boolean", description: "Whether a newly created repository should be private." },
        create_repository: {
          type: "boolean",
          description: "Create the target repository if it does not exist."
        },
        remote_name: { type: "string", description: "Local Git remote name. Defaults to gitea." },
        branch: { type: "string", description: "Local branch to push. Defaults to current branch." },
        target_branch: { type: "string", description: "Target branch name on Gitea. Defaults to branch." },
        set_upstream: {
          type: "boolean",
          description: "Set the local branch upstream to the Gitea remote after pushing."
        },
        force_with_lease: { type: "boolean", description: "Use git push --force-with-lease." },
        username: {
          type: "string",
          description: "HTTP username for git push. Defaults to authenticated Gitea username."
        }
      },
      ["local_path", "owner", "repo"]
    ),
    handler: async (args) => deployLocalRepository(args)
  },
  {
    name: "gitea_api_get",
    title: "Call Gitea GET API",
    description: "Call any relative GET route under /api/v1 on the configured Gitea instance.",
    inputSchema: objectSchema(
      {
        route: {
          type: "string",
          description: "Relative Gitea API route, for example /repos/{owner}/{repo}/labels."
        },
        query: {
          type: "object",
          description: "Query parameters to append to the request.",
          additionalProperties: true
        }
      },
      ["route"]
    ),
    handler: async (args) =>
      publicResponse(await giteaRequest(args.route, { method: "GET", query: args.query || {} }))
  },
  {
    name: "gitea_api_request",
    title: "Call Gitea API",
    description: "Call any relative route under /api/v1 using GET, POST, PUT, PATCH, or DELETE.",
    inputSchema: objectSchema(
      {
        method: {
          type: "string",
          enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
          description: "HTTP method."
        },
        route: {
          type: "string",
          description: "Relative Gitea API route, for example /repos/{owner}/{repo}/labels."
        },
        query: {
          type: "object",
          description: "Query parameters to append to the request.",
          additionalProperties: true
        },
        body: {
          description: "JSON body for write requests."
        }
      },
      ["method", "route"]
    ),
    handler: async (args) =>
      publicResponse(
        await giteaRequest(args.route, {
          method: args.method,
          query: args.query || {},
          body: args.body
        })
      )
  }
];

export function toolDescriptors() {
  return tools.map(({ name, title, description, inputSchema }) => ({
    name,
    title,
    description,
    inputSchema
  }));
}

export async function callTool(name, args = {}) {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return tool.handler(args || {});
}

function shapeIssueListResponse(response, args = {}) {
  if (!Array.isArray(response.data)) {
    return publicResponse(response);
  }

  return publicResponse({
    ...response,
    data: response.data.map((issue) =>
      applyBodyControls(issue, {
        includeBody: args.include_body === true,
        previewChars: previewLength(args)
      })
    )
  });
}

function shapePullListResponse(response, args = {}) {
  if (!Array.isArray(response.data)) {
    return publicResponse(response);
  }

  return publicResponse({
    ...response,
    data: response.data.map((pull) =>
      applyBodyControls(pull, {
        includeBody: args.include_body === true,
        previewChars: previewLength(args)
      })
    )
  });
}

function applyBodyControls(item, options = {}) {
  if (!item || typeof item !== "object") {
    return item;
  }

  const { body, ...rest } = item;
  const result = { ...rest };
  attachBody(result, body, options);
  return result;
}

function compactRepository(repo) {
  if (!repo || typeof repo !== "object") {
    return repo;
  }

  return {
    id: repo.id,
    name: repo.name,
    full_name: repo.full_name,
    description: repo.description,
    html_url: repo.html_url,
    clone_url: repo.clone_url,
    ssh_url: repo.ssh_url,
    private: repo.private,
    fork: repo.fork,
    mirror: repo.mirror,
    archived: repo.archived,
    empty: repo.empty,
    default_branch: repo.default_branch,
    open_issues_count: repo.open_issues_count,
    stars_count: repo.stars_count,
    forks_count: repo.forks_count,
    updated_at: repo.updated_at,
    permissions: repo.permissions
  };
}

function compactIssue(issue, options = {}) {
  if (!issue || typeof issue !== "object") {
    return issue;
  }

  const result = {
    id: issue.id,
    index: issue.number ?? issue.index,
    title: issue.title,
    state: issue.state,
    user: compactUser(issue.user),
    labels: Array.isArray(issue.labels) ? issue.labels.map(compactLabel) : issue.labels,
    assignees: Array.isArray(issue.assignees) ? issue.assignees.map(compactUser) : issue.assignees,
    milestone: issue.milestone
      ? {
          id: issue.milestone.id,
          title: issue.milestone.title,
          state: issue.milestone.state
        }
      : null,
    comments: issue.comments,
    html_url: issue.html_url,
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    closed_at: issue.closed_at
  };

  attachBody(result, issue.body, options);
  return result;
}

function compactPullRequest(pull, options = {}) {
  if (!pull || typeof pull !== "object") {
    return pull;
  }

  const result = {
    id: pull.id,
    index: pull.number ?? pull.index,
    title: pull.title,
    state: pull.state,
    user: compactUser(pull.user),
    html_url: pull.html_url,
    mergeable: pull.mergeable,
    merged: pull.merged,
    draft: pull.draft,
    head: compactPrBranch(pull.head),
    base: compactPrBranch(pull.base),
    labels: Array.isArray(pull.labels) ? pull.labels.map(compactLabel) : pull.labels,
    assignees: Array.isArray(pull.assignees) ? pull.assignees.map(compactUser) : pull.assignees,
    comments: pull.comments,
    created_at: pull.created_at,
    updated_at: pull.updated_at,
    closed_at: pull.closed_at,
    merged_at: pull.merged_at
  };

  attachBody(result, pull.body, options);
  return result;
}

function compactPrBranch(branch) {
  if (!branch || typeof branch !== "object") {
    return branch;
  }

  return {
    label: branch.label,
    ref: branch.ref,
    sha: branch.sha,
    repo: branch.repo ? compactRepository(branch.repo) : undefined
  };
}

function compactCommit(commit) {
  if (!commit || typeof commit !== "object") {
    return commit;
  }

  return {
    sha: commit.sha,
    html_url: commit.html_url,
    message: commit.commit?.message,
    author: commit.commit?.author || commit.author,
    committer: commit.commit?.committer || commit.committer,
    stats: commit.stats
  };
}

function compactFileChange(file) {
  if (!file || typeof file !== "object") {
    return file;
  }

  return {
    filename: file.filename,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    changes: file.changes,
    previous_filename: file.previous_filename,
    sha: file.sha,
    patch: file.patch
  };
}

function compactComment(comment, options = {}) {
  if (!comment || typeof comment !== "object") {
    return comment;
  }

  const result = {
    id: comment.id,
    html_url: comment.html_url,
    user: compactUser(comment.user),
    created_at: comment.created_at,
    updated_at: comment.updated_at
  };
  attachBody(result, comment.body, options);
  return result;
}

function compactUser(user) {
  if (!user || typeof user !== "object") {
    return user;
  }

  return {
    id: user.id,
    login: user.login ?? user.username,
    username: user.username,
    full_name: user.full_name,
    html_url: user.html_url
  };
}

function compactLabel(label) {
  if (!label || typeof label !== "object") {
    return label;
  }

  return {
    id: label.id,
    name: label.name,
    color: label.color,
    description: label.description,
    exclusive: label.exclusive,
    is_archived: label.is_archived
  };
}

function attachBody(target, body, options = {}) {
  if (options.includeBody === true) {
    target.body = body || "";
    return;
  }

  if (body) {
    target.body_preview = previewText(body, options.previewChars);
  }
}

function previewText(value, length = 280) {
  if (!value || length <= 0) {
    return "";
  }

  const compact = String(value).replace(/\s+/g, " ").trim();
  return compact.length > length ? `${compact.slice(0, length)}...` : compact;
}

function previewLength(args = {}) {
  return Number.isInteger(args.body_preview_chars) ? args.body_preview_chars : 280;
}

function formatBundledIssueBody(args) {
  const lines = [];
  if (args.intro) {
    lines.push(args.intro.trim(), "");
  }

  lines.push("## Findings", "");
  for (const [index, finding] of args.findings.entries()) {
    lines.push(`### ${index + 1}. ${finding.title}`);
    if (finding.severity) {
      lines.push(`- Severity: ${finding.severity}`);
    }
    if (finding.location) {
      lines.push(`- Location: ${finding.location}`);
    }
    if (finding.description) {
      lines.push("", finding.description.trim());
    }
    if (finding.evidence) {
      lines.push("", "Evidence:", "", finding.evidence.trim());
    }
    if (finding.recommendation) {
      lines.push("", "Recommendation:", "", finding.recommendation.trim());
    }
    lines.push("");
  }

  if (args.footer) {
    lines.push(args.footer.trim(), "");
  }

  return lines.join("\n").trimEnd();
}

function githubCloneUrl(repository) {
  if (!repository) {
    return "";
  }
  if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) {
    throw new Error("github_repository must use owner/name format.");
  }
  return `https://github.com/${repository}.git`;
}

async function deployLocalRepository(args) {
  const config = getGiteaConfig();
  if (!config.token) {
    throw new Error("gitea_deploy_current_repo requires GITEA_TOKEN, GITEA_ACCESS_TOKEN, or GITEA_API_TOKEN.");
  }

  let repository;
  const username = args.username || (await getAuthenticatedUsername());
  try {
    repository = await giteaRequest(repoRoute(args.owner, args.repo));
  } catch (error) {
    if (error.status !== 404 || args.create_repository !== true) {
      throw error;
    }
    const createRoute =
      args.owner === username ? "/user/repos" : `/orgs/${encodeSegment(args.owner, "owner")}/repos`;
    repository = await giteaRequest(createRoute, {
      method: "POST",
      body: pruneUndefined({
        name: args.repo,
        description: args.description,
        private: args.private,
        auto_init: false,
        default_branch: args.target_branch || args.branch || "main"
      })
    });
  }

  const localPath = args.local_path;
  const remoteName = args.remote_name || "gitea";
  const cloneUrl = repository.data.clone_url || `${config.baseUrl}/${args.owner}/${args.repo}.git`;
  const topLevel = (await runGit(localPath, ["rev-parse", "--show-toplevel"])).stdout.trim();
  const branch =
    args.branch || (await runGit(topLevel, ["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim();
  if (!branch || branch === "HEAD") {
    throw new Error("Unable to infer a local branch. Pass branch explicitly.");
  }

  const remotes = (await runGit(topLevel, ["remote"])).stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (remotes.includes(remoteName)) {
    await runGit(topLevel, ["remote", "set-url", remoteName, cloneUrl]);
  } else {
    await runGit(topLevel, ["remote", "add", remoteName, cloneUrl]);
  }

  const pushArgs = ["push"];
  if (args.force_with_lease === true) {
    pushArgs.push("--force-with-lease");
  }
  if (args.set_upstream === true) {
    pushArgs.push("-u");
  }
  pushArgs.push(remoteName, `${branch}:${args.target_branch || branch}`);

  const askpassDir = await mkdtemp(join(tmpdir(), "gitea-askpass-"));
  const askpassPath = join(askpassDir, "askpass.sh");
  await writeFile(
    askpassPath,
    [
      "#!/bin/sh",
      "case \"$1\" in",
      "  *Username*) printf '%s\\n' \"$GITEA_GIT_USER\" ;;",
      "  *) printf '%s\\n' \"$GITEA_GIT_TOKEN\" ;;",
      "esac",
      ""
    ].join("\n")
  );
  await chmod(askpassPath, 0o700);

  try {
    const push = await runGit(topLevel, pushArgs, {
      env: {
        GITEA_GIT_USER: username,
        GITEA_GIT_TOKEN: config.token,
        GIT_ASKPASS: askpassPath,
        GIT_TERMINAL_PROMPT: "0"
      }
    });
    const commit = (await runGit(topLevel, ["rev-parse", branch])).stdout.trim();
    return publicResponse({
      status: 200,
      data: {
        repository: compactRepository(repository.data),
        local_path: topLevel,
        remote_name: remoteName,
        remote_url: cloneUrl,
        branch,
        target_branch: args.target_branch || branch,
        commit,
        stdout: push.stdout,
        stderr: push.stderr
      }
    });
  } finally {
    await rm(askpassDir, { recursive: true, force: true });
  }
}

async function getAuthenticatedUsername() {
  const response = await giteaRequest("/user");
  return response.data?.login || response.data?.username || response.data?.name || "git";
}

async function runGit(cwd, args, options = {}) {
  const result = await execFileAsync("git", ["-C", cwd, ...args], {
    env: { ...process.env, ...(options.env || {}) },
    maxBuffer: 1024 * 1024 * 20
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function objectSchema(properties, required) {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false
  };
}

function personSchema(description) {
  return {
    type: "object",
    description,
    properties: {
      name: { type: "string" },
      email: { type: "string" }
    },
    required: ["name", "email"],
    additionalProperties: false
  };
}

function pruneUndefined(value) {
  if (Array.isArray(value)) {
    return value.map((item) => pruneUndefined(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined && item !== null && item !== "")
        .map(([key, item]) => [key, pruneUndefined(item)])
    );
  }

  return value;
}

function omitRepoArgs(args) {
  return omitKeys(args, ["owner", "repo"]);
}

function omitKeys(args, keys) {
  const omitted = new Set(keys);
  return pruneUndefined(
    Object.fromEntries(Object.entries(args).filter(([key]) => !omitted.has(key)))
  );
}

async function getDefaultBranch(owner, repo) {
  const response = await giteaRequest(repoRoute(owner, repo));
  return response.data?.default_branch || "master";
}
