const path = require("path");

// Protocol service module.
// Builds the metadata document that describes this server, its available tools,
// and the HTTP/WebSocket endpoints clients should use.
const {
  API_TOOLS,
  SERVER_NAME,
  SERVER_VERSION,
  PROTOCOL_REVISION,
} = require("../config/protocol");
const { serverRoot } = require("../config/runtime");
const { getIsoModifiedTime } = require("../utils/files");
const { getBaseUrl, getWebSocketBaseUrl } = require("../utils/urls");

function buildProtocolMetadata(req) {
  const baseUrl = getBaseUrl(req);
  const serverPath = path.resolve(serverRoot, "server.js");

  return {
    name: SERVER_NAME,
    version: SERVER_VERSION,
    protocol: {
      name: "custom-ai-chat-api",
      revision: PROTOCOL_REVISION,
      wireFormat: "WebSocket JSON plus HTTP JSON",
    },
    transport: {
      type: "mixed",
      baseUrl,
      encoding: "utf-8",
      endpoints: API_TOOLS.map((tool) => ({
        name: tool.name,
        url:
          tool.name === "chat"
            ? `${getWebSocketBaseUrl(req)}${tool.transport.path}`
            : `${baseUrl}${tool.transport.path}`,
        ...tool.transport,
      })),
    },
    annotations: {
      audience: ["user", "assistant"],
      priority: 0.8,
      lastModified: getIsoModifiedTime(serverPath),
    },
    tools: API_TOOLS.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      annotations: tool.annotations,
    })),
  };
}

module.exports = { buildProtocolMetadata };
