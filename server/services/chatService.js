// Chat service module.
// Owns OpenRouter request validation, prompt construction, provider calls, and
// response normalization for both HTTP and WebSocket chat entry points.
const {
  OPENROUTER_API_KEY,
  OPENROUTER_BASE_URL,
  OPENROUTER_MODEL,
  OPENROUTER_SITE_URL,
  OPENROUTER_APP_NAME,
} = require("../config/runtime");
const { hasMessageContent, normalizeMessageContent } = require("../utils/messages");
const { buildSystemPrompt } = require("../utils/persona");

async function createChatCompletion(payload) {
  if (!OPENROUTER_API_KEY) {
    return {
      ok: false,
      status: 500,
      error:
        "Missing OPENROUTER_API_KEY. Add it to server/.env, then restart the server.",
    };
  }

  const incomingMessages = Array.isArray(payload?.messages) ? payload.messages : [];
  const messages = incomingMessages
    .filter((message) => {
      return (
        message &&
        ["user", "assistant"].includes(message.role) &&
        hasMessageContent(message.content)
      );
    })
    .slice(-20)
    .map((message) => ({
      role: message.role,
      content: normalizeMessageContent(message.content),
    }));

  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return { ok: false, status: 400, error: "Send at least one user message." };
  }

  let response;
  try {
    response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": OPENROUTER_SITE_URL,
        "X-OpenRouter-Title": OPENROUTER_APP_NAME,
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [{ role: "system", content: buildSystemPrompt() }, ...messages],
        stream: false,
      }),
    });
  } catch (error) {
    console.error(error);
    return {
      ok: false,
      status: 502,
      error: "Could not connect to OpenRouter. Check network access and server logs.",
    };
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const apiMessage =
      data.error?.message ||
      data.message ||
      `OpenRouter request failed with ${response.status}`;
    return { ok: false, status: response.status, error: apiMessage };
  }

  const reply = data.choices?.[0]?.message?.content;
  if (!reply) {
    return { ok: false, status: 502, error: "OpenRouter returned an empty response." };
  }

  return {
    ok: true,
    data: {
      reply,
      model: data.model || OPENROUTER_MODEL,
      usage: data.usage || null,
    },
  };
}

module.exports = { createChatCompletion };
