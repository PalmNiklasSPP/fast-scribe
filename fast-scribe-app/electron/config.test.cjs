const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createConfigService,
  createSettingsBundle,
  decryptSettingsBundle,
} = require('./config.cjs');

function createStore(initial = {}) {
  const values = { ...initial };
  return {
    get(key, fallback) {
      return Object.hasOwn(values, key) ? values[key] : fallback;
    },
    set(key, value) {
      values[key] = value;
    },
    delete(key) {
      delete values[key];
    },
    values,
  };
}

const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`encrypted:${value}`),
  decryptString: (value) => value.toString('utf8').replace(/^encrypted:/, ''),
};

test('config service encrypts API keys and keeps them out of public settings', () => {
  const store = createStore();
  const service = createConfigService({ store, safeStorage });

  const config = service.updateConfig({ endpoint: 'https://example.test', apiKey: 'secret-key' });

  assert.equal(config.hasApiKey, true);
  assert.equal('apiKey' in config, false);
  assert.equal(store.values.encryptedApiKey, Buffer.from('encrypted:secret-key').toString('base64'));
  assert.equal(store.values.apiKey, undefined);
  assert.equal(service.getPrivateConfig().apiKey, 'secret-key');
});

test('config service migrates a plaintext API key into secure storage', () => {
  const store = createStore({ apiKey: 'old-secret' });
  const service = createConfigService({ store, safeStorage });

  assert.equal(service.getPublicConfig().hasApiKey, true);
  assert.equal(store.values.apiKey, undefined);
  assert.equal(service.getPrivateConfig().apiKey, 'old-secret');
});

test('encrypted settings bundles round-trip portable settings', () => {
  const settings = {
    endpoint: 'https://example.test/openai',
    model: 'gpt-4o-transcribe',
    apiKey: 'secret-key',
    chunkDurationMs: 120000,
    language: 'sv',
    theme: 'dark',
  };

  const bundle = createSettingsBundle(settings, 'correct horse battery staple');
  const tamperedBundle = JSON.parse(bundle);
  tamperedBundle.payload = `${tamperedBundle.payload.slice(0, -2)}xx`;

  assert.deepEqual(decryptSettingsBundle(bundle, 'correct horse battery staple'), settings);
  assert.throws(() => decryptSettingsBundle(bundle, 'incorrect password'), /Unable to decrypt settings/);
  assert.throws(
    () => decryptSettingsBundle(JSON.stringify(tamperedBundle), 'correct horse battery staple'),
    /Unable to decrypt settings/,
  );
});

test('imported settings preserve the local output folder', () => {
  const store = createStore({ outputDir: 'C:\\Transcripts' });
  const service = createConfigService({ store, safeStorage });
  const bundle = createSettingsBundle({
    endpoint: 'https://example.test/openai',
    model: 'gpt-4o-transcribe',
    apiKey: 'secret-key',
    chunkDurationMs: 120000,
    language: 'sv',
    theme: 'dark',
  }, 'correct horse battery staple');

  const config = service.importSettings(bundle, 'correct horse battery staple');

  assert.equal(config.outputDir, 'C:\\Transcripts');
  assert.equal(config.endpoint, 'https://example.test/openai');
  assert.equal(config.hasApiKey, true);
});
