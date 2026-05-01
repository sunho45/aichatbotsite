const fs = require("fs");
const path = require("path");

// Persona prompt utility.
// Builds the system prompt by combining environment defaults with the optional
// persona.type.yaml file used to customize assistant behavior.
const { PERSONA_FILE, SYSTEM_PROMPT, serverRoot } = require("../config/runtime");

function buildSystemPrompt() {
  const personaPath = path.resolve(serverRoot, PERSONA_FILE);
  const persona = readPersonaFile(personaPath);

  if (!persona) return SYSTEM_PROMPT;

  return [
    SYSTEM_PROMPT,
    "Persona configuration:",
    persona.name ? `Name: ${persona.name}` : "",
    persona.role ? `Role: ${persona.role}` : "",
    persona.tone ? `Tone: ${personatone}` : "",
    persona.style ? `Style: ${person.a.style}` : "",
    persona.instructions ? `Instructions: ${persona.instructions}` : "",
    persona.boundaries ? `Boundaries: ${persona.boundaries}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function readPersonaFile(filePath) {
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf8");
  const result = {};
  let currentKey = "";

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const blockMatch = line.match(/^([A-Za-z0-9_-]+):\s*\|\s*$/);
    if (blockMatch) {
      currentKey = blockMatch[1];
      result[currentKey] = "";
      continue;
    }

    const keyValueMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (keyValueMatch) {
      currentKey = "";
      result[keyValueMatch[1]] = keyValueMatch[2].replace(/^["']|["']$/g, "");
      continue;
    }

    if (currentKey && /^\s+/.test(line)) {
      result[currentKey] = `${result[currentKey]}${line.trim()}\n`;
    }
  }

  for (const key of Object.keys(result)) {
    result[key] = String(result[key]).trim();
  }

  return result;
}

module.exports = { buildSystemPrompt, readPersonaFile };
