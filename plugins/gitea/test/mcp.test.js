import assert from "node:assert/strict";
import test from "node:test";

import { handleRequest } from "../src/mcp.js";

test("initialize returns MCP server capabilities", async () => {
  const response = await handleRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: {
        name: "test",
        version: "1.0.0"
      }
    }
  });

  assert.equal(response.result.protocolVersion, "2025-11-25");
  assert.equal(response.result.serverInfo.name, "gitea");
  assert.deepEqual(response.result.capabilities, {
    tools: {
      listChanged: false
    }
  });
});

test("tools/list exposes Gitea tools", async () => {
  const response = await handleRequest({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
  });

  const names = response.result.tools.map((tool) => tool.name);
  assert.ok(names.includes("gitea_get_repository"));
  assert.ok(names.includes("gitea_api_request"));
});

test("initialized notification has no response", async () => {
  const response = await handleRequest({
    jsonrpc: "2.0",
    method: "notifications/initialized"
  });

  assert.equal(response, null);
});
