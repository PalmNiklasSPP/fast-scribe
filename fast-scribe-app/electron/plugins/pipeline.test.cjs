const assert = require('node:assert/strict');
const test = require('node:test');

const {
  PIPELINE_INPUT_NODE_ID,
  TEXT_ARTIFACT_TYPE,
  createEmptyPipeline,
} = require('./contracts.cjs');
const { createPluginSystem } = require('./index.cjs');
const { runPipeline, validatePipeline } = require('./pipeline.cjs');
const { createPipelineService } = require('./pipeline-service.cjs');

function placeholderPipeline() {
  return {
    schemaVersion: 2,
    nodes: [{
      id: 'anonymize',
      pluginId: 'fast-scribe.placeholder-anonymizer',
      pluginVersion: '1.0.0',
      config: {},
    }],
    connections: [{
      from: { nodeId: PIPELINE_INPUT_NODE_ID, portId: 'text' },
      to: { nodeId: 'anonymize', portId: 'text' },
    }],
    output: { nodeId: 'anonymize', portId: 'text' },
    layout: { anonymize: { x: 120, y: 240 } },
    destinations: [],
  };
}

function createMemoryStore(values = {}) {
  return {
    get: (key, fallback) => Object.hasOwn(values, key) ? values[key] : fallback,
    set: (key, value) => {
      values[key] = structuredClone(value);
    },
  };
}

test('empty pipeline passes text through as the final artifact', async () => {
  const { artifactTypes, plugins } = createPluginSystem();
  const result = await runPipeline({
    pipeline: createEmptyPipeline(),
    inputText: 'Raw transcript',
    artifactTypes,
    plugins,
    signal: new AbortController().signal,
  });

  assert.equal(result.finalArtifact.value, 'Raw transcript');
  assert.equal(result.artifacts.length, 1);
});

test('placeholder anonymizer transforms text and emits a replacement map', async () => {
  const { artifactTypes, plugins } = createPluginSystem();
  const result = await runPipeline({
    pipeline: placeholderPipeline(),
    inputText: 'Call 12345 tomorrow.',
    artifactTypes,
    plugins,
    signal: new AbortController().signal,
  });

  assert.match(result.finalArtifact.value, /Placeholder anonymization applied/);
  assert.match(result.finalArtifact.value, /\[NUMBER_1\]/);
  assert.deepEqual(result.artifacts.at(-1).value, {
    version: 1,
    replacements: [{ token: '[NUMBER_1]', original: '12345' }],
  });
});

test('pipeline validation rejects invalid layout, destinations, missing inputs, unavailable plugins, and cycles', () => {
  const { plugins } = createPluginSystem();
  const invalidLayout = placeholderPipeline();
  invalidLayout.layout.anonymize.x = Number.NaN;
  assert.match(validatePipeline(invalidLayout, plugins).errors.join(' '), /layout position/);

  const invalidDestination = placeholderPipeline();
  invalidDestination.destinations = [{
    id: 'map',
    from: { nodeId: 'anonymize', portId: 'map' },
    artifactType: 'fast-scribe/anonymization-map',
    serializer: 'txt',
    folderMode: 'settings',
    filenameTemplate: '../map',
  }];
  assert.match(validatePipeline(invalidDestination, plugins).errors.join(' '), /serializer|filename template/);

  const missingInput = placeholderPipeline();
  missingInput.connections = [];
  assert.match(validatePipeline(missingInput, plugins).errors.join(' '), /not connected/);

  const unavailable = placeholderPipeline();
  unavailable.nodes[0].pluginVersion = '2.0.0';
  assert.match(validatePipeline(unavailable, plugins).errors.join(' '), /unavailable/);

  const cyclic = placeholderPipeline();
  cyclic.nodes.push({
    id: 'second',
    pluginId: 'fast-scribe.placeholder-anonymizer',
    pluginVersion: '1.0.0',
    config: {},
  });
  cyclic.connections = [
    { from: { nodeId: 'second', portId: 'text' }, to: { nodeId: 'anonymize', portId: 'text' } },
    { from: { nodeId: 'anonymize', portId: 'text' }, to: { nodeId: 'second', portId: 'text' } },
  ];
  assert.match(validatePipeline(cyclic, plugins).errors.join(' '), /cycle/);
});

test('pipeline service migrates legacy storage and persists selected revisions', () => {
  const legacy = placeholderPipeline();
  legacy.schemaVersion = 1;
  delete legacy.layout;
  delete legacy.destinations;
  const values = { pluginPipeline: legacy };
  const { plugins } = createPluginSystem();
  const changes = [];
  const service = createPipelineService({
    store: createMemoryStore(values),
    plugins,
    nowImpl: () => '2026-09-11T00:00:00.000Z',
    randomUUIDImpl: () => 'created-pipeline',
    onSelectedPipelineChange: (state) => changes.push(state),
  });

  const migrated = service.getPipeline();
  assert.equal(migrated.pipeline.id, 'default');
  assert.equal(migrated.pipeline.pipeline.schemaVersion, 2);
  assert.deepEqual(migrated.pipeline.pipeline.layout, {});
  assert.equal(service.listPipelines().selected.revision, 1);

  const saved = service.savePipeline({
    id: migrated.pipeline.id,
    name: 'Processed transcript',
    pipeline: migrated.pipeline.pipeline,
    expectedRevision: 1,
  });
  assert.equal(saved.pipeline.revision, 2);
  assert.equal(changes.length, 1);
  assert.throws(() => service.savePipeline({
    id: migrated.pipeline.id,
    name: 'Stale',
    pipeline: migrated.pipeline.pipeline,
    expectedRevision: 1,
  }), /changed in another window/);
});

test('pipeline service exposes unavailable plugins as a recoverable state', () => {
  const invalid = placeholderPipeline();
  invalid.nodes[0].pluginVersion = 'missing';
  const { plugins } = createPluginSystem();
  const service = createPipelineService({
    store: createMemoryStore({ pluginPipeline: invalid }),
    plugins,
  });

  const state = service.getPipeline();
  assert.equal(state.recoverable, true);
  assert.match(state.validation.errors.join(' '), /unavailable/);
  assert.throws(() => service.getSelectedPipeline(), /unavailable/);
});

test('pipeline persists the raw artifact before a plugin failure', async () => {
  const { artifactTypes, plugins } = createPluginSystem();
  plugins.register({
    manifest: {
      id: 'test.failing',
      version: '1.0.0',
      name: 'Failing plugin',
      description: 'Fails for execution testing.',
      inputs: [{ id: 'text', type: TEXT_ARTIFACT_TYPE, required: true }],
      outputs: [{ id: 'text', type: TEXT_ARTIFACT_TYPE, required: true }],
      configSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    execute: async () => {
      throw new Error('plugin failed');
    },
  });
  const pipeline = placeholderPipeline();
  pipeline.nodes[0].pluginId = 'test.failing';

  const persisted = [];
  await assert.rejects(
    runPipeline({
      pipeline,
      inputText: 'Raw transcript',
      artifactTypes,
      plugins,
      signal: new AbortController().signal,
      onArtifact: async (artifact) => persisted.push(artifact),
    }),
    /plugin failed/,
  );
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].value, 'Raw transcript');
});
