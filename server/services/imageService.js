const zlib = require("zlib");

// Image service module.
// Owns NovelAI image request validation, provider calls, archive handling, and
// response normalization for the browser.
const {
  NOVELAI_API_KEY,
  NOVELAI_BASE_URL,
  NOVELAI_IMAGE_ENDPOINT,
  NOVELAI_IMAGE_MODEL,
} = require("../config/runtime");

const DEFAULT_NEGATIVE_PROMPT =
  "lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, jpeg artifacts";

async function generateNovelAiImage(payload) {
  if (!NOVELAI_API_KEY) {
  
    return {
      ok: false,
      status: 500,
      error: "Missing NOVELAI_API_KEY. Add it to server/.env, then restart the server.",
    };
  }

  const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
  if (!prompt) {
    return { ok: false, status: 400, error: "Prompt is required." };
  }

  const width = clampNumber(payload?.width, 512, 1536, 1024);
  const height = clampNumber(payload?.height, 512, 1536, 1024);
  const steps = clampNumber(payload?.steps, 1, 50, 28);
  const scale = clampNumber(payload?.scale, 1, 20, 5);
  const seed = normalizeSeed(payload?.seed);
  const negativePrompt =
    typeof payload?.negativePrompt === "string" && payload.negativePrompt.trim()
      ? payload.negativePrompt.trim()
      : DEFAULT_NEGATIVE_PROMPT;
  const sampler =
    typeof payload?.sampler === "string" && payload.sampler.trim()
      ? payload.sampler.trim()
      : "k_euler_ancestral";
  const noiseSchedule =
    typeof payload?.noiseSchedule === "string" && payload.noiseSchedule.trim()
      ? payload.noiseSchedule.trim()
      : "karras";

  const response = await fetch(`${NOVELAI_BASE_URL}${NOVELAI_IMAGE_ENDPOINT}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${NOVELAI_API_KEY}`,
    },
    body: JSON.stringify({
      input: prompt.slice(0, 1200),
      model: NOVELAI_IMAGE_MODEL,
      action: "generate",
      parameters: {
        width,
        height,
        scale,
        sampler,
        steps,
        seed,
        n_samples: 1,
        uc: negativePrompt.slice(0, 1200),
        ucPreset: 0,
        qualityToggle: true,
        sm: false,
        sm_dyn: false,
        dynamic_thresholding: false,
        controlnet_strength: 1,
        legacy: false,
        add_original_image: false,
        cfg_rescale: 0,
        noise_schedule: noiseSchedule,
      },
    }),
  }).catch((error) => {
    console.error(error);
    return null;
  });

  if (!response) {
    return {
      ok: false,
      status: 502,
      error: "Could not connect to NovelAI. Check network access and server logs.",
    };
  }

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    return {
      ok: false,
      status: response.status,
      error: details || `NovelAI request failed with ${response.status}`,
    };
  }

  const contentType = response.headers.get("content-type") || "";
  const body = Buffer.from(await response.arrayBuffer());
  const image = contentType.includes("application/zip")
    ? extractFirstImageFromZip(body)
    : {
        buffer: body,
        contentType: contentType.startsWith("image/") ? contentType : "image/png",
      };

  if (!image) {
    return {
      ok: false,
      status: 502,
      error: "NovelAI returned a response, but no image file could be read.",
    };
  }

  return {
    ok: true,
    data: {
      image: `data:${image.contentType};base64,${image.buffer.toString("base64")}`,
      model: NOVELAI_IMAGE_MODEL,
      seed,
      width,
      height,
    },
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeSeed(value) {
  const number = Number(value);
  if (Number.isInteger(number) && number >= 0 && number <= 4294967295) {
    return number;
  }

  return Math.floor(Math.random() * 4294967295);
}

function extractFirstImageFromZip(buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) return null;

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let centralOffset = buffer.readUInt32LE(eocdOffset + 16);

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(centralOffset) !== 0x02014b50) return null;

    const method = buffer.readUInt16LE(centralOffset + 10);
    const compressedSize = buffer.readUInt32LE(centralOffset + 20);
    const fileNameLength = buffer.readUInt16LE(centralOffset + 28);
    const extraLength = buffer.readUInt16LE(centralOffset + 30);
    const commentLength = buffer.readUInt16LE(centralOffset + 32);
    const localOffset = buffer.readUInt32LE(centralOffset + 42);
    const fileName = buffer
      .subarray(centralOffset + 46, centralOffset + 46 + fileNameLength)
      .toString("utf8");

    if (/\.(png|jpg|jpeg|webp)$/i.test(fileName)) {
      return readZipFile(buffer, localOffset, compressedSize, method, fileName);
    }

    centralOffset += 46 + fileNameLength + extraLength + commentLength;
  }

  return null;
}

function findEndOfCentralDirectory(buffer) {
  for (let index = buffer.length - 22; index >= 0; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) return index;
  }

  return -1;
}

function readZipFile(buffer, localOffset, compressedSize, method, fileName) {
  if (buffer.readUInt32LE(localOffset) !== 0x04034b50) return null;

  const fileNameLength = buffer.readUInt16LE(localOffset + 26);
  const extraLength = buffer.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + fileNameLength + extraLength;
  const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
  const imageBuffer = method === 8 ? zlib.inflateRawSync(compressed) : compressed;

  return {
    buffer: imageBuffer,
    contentType: getImageContentType(fileName),
  };
}

function getImageContentType(fileName) {
  if (/\.jpe?g$/i.test(fileName)) return "image/jpeg";
  if (/\.webp$/i.test(fileName)) return "image/webp";
  return "image/png";
}

module.exports = { generateNovelAiImage };
