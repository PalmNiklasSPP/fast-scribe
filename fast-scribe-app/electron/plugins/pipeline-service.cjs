const { randomUUID } = require('crypto');
const {
  PIPELINE_COLLECTION_SCHEMA_VERSION,
  PIPELINE_SCHEMA_VERSION,
  createEmptyPipeline,
  isPlainObject,
} = require('./contracts.cjs');
const { assertValidPipeline, validatePipeline } = require('./pipeline.cjs');

const PIPELINE_STORE_KEY = 'pluginPipeline';
const PIPELINE_COLLECTION_STORE_KEY = 'pipelineCollection';
const DEFAULT_PIPELINE_ID = 'default';

function now() {
  return new Date().toISOString();
}

function migratePipeline(pipeline) {
  if (!isPlainObject(pipeline)) return pipeline;
  if (pipeline.schemaVersion === PIPELINE_SCHEMA_VERSION) return structuredClone(pipeline);
  if (pipeline.schemaVersion !== 1) return structuredClone(pipeline);
  return {
    ...structuredClone(pipeline),
    schemaVersion: PIPELINE_SCHEMA_VERSION,
    layout: {},
    destinations: [],
  };
}

function createDefaultRecord(pipeline = createEmptyPipeline(), timestamp = now()) {
  return {
    id: DEFAULT_PIPELINE_ID,
    name: 'Default pipeline',
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    pipeline: migratePipeline(pipeline),
  };
}

function createDefaultCollection(pipeline, timestamp = now()) {
  const record = createDefaultRecord(pipeline, timestamp);
  return {
    schemaVersion: PIPELINE_COLLECTION_SCHEMA_VERSION,
    selected: { pipelineId: record.id, revision: record.revision },
    pipelines: [record],
  };
}

function validateCollection(collection) {
  if (
    !isPlainObject(collection) ||
    collection.schemaVersion !== PIPELINE_COLLECTION_SCHEMA_VERSION ||
    !isPlainObject(collection.selected) ||
    typeof collection.selected.pipelineId !== 'string' ||
    !Number.isInteger(collection.selected.revision) ||
    !Array.isArray(collection.pipelines)
  ) {
    return 'Pipeline collection is invalid.';
  }
  const ids = new Set();
  for (const record of collection.pipelines) {
    if (
      !isPlainObject(record) ||
      typeof record.id !== 'string' ||
      !record.id ||
      typeof record.name !== 'string' ||
      !record.name.trim() ||
      !Number.isInteger(record.revision) ||
      record.revision < 1 ||
      typeof record.createdAt !== 'string' ||
      typeof record.updatedAt !== 'string' ||
      !isPlainObject(record.pipeline)
    ) {
      return 'Pipeline collection contains an invalid record.';
    }
    if (ids.has(record.id)) return `Pipeline record ID "${record.id}" is duplicated.`;
    ids.add(record.id);
  }
  const selected = collection.pipelines.find((record) => record.id === collection.selected.pipelineId);
  if (!selected || selected.revision !== collection.selected.revision) {
    return 'Pipeline collection selected revision is invalid.';
  }
  return null;
}

function createPipelineService({
  store,
  plugins,
  nowImpl = now,
  randomUUIDImpl = randomUUID,
  onSelectedPipelineChange = () => {},
}) {
  const readCollection = () => {
    const stored = store.get(PIPELINE_COLLECTION_STORE_KEY);
    if (stored !== undefined) {
      const collectionError = validateCollection(stored);
      if (collectionError) throw new Error(collectionError);
      return structuredClone(stored);
    }

    const legacy = store.get(PIPELINE_STORE_KEY);
    const collection = createDefaultCollection(legacy === undefined ? createEmptyPipeline() : legacy, nowImpl());
    store.set(PIPELINE_COLLECTION_STORE_KEY, collection);
    return structuredClone(collection);
  };

  const writeCollection = (collection) => {
    store.set(PIPELINE_COLLECTION_STORE_KEY, structuredClone(collection));
  };

  const toPipelineState = (record) => {
    const validation = validatePipeline(record.pipeline, plugins);
    return {
      pipeline: structuredClone(record),
      validation: { valid: validation.valid, errors: validation.errors },
      recoverable: !validation.valid,
    };
  };

  const getRecord = (collection, pipelineId) => {
    const record = collection.pipelines.find((entry) => entry.id === pipelineId);
    if (!record) throw new Error('Pipeline was not found.');
    return record;
  };

  const getSelectedState = () => {
    const collection = readCollection();
    return toPipelineState(getRecord(collection, collection.selected.pipelineId));
  };

  const publishSelectedChange = () => onSelectedPipelineChange(getSelectedState());

  return {
    listPipelines() {
      const collection = readCollection();
      return {
        selected: structuredClone(collection.selected),
        pipelines: collection.pipelines.map((record) => {
          const validation = validatePipeline(record.pipeline, plugins);
          return {
            id: record.id,
            name: record.name,
            revision: record.revision,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
            valid: validation.valid,
            errors: validation.errors,
          };
        }),
      };
    },
    getPipeline(pipelineId) {
      const collection = readCollection();
      return toPipelineState(getRecord(collection, pipelineId || collection.selected.pipelineId));
    },
    getSelectedPipeline() {
      const state = getSelectedState();
      assertValidPipeline(state.pipeline.pipeline, plugins);
      return structuredClone(state.pipeline);
    },
    validatePipeline(pipeline) {
      const result = validatePipeline(pipeline, plugins);
      return { valid: result.valid, errors: result.errors };
    },
    createPipeline({ name, pipeline = createEmptyPipeline() }) {
      if (typeof name !== 'string' || !name.trim()) throw new Error('Pipeline name is required.');
      assertValidPipeline(pipeline, plugins);
      const collection = readCollection();
      const timestamp = nowImpl();
      const record = {
        id: randomUUIDImpl(),
        name: name.trim(),
        revision: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        pipeline: structuredClone(pipeline),
      };
      collection.pipelines.push(record);
      writeCollection(collection);
      return toPipelineState(record);
    },
    savePipeline({ id, name, pipeline, expectedRevision }) {
      if (typeof id !== 'string' || !id) throw new Error('Pipeline ID is required.');
      if (typeof name !== 'string' || !name.trim()) throw new Error('Pipeline name is required.');
      if (!Number.isInteger(expectedRevision)) throw new Error('Pipeline revision is required.');
      assertValidPipeline(pipeline, plugins);
      const collection = readCollection();
      const recordIndex = collection.pipelines.findIndex((record) => record.id === id);
      if (recordIndex < 0) throw new Error('Pipeline was not found.');
      const current = collection.pipelines[recordIndex];
      if (current.revision !== expectedRevision) {
        throw new Error('This pipeline changed in another window. Reload it before saving.');
      }
      const updated = {
        ...current,
        name: name.trim(),
        revision: current.revision + 1,
        updatedAt: nowImpl(),
        pipeline: structuredClone(pipeline),
      };
      collection.pipelines[recordIndex] = updated;
      if (collection.selected.pipelineId === id) {
        collection.selected = { pipelineId: id, revision: updated.revision };
      }
      writeCollection(collection);
      if (collection.selected.pipelineId === id) publishSelectedChange();
      return toPipelineState(updated);
    },
    selectPipeline({ id, expectedRevision }) {
      if (typeof id !== 'string' || !id) throw new Error('Pipeline ID is required.');
      const collection = readCollection();
      const record = getRecord(collection, id);
      if (expectedRevision !== undefined && record.revision !== expectedRevision) {
        throw new Error('This pipeline changed in another window. Reload it before selecting.');
      }
      collection.selected = { pipelineId: id, revision: record.revision };
      writeCollection(collection);
      publishSelectedChange();
      return toPipelineState(record);
    },
  };
}

module.exports = {
  DEFAULT_PIPELINE_ID,
  PIPELINE_COLLECTION_STORE_KEY,
  PIPELINE_STORE_KEY,
  createPipelineService,
  migratePipeline,
};
