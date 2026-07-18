const { getConfig, setConfigValue } = require('../config/config');

// Maps the CLI-friendly key names (kebab-case) to the internal
// config.json keys (snake_case).
const KEY_MAP = {
  'max-retries': 'max_retries',
  'backoff-base': 'backoff_base'
};

function configSetCommand(key, value) {
  const internalKey = KEY_MAP[key];

  if (!internalKey) {
    console.error(`Error: Unknown config key "${key}". Valid keys: ${Object.keys(KEY_MAP).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const numValue = Number(value);
  if (isNaN(numValue) || numValue < 1 || !Number.isInteger(numValue)) {
    console.error(`Error: "${key}" must be a positive integer. Got "${value}".`);
    process.exitCode = 1;
    return;
  }

  const updated = setConfigValue(internalKey, numValue);
  console.log(`Config updated: ${key} = ${numValue}`);
  console.log(JSON.stringify(updated, null, 2));
}

function configGetCommand() {
  const config = getConfig();
  console.log(JSON.stringify(config, null, 2));
}

module.exports = { configSetCommand, configGetCommand };