// Protocol metadata module.
// Defines the public API identity, transport headers, and tool descriptions used
// by metadata responses and browser-facing CORS header exposure.
const SERVER_NAME = "my-ai-website";
const SERVER_VERSION = "1.0.0";
const PROTOCOL_REVISION = "2025-06-18";
const TRANSPORT_HEADERS = [
  "X-Protocol-Name",
  "X-Protocol-Revision",
  "X-Transport-Type",
];

const API_TOOLS = [
  {
    name: "chat",
    title: "AI Chat",
    description: "Send recent chat messages to the configured OpenRouter model.",
    transport: {
      method: "WEBSOCKET",
      path: "/api/chat",
      contentType: "application/json",
      responseType: "application/json",
    },
    inputSchema: {
      type: "object",
      properties: {
        messages: {
          type: "array",
          description: "Recent user and assistant messages.",
        },
      },
      required: ["messages"],
    },
    outputSchema: {
      type: "object",
      properties: {
        reply: { type: "string" },
        model: { type: "string" },
        usage: { type: ["object", "null"] },
      },
      required: ["reply", "model", "usage"],
    },
    annotations: {
      title: "AI Chat",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "voice",
    title: "Text To Speech",
    description: "Convert text into streamed speech audio with ElevenLabs.",
    transport: {
      method: "POST",
      path: "/api/voice",
      contentType: "application/json",
      responseType: "audio/mpeg",
    },
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          maxLength: 3000,
          description: "Text to synthesize into speech.",
        },
      },
      required: ["text"],
    },
    outputSchema: {
      type: "object",
      properties: {
        audio: { type: "string", description: "Streamed audio response body." },
      },
    },
    annotations: {
      title: "Text To Speech",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
];

module.exports = {
  SERVER_NAME,
  SERVER_VERSION,
  PROTOCOL_REVISION,
  TRANSPORT_HEADERS,
  API_TOOLS,
};
