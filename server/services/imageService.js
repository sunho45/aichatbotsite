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
const DEFAULT_IMAGE_MODEL = "nai-diffusion-4-5-full";
const MODEL_ALIASES = new Map([
  ["nai-diffusion-4.5-full", "nai-diffusion-4-5-full"],
  ["nai-diffusion-4.5-curated", "nai-diffusion-4-5-curated"],
  ["nai-diffusion-4-5-full", "nai-diffusion-4-5-full"],
  ["nai-diffusion-4-5-curated", "nai-diffusion-4-5-curated"],
]);

async function generateNovelAiImage(payload) {
  if (!NOVELAI_API_KEY) {
    return {
      ok: false,
      status: 500,
      error: "Missing NOVELAI_API_KEY. Add it to server/.env or the Render environment variables, then restart the server.",
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
  const model = normalizeNovelAiModel(NOVELAI_IMAGE_MODEL);
  const requestBody = buildNovelAiRequestBody({
    prompt,
    negativePrompt,
    width,
    height,
    scale,
    sampler,
    steps,
    seed,
    noiseSchedule,
    model,
  });

  let responseModel = model;
  let response = await sendNovelAiRequest(requestBody);

  if (!response) {
    return {
      ok: false,
      status: 502,
      error: "Could not connect to NovelAI. Check network access and server logs.",
    };
  }

  if (!response.ok) {
    const retryModel = getRetryModel(model);
    if (response.status >= 500 && retryModel) {
      const retryBody = { ...requestBody, model: retryModel };
      console.error("NovelAI image request failed; retrying with fallback model:", {
        status: response.status,
        model,
        retryModel,
      });
      response = await sendNovelAiRequest(retryBody);
      responseModel = retryModel;
    }
  }

  if (!response) {
    return {
      ok: false,
      status: 502,
      error: "Could not connect to NovelAI. Check network access and server logs.",
    };
  }

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    const providerMessage = extractProviderError(details);

    console.error("NovelAI image request rejected:", {
      status: response.status,
      message: providerMessage,
      model: responseModel,
      baseUrl: NOVELAI_BASE_URL,
      endpoint: NOVELAI_IMAGE_ENDPOINT,
    });

    return {
      ok: false,
      status: response.status,
      error: formatNovelAiError(providerMessage, responseModel, response.status),
    };
  }

  const contentType = response.headers.get("content-type") || "";
  const body = Buffer.from(await response.arrayBuffer());
  const image = normalizeImageResponse(body, contentType);

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
      model: responseModel,
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

function normalizeImageResponse(buffer, contentType) {
  if (isZipBuffer(buffer) || contentType.toLowerCase().includes("zip")) {
    return extractFirstImageFromZip(buffer);
  }

  return {
    buffer,
    contentType: contentType.startsWith("image/") ? contentType : "image/png",
  };
}

function isZipBuffer(buffer) {
  return buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50;
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

function buildNovelAiRequestBody({
  prompt,
  negativePrompt,
  width,
  height,
  scale,
  sampler,
  steps,
  seed,
  noiseSchedule,
  model,
}) {
  return {
    input: prompt.slice(0, 1200),
    model,
    action: "generate",
    parameters: {
      params_version: 3,
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
      cfg_rescale: 0,
      noise_schedule: noiseSchedule,
      v4_prompt: buildV4Prompt(prompt),
      v4_negative_prompt: buildV4NegativePrompt(negativePrompt),
      dynamic_thresholding: false,
      sm: false,
      sm_dyn: false,
      controlnet_strength: 1,
      controlnet_model: null,
      deliberate_euler_ancestral_bug: false,
      prefer_brownian: true,
    },
  };
}

function buildV4Prompt(prompt) {
  return {
    caption: {
      base_caption: prompt.slice(0, 1200),
      char_captions: [],
    },
    use_coords: false,
    use_order: true,
    legacy_uc: false,
  };
}

function buildV4NegativePrompt(negativePrompt) {
  return {
    caption: {
      base_caption: negativePrompt.slice(0, 1200),
      char_captions: [],
    },
    use_coords: false,
    use_order: false,
    legacy_uc: false,
  };
}

function sendNovelAiRequest(body) {
  return fetch(`${NOVELAI_BASE_URL}${NOVELAI_IMAGE_ENDPOINT}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${NOVELAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  }).catch((error) => {
    console.error("NovelAI request failed:", error);
    return null;
  });
}

function extractProviderError(details) {
  if (!details) return "";

  try {
    const data = JSON.parse(details);
    return (
      data.error?.message ||
      data.error ||
      data.message ||
      data.statusMessage ||
      ""
    );
  } catch {
    return details.slice(0, 500);
  }
}

function normalizeNovelAiModel(value) {
  const model = typeof value === "string" ? value.trim().toLowerCase() : "";
  return MODEL_ALIASES.get(model) || DEFAULT_IMAGE_MODEL;
}

function getRetryModel(model) {
  if (model === "nai-diffusion-4-5-full") return "nai-diffusion-4-5-curated";
  if (model === "nai-diffusion-4-5-curated") return "nai-diffusion-4-5-full";
  return "";
}

function formatNovelAiError(message, model, status) {
  if (/model must be a valid enum value/i.test(message || "")) {
    return `The image API rejected model "${model}". The V4.5 model name is valid for NovelAI, so check Render env: NOVELAI_BASE_URL must be https://image.novelai.net, NOVELAI_IMAGE_ENDPOINT must be /ai/generate-image, and NOVELAI_IMAGE_MODEL should be nai-diffusion-4-5-full or nai-diffusion-4-5-curated. If you are using a third-party NovelAI proxy, use that proxy's model enum instead.`;
  }

  if (status >= 500) {
    return `NovelAI returned ${status} for model "${model}". The request now uses the V4.5 structured prompt format; if this continues, try a shorter prompt or switch NOVELAI_IMAGE_MODEL between nai-diffusion-4-5-full and nai-diffusion-4-5-curated. Provider message: ${message || "Internal Server Error"}`;
  }

  return message || `NovelAI request failed with ${status}`;
}

module.exports = { generateNovelAiImage };
