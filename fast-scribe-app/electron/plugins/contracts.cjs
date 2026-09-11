const { randomUUID } = require('crypto');

const PIPELINE_SCHEMA_VERSION = 1;
const ARTIFACT_SCHEMA_VERSION = 1;
const PIPELINE_INPUT_NODE_ID = '$input';
const TEXT_ARTIFACT_TYPE = 'fast-scribe/text';
const ANONYMIZATION_MAP_ARTIFACT_TYPE = 'fast-scribe/anonymization-map';

class PipelineCancelledError extends Error {
  constructor() {
    super('Pipeline cancelled.');
    this.name = 'PipelineCancelledError';
  }
}

class PipelineExecutionError extends Error {
  constructor(nodeId, pluginId, cause) {
    super(`Plugin "${pluginId}" failed at node "${nodeId}": ${cause.message}`);
    this.name = 'PipelineExecutionError';
    this.nodeId = nodeId;
    this.pluginId = pluginId;
    this.cause = cause;
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJsonValue(value) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isPlainObject(value) && Object.entries(value).every(
    ([key, entry]) => typeof key === 'string' && isJsonValue(entry),
  );
}

function validateConfigValue(schema, value, location = 'config') {
  if (!schema) return [];
  const errors = [];

  if (schema.enum && !schema.enum.some((entry) => Object.is(entry, value))) {
    return [`${location} must be one of the declared values.`];
  }

  switch (schema.type) {
    case 'object': {
      if (!isPlainObject(value)) return [`${location} must be an object.`];
      const properties = schema.properties || {};
      for (const key of schema.required || []) {
        if (!Object.hasOwn(value, key)) errors.push(`${location}.${key} is required.`);
      }
      for (const [key, entry] of Object.entries(value)) {
        if (!Object.hasOwn(properties, key)) {
          if (schema.additionalProperties === false) {
            errors.push(`${location}.${key} is not supported.`);
          }
          continue;
        }
        errors.push(...validateConfigValue(properties[key], entry, `${location}.${key}`));
      }
      break;
    }
    case 'array':
      if (!Array.isArray(value)) return [`${location} must be an array.`];
      value.forEach((entry, index) => {
        errors.push(...validateConfigValue(schema.items, entry, `${location}[${index}]`));
      });
      break;
    case 'string':
      if (typeof value !== 'string') errors.push(`${location} must be a string.`);
      break;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        errors.push(`${location} must be a finite number.`);
      }
      break;
    case 'integer':
      if (!Number.isInteger(value)) errors.push(`${location} must be an integer.`);
      break;
    case 'boolean':
      if (typeof value !== 'boolean') errors.push(`${location} must be a boolean.`);
      break;
    default:
      errors.push(`${location} has an unsupported schema type.`);
  }

  return errors;
}

function createArtifactTypeRegistry() {
  const types = new Map();

  return {
    register(definition) {
      if (
        !isPlainObject(definition) ||
        typeof definition.id !== 'string' ||
        !definition.id ||
        !Number.isInteger(definition.schemaVersion) ||
        typeof definition.validate !== 'function'
      ) {
        throw new Error('Artifact type definitions require an ID, schema version, and validator.');
      }
      if (types.has(definition.id)) {
        throw new Error(`Artifact type "${definition.id}" is already registered.`);
      }
      types.set(definition.id, Object.freeze({ ...definition }));
    },
    get(id) {
      return types.get(id) || null;
    },
    list() {
      return [...types.values()].map(({ validate: _validate, ...definition }) => definition);
    },
    validateValue(typeId, value) {
      const definition = types.get(typeId);
      if (!definition) throw new Error(`Artifact type "${typeId}" is not registered.`);
      if (!isJsonValue(value)) {
        throw new Error(`Artifact "${typeId}" must contain a JSON-serializable value.`);
      }
      const validationResult = definition.validate(value);
      if (validationResult !== true) {
        throw new Error(
          typeof validationResult === 'string'
            ? validationResult
            : `Artifact value does not match type "${typeId}".`,
        );
      }
    },
  };
}

function createArtifact(
  { type, value, producer, id = randomUUID() },
  artifactTypes,
) {
  artifactTypes.validateValue(type, value);
  const typeDefinition = artifactTypes.get(type);
  return {
    id,
    type,
    typeVersion: typeDefinition.schemaVersion,
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    value,
    producer,
  };
}

function createEmptyPipeline() {
  return {
    schemaVersion: PIPELINE_SCHEMA_VERSION,
    nodes: [],
    connections: [],
    output: { nodeId: PIPELINE_INPUT_NODE_ID, portId: 'text' },
  };
}

function throwIfPipelineCancelled(signal) {
  if (signal?.aborted) throw new PipelineCancelledError();
}

module.exports = {
  ANONYMIZATION_MAP_ARTIFACT_TYPE,
  ARTIFACT_SCHEMA_VERSION,
  PIPELINE_INPUT_NODE_ID,
  PIPELINE_SCHEMA_VERSION,
  PipelineCancelledError,
  PipelineExecutionError,
  TEXT_ARTIFACT_TYPE,
  createArtifact,
  createArtifactTypeRegistry,
  createEmptyPipeline,
  isJsonValue,
  isPlainObject,
  throwIfPipelineCancelled,
  validateConfigValue,
};
