import {
  contentRoute,
  decodeGiteaContent,
  encodeSegment,
  giteaRequest,
  publicResponse,
  repoRoute,
  toBase64
} from "./gitea.js";

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
    name: "gitea_get_repository",
    title: "Get Gitea Repository",
    description: "Return repository metadata, permissions, clone URLs, default branch, and counters.",
    inputSchema: objectSchema(repoProperties, ["owner", "repo"]),
    handler: async (args) => publicResponse(await giteaRequest(repoRoute(args.owner, args.repo)))
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
        ...paginationProperties
      },
      ["owner", "repo"]
    ),
    handler: async (args) =>
      publicResponse(
        await giteaRequest(repoRoute(args.owner, args.repo, "/issues"), {
          query: omitRepoArgs(args)
        })
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
        ...paginationProperties
      },
      ["owner", "repo"]
    ),
    handler: async (args) =>
      publicResponse(
        await giteaRequest(repoRoute(args.owner, args.repo, "/pulls"), {
          query: omitRepoArgs(args)
        })
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
  const { owner, repo, ...rest } = args;
  return pruneUndefined(rest);
}

async function getDefaultBranch(owner, repo) {
  const response = await giteaRequest(repoRoute(owner, repo));
  return response.data?.default_branch || "master";
}
