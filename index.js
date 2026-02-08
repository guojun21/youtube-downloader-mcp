#!/usr/bin/env node

/**
 * MCP (Model Context Protocol) server entry point.
 * Why: communicates over stdin/stdout using JSON-RPC so AI assistants
 * can invoke YouTube download and subtitle tools programmatically.
 */

import { getAllRegisteredToolDefinitions, dispatchToolCallByName } from "./lib/tools/index.js";

const MCP_PROTOCOL_VERSION = "2024-11-05";
const MCP_SERVER_IDENTIFICATION = { name: "youtube-downloader-mcp", version: "0.2.0" };

function sendJsonRpcResponseToStdout(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function sendJsonRpcSuccessResult(requestId, resultPayload) {
  sendJsonRpcResponseToStdout({ jsonrpc: "2.0", id: requestId, result: resultPayload });
}

function sendJsonRpcErrorResponse(requestId, errorCode, errorMessage) {
  sendJsonRpcResponseToStdout({ jsonrpc: "2.0", id: requestId, error: { code: errorCode, message: errorMessage } });
}

async function handleIncomingJsonRpcRequest(request) {
  const { id: requestId, method: requestMethod } = request || {};

  if (requestMethod === "initialize") {
    return sendJsonRpcSuccessResult(requestId, {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: MCP_SERVER_IDENTIFICATION,
    });
  }

  if (requestMethod === "notifications/initialized") {
    return;
  }

  if (requestMethod === "tools/list") {
    return sendJsonRpcSuccessResult(requestId, { tools: getAllRegisteredToolDefinitions() });
  }

  if (requestMethod === "tools/call") {
    const { name: toolName, arguments: toolArguments } = request.params || {};
    try {
      const toolResult = await dispatchToolCallByName(toolName, toolArguments);
      if (toolResult === null) {
        return sendJsonRpcSuccessResult(requestId, {
          content: [{ type: "text", text: `Error: Unknown tool: ${toolName}` }],
          isError: true,
        });
      }
      return sendJsonRpcSuccessResult(requestId, toolResult);
    } catch (error) {
      return sendJsonRpcSuccessResult(requestId, {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      });
    }
  }

  if (requestId !== undefined && requestId !== null) {
    return sendJsonRpcErrorResponse(requestId, -32601, `Method not found: ${requestMethod}`);
  }
}

function startMcpServerOnStdinStdout() {
  console.error("youtube-downloader-mcp v0.2.0 running");
  process.stdin.setEncoding("utf-8");
  let incompleteLineBuffer = "";

  process.stdin.on("data", async (inputChunk) => {
    incompleteLineBuffer += inputChunk;
    const completedLines = incompleteLineBuffer.split(/\r?\n/);
    incompleteLineBuffer = completedLines.pop() || "";
    for (const line of completedLines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      try {
        const parsedRequest = JSON.parse(trimmedLine);
        await handleIncomingJsonRpcRequest(parsedRequest);
      } catch (parseError) {
        console.error("JSON parse error:", parseError.message);
      }
    }
  });
}

startMcpServerOnStdinStdout();
