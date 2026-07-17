const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'config.json');

const DEFAULTS = {
  max_retries: 3,
  backoff_base: 2
};

/**
 * Reads config.json, falling back to DEFAULTS for any missing keys.
 * If config.json doesn't exist yet, it's created with defaults.
 */
function getConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULTS, null, 2));
    return { ...DEFAULTS };
  }

  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8').replace(/^\uFEFF/, '');
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch (err) {
    console.error(`Warning: config.json is corrupted, using defaults. (${err.message})`);
    return { ...DEFAULTS };
  }
}

function setConfigValue(key, value) {
  const current = getConfig();
  current[key] = value;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(current, null, 2));
  return current;
}

module.exports = { getConfig, setConfigValue, DEFAULTS };