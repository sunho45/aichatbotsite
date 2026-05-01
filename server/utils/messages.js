// Message normalization utility.
// Validates and trims chat message content before provider calls so services can
// work with a clean user/assistant conversation shape.
function hasMessageContent(content) {
  if (typeof content === "string") return Boolean(content.trim());
  if (!Array.isArray(content)) return false;

  return content.some((part) => {
    if (!part || typeof part !== "object") return false;
    if (part.type === "text") return Boolean(String(part.text || "").trim());
    if (part.type === "image_url") return Boolean(part.image_url?.url);
    return false;
  });
}

function normalizeMessageContent(content) {
  if (typeof content === "string") return content.trim();

  return content
    .filter((part) => part && typeof part === "object")
    .map((part) => {
      if (part.type === "image_url" && part.image_url?.url) {
        return {
          type: "image_url",
          image_url: { url: part.image_url.url },
        };
      }

      return {
        type: "text",
        text: String(part.text || "").trim(),
      };
    })
    .filter((part) => {
      if (part.type === "image_url") return true;
      return Boolean(part.text);
    });
}

module.exports = { hasMessageContent, normalizeMessageContent };
