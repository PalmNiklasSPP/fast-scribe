const crypto = require('crypto');

const BUNDLE_FORMAT = 'fast-scribe-settings';
const BUNDLE_VERSION = 1;
const PBKDF2_ITERATIONS = 310000;
const MAX_BUNDLE_SIZE = 1024 * 1024;

const DEFAULT_CONFIG = {
  endpoint: '',
  model: 'gpt-4o-transcribe',
  outputDir: '',
  chunkDurationMs: 600000,
  language: 'auto',
  theme: 'system',
};

const PUBLIC_CONFIG_KEYS = Object.keys(DEFAULT_CONFIG);
const PORTABLE_CONFIG_KEYS = PUBLIC_CONFIG_KEYS.filter((key) => key !== 'outputDir');

function requireSecureStorage(safeStorage) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure OS storage is unavailable, so Fast Scribe cannot store an API key.');
  }
}

function validatePassphrase(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 8) {
    throw new Error('Use a password with at least 8 characters to protect these settings.');
  }
}

function validatePortableSettings(settings) {
  if (!settings || typeof settings !== 'object') {
    throw new Error('The settings file has an invalid payload.');
  }

  const { endpoint, model, apiKey, chunkDurationMs, language, theme } = settings;
  if (
    typeof endpoint !== 'string' ||
    typeof model !== 'string' ||
    typeof apiKey !== 'string' ||
    !Number.isFinite(chunkDurationMs) ||
    typeof language !== 'string' ||
    !['light', 'dark', 'system'].includes(theme)
  ) {
    throw new Error('The settings file has an invalid payload.');
  }

  return { endpoint, model, apiKey, chunkDurationMs, language, theme };
}

function createSettingsBundle(settings, passphrase, cryptoImpl = crypto) {
  validatePassphrase(passphrase);
  const payload = Buffer.from(JSON.stringify(validatePortableSettings(settings)), 'utf8');
  const salt = cryptoImpl.randomBytes(16);
  const iv = cryptoImpl.randomBytes(12);
  const key = cryptoImpl.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, 32, 'sha256');
  const cipher = cryptoImpl.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);

  return JSON.stringify({
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    kdf: {
      name: 'PBKDF2',
      digest: 'sha256',
      iterations: PBKDF2_ITERATIONS,
      salt: salt.toString('base64'),
    },
    cipher: {
      name: 'AES-256-GCM',
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    },
    payload: encrypted.toString('base64'),
  }, null, 2);
}

function decryptSettingsBundle(serialized, passphrase, cryptoImpl = crypto) {
  validatePassphrase(passphrase);
  if (typeof serialized !== 'string' || Buffer.byteLength(serialized, 'utf8') > MAX_BUNDLE_SIZE) {
    throw new Error('The selected settings file is invalid.');
  }

  let bundle;
  try {
    bundle = JSON.parse(serialized);
  } catch {
    throw new Error('The selected settings file is invalid.');
  }

  if (
    !bundle ||
    bundle.format !== BUNDLE_FORMAT ||
    bundle.version !== BUNDLE_VERSION ||
    bundle.kdf?.name !== 'PBKDF2' ||
    bundle.kdf?.digest !== 'sha256' ||
    bundle.kdf?.iterations !== PBKDF2_ITERATIONS ||
    bundle.cipher?.name !== 'AES-256-GCM' ||
    typeof bundle.kdf.salt !== 'string' ||
    typeof bundle.cipher.iv !== 'string' ||
    typeof bundle.cipher.authTag !== 'string' ||
    typeof bundle.payload !== 'string'
  ) {
    throw new Error('The selected settings file is invalid.');
  }

  try {
    const key = cryptoImpl.pbkdf2Sync(
      passphrase,
      Buffer.from(bundle.kdf.salt, 'base64'),
      bundle.kdf.iterations,
      32,
      bundle.kdf.digest,
    );
    const decipher = cryptoImpl.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(bundle.cipher.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(bundle.cipher.authTag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(bundle.payload, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    return validatePortableSettings(JSON.parse(decrypted));
  } catch {
    throw new Error('Unable to decrypt settings. Check the password and file.');
  }
}

function createConfigService({ store, safeStorage }) {
  const getStoredApiKey = () => {
    const encryptedApiKey = store.get('encryptedApiKey');
    if (typeof encryptedApiKey === 'string' && encryptedApiKey) {
      requireSecureStorage(safeStorage);
      return safeStorage.decryptString(Buffer.from(encryptedApiKey, 'base64'));
    }

    const legacyApiKey = store.get('apiKey');
    if (typeof legacyApiKey !== 'string' || !legacyApiKey) return '';

    requireSecureStorage(safeStorage);
    store.set('encryptedApiKey', safeStorage.encryptString(legacyApiKey).toString('base64'));
    store.delete('apiKey');
    return legacyApiKey;
  };

  const setApiKey = (apiKey) => {
    if (typeof apiKey !== 'string') {
      throw new Error('The API key must be a string.');
    }

    if (!apiKey) {
      store.delete('encryptedApiKey');
      store.delete('apiKey');
      return;
    }

    requireSecureStorage(safeStorage);
    store.set('encryptedApiKey', safeStorage.encryptString(apiKey).toString('base64'));
    store.delete('apiKey');
  };

  const getPublicConfig = () => {
    const legacyApiKey = store.get('apiKey');
    const encryptedApiKey = store.get('encryptedApiKey');
    if (typeof legacyApiKey === 'string' && legacyApiKey && !encryptedApiKey) {
      getStoredApiKey();
    }

    const config = Object.fromEntries(
      PUBLIC_CONFIG_KEYS.map((key) => [key, store.get(key, DEFAULT_CONFIG[key])]),
    );
    return {
      ...config,
      hasApiKey: Boolean(store.get('encryptedApiKey')),
    };
  };

  const updateConfig = (updates) => {
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      throw new Error('Settings updates must be an object.');
    }

    for (const key of PUBLIC_CONFIG_KEYS) {
      if (Object.hasOwn(updates, key)) store.set(key, updates[key]);
    }
    if (Object.hasOwn(updates, 'apiKey')) setApiKey(updates.apiKey);

    return getPublicConfig();
  };

  const getPrivateConfig = () => ({
    ...getPublicConfig(),
    apiKey: getStoredApiKey(),
  });

  const exportSettings = (passphrase) => createSettingsBundle(
    {
      ...Object.fromEntries(
        PORTABLE_CONFIG_KEYS.map((key) => [key, store.get(key, DEFAULT_CONFIG[key])]),
      ),
      apiKey: getStoredApiKey(),
    },
    passphrase,
  );

  const importSettings = (serialized, passphrase) => {
    const settings = decryptSettingsBundle(serialized, passphrase);
    updateConfig(settings);
    return getPublicConfig();
  };

  return { getPublicConfig, getPrivateConfig, updateConfig, exportSettings, importSettings };
}

module.exports = {
  BUNDLE_FORMAT,
  BUNDLE_VERSION,
  DEFAULT_CONFIG,
  createConfigService,
  createSettingsBundle,
  decryptSettingsBundle,
};
