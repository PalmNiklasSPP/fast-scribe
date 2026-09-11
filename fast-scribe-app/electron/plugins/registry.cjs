const {
  ANONYMIZATION_MAP_ARTIFACT_TYPE,
  TEXT_ARTIFACT_TYPE,
  createArtifactTypeRegistry,
  isPlainObject,
} = require('./contracts.cjs');

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9.-]*$/;

function validatePorts(ports, field, artifactTypes) {
  if (!Array.isArray(ports) || ports.length === 0) {
    throw new Error(`Plugin manifest ${field} must contain at least one port.`);
  }
  const ids = new Set();
  for (const port of ports) {
    if (
      !isPlainObject(port) ||
      typeof port.id !== 'string' ||
      !IDENTIFIER_PATTERN.test(port.id) ||
      typeof port.type !== 'string'
    ) {
      throw new Error(`Plugin manifest ${field} contains an invalid port.`);
    }
    if (ids.has(port.id)) throw new Error(`Plugin manifest has duplicate ${field} port "${port.id}".`);
    if (!artifactTypes.get(port.type)) {
      throw new Error(`Plugin port "${port.id}" uses unknown artifact type "${port.type}".`);
    }
    ids.add(port.id);
  }
}

function validateManifest(manifest, artifactTypes) {
  if (
    !isPlainObject(manifest) ||
    typeof manifest.id !== 'string' ||
    !IDENTIFIER_PATTERN.test(manifest.id) ||
    typeof manifest.version !== 'string' ||
    !/^\d+\.\d+\.\d+$/.test(manifest.version) ||
    typeof manifest.name !== 'string' ||
    !manifest.name ||
    typeof manifest.description !== 'string'
  ) {
    throw new Error('Plugin manifest metadata is invalid.');
  }
  validatePorts(manifest.inputs, 'inputs', artifactTypes);
  validatePorts(manifest.outputs, 'outputs', artifactTypes);
  if (!isPlainObject(manifest.configSchema) || manifest.configSchema.type !== 'object') {
    throw new Error('Plugin manifests require an object configuration schema.');
  }
}

function createPluginRegistry(artifactTypes) {
  const plugins = new Map();

  return {
    register(definition) {
      if (!isPlainObject(definition) || typeof definition.execute !== 'function') {
        throw new Error('Plugin definitions require a manifest and execute function.');
      }
      validateManifest(definition.manifest, artifactTypes);
      const key = `${definition.manifest.id}@${definition.manifest.version}`;
      if (plugins.has(key)) throw new Error(`Plugin "${key}" is already registered.`);
      plugins.set(key, Object.freeze({
        manifest: Object.freeze(structuredClone(definition.manifest)),
        execute: definition.execute,
      }));
    },
    get(id, version) {
      return plugins.get(`${id}@${version}`) || null;
    },
    listManifests() {
      return [...plugins.values()].map(({ manifest }) => structuredClone(manifest));
    },
  };
}

function createBuiltinRegistries() {
  const artifactTypes = createArtifactTypeRegistry();
  artifactTypes.register({
    id: TEXT_ARTIFACT_TYPE,
    schemaVersion: 1,
    description: 'UTF-8 plain text.',
    validate: (value) => typeof value === 'string' || 'Text artifacts must contain a string.',
  });
  artifactTypes.register({
    id: ANONYMIZATION_MAP_ARTIFACT_TYPE,
    schemaVersion: 1,
    description: 'Placeholder anonymization replacement metadata.',
    validate: (value) => (
      isPlainObject(value) &&
      value.version === 1 &&
      Array.isArray(value.replacements) &&
      value.replacements.every(
        (entry) => isPlainObject(entry) &&
          typeof entry.token === 'string' &&
          typeof entry.original === 'string',
      )
    ) || 'Anonymization maps must contain versioned token/original replacements.',
  });

  return {
    artifactTypes,
    plugins: createPluginRegistry(artifactTypes),
  };
}

module.exports = {
  createBuiltinRegistries,
  createPluginRegistry,
  validateManifest,
};
