import { createInterface } from "node:readline";

import { getGiteaConfig, limitResponseText, redactSecrets } from "./gitea.js";
import { callTool, toolDescriptors } from "./tools.js";

const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2024-11-05"];

export async function handleRequest(message) {
  if (!message || message.jsonrpc !== "2.0") {
    return errorResponse(message?.id ?? null, -32600, "Invalid JSON-RPC request.");
  }

  const { id, method, params } = message;

  if (method === "notifications/initialized" || method === "notifications/cancelled") {
    return null;
  }

  if (method === "initialize") {
    const requestedVersion = params?.protocolVersion;
    const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requestedVersion)
      ? requestedVersion
      : SUPPORTED_PROTOCOL_VERSIONS[0];

    return successResponse(id, {
      protocolVersion,
      capabilities: {
        tools: {
          listChanged: false
        }
      },
      serverInfo: {
        name: "gitea",
        title: "Gitea",
        version: "0.1.0",
        description: "Gitea MCP server for Codex plugin workflows."
      },
      instructions:
        "Use the high-level Gitea tools first. Use generic API tools only for official Gitea /api/v1 routes that are not covered by a specific tool. Never print tokens or private instance URLs in user-facing output."
    });
  }

  if (method === "ping") {
    return successResponse(id, {});
  }

  if (method === "tools/list") {
    return successResponse(id, { tools: toolDescriptors() });
  }

  if (method === "tools/call") {
    return handleToolCall(id, params);
  }

  return errorResponse(id, -32601, `Method not found: ${method}`);
}

export function startStdioServer() {
  const lines = createInterface({
    input: process.stdin,
    crlfDelay: Infinity
  });

  lines.on("line", async (line) => {
    if (!line.trim()) {
      return;
    }

    try {
      const message = JSON.parse(line);
      const response = Array.isArray(message)
        ? await Promise.all(message.map((item) => handleRequest(item)))
        : await handleRequest(message);

      if (response === null) {
        return;
      }

      if (Array.isArray(response)) {
        const filtered = response.filter(Boolean);
        if (filtered.length > 0) {
          writeMessage(filtered);
        }
        return;
      }

      writeMessage(response);
    } catch (error) {
      writeMessage(errorResponse(null, -32700, error.message || "Parse error."));
    }
  });
}

async function handleToolCall(id, params = {}) {
  const name = params.name;
  if (typeof name !== "string" || !name) {
    return errorResponse(id, -32602, "tools/call requires params.name.");
  }

  try {
    const result = await callTool(name, params.arguments || {});
    return successResponse(id, toolResult(result, false));
  } catch (error) {
    return successResponse(
      id,
      toolResult(
        {
          error: error.message || "Tool call failed.",
          status: error.status,
          data: redactSecrets(error.data)
        },
        true
      )
    );
  }
}

function toolResult(value, isError) {
  const config = safeConfig();
  const text = limitResponseText(JSON.stringify(redactSecrets(value), null, 2), config.maxResponseChars);
  return {
    content: [
      {
        type: "text",
        text
      }
    ],
    isError
  };
}

function safeConfig() {
  try {
    return getGiteaConfig();
  } catch {
    return { maxResponseChars: 200000 };
  }
}

function successResponse(id, result) {
  return {
    jsonrpc: "2.0",
    id,
    result
  };
}

function errorResponse(id, code, message, data) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data })
    }
  };
}

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
