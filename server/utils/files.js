const fs = require("fs");

// File utility module.
// Contains small filesystem helpers shared by services, currently used to report
// metadata timestamps without crashing when a file is unavailable.
function getIsoModifiedTime(filePath) {
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

module.exports = { getIsoModifiedTime };
