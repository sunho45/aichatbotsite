const { Readable } = require("stream");

// Voice service module.
// Owns ElevenLabs text-to-speech validation, provider calls, and streaming the
// returned audio response back to the browser.
const {
  ELEVENLABS_API_KEY,
  ELEVENLABS_BASE_URL,
  ELEVENLABS_VOICE_ID,
  ELEVENLABS_OUTPUT_FORMAT,
  ELEVENLABS_MODEL_ID,
} = require("../config/runtime");

async function streamVoice(req, res) {
  if (!ELEVENLABS_API_KEY) {
    res.status(500).json({
      error:
        "Missing ELEVENLABS_API_KEY. Add it to server/.env, then restart the server.",
    });
    return;
  }

  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) {
    res.status(400).json({ error: "Text is required." });
    return;
  }

  const response = await fetch(
    `${ELEVENLABS_BASE_URL}/text-to-speech/${encodeURIComponent(
      ELEVENLABS_VOICE_ID
    )}/stream?output_format=${encodeURIComponent(ELEVENLABS_OUTPUT_FORMAT)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text: text.slice(0, 3000),
        model_id: ELEVENLABS_MODEL_ID,
      }),
    }
  ).catch((error) => {
    console.error(error);
    return null;
  });

  if (!response) {
    res.status(502).json({
      error: "Could not connect to ElevenLabs. Check network access and server logs.",
    });
    return;
  }

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    res.status(response.status).json({
      error: details || `ElevenLabs request failed with ${response.status}`,
    });
    return;
  }

  res.status(200);
  res.setHeader("Content-Type", response.headers.get("content-type") || "audio/mpeg");
  res.setHeader("Cache-Control", "no-store");
  Readable.fromWeb(response.body).pipe(res);
}

module.exports = { streamVoice };
