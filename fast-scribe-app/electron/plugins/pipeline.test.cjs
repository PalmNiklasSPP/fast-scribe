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
    schemaVersion: 1,
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

test('pipeline validation rejects missing inputs, unavailable plugins, and cycles', () => {
  const { plugins } = createPluginSystem();
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
    {
      from: { nodeId: 'second', portId: 'text' },
      to: { nodeId: 'anonymize', portId: 'text' },
    },
    {
      from: { nodeId: 'anonymize', portId: 'text' },
      to: { nodeId: 'second', portId: 'text' },
    },
  ];
  assert.match(validatePipeline(cyclic, plugins).errors.join(' '), /cycle/);
});

test('pipeline service persists only valid pipeline definitions', () => {
  const values = {};
  const store = {
    get: (key, fallback) => Object.hasOwn(values, key) ? values[key] : fallback,
    set: (key, value) => {
      values[key] = value;
    },
  };
  const { plugins } = createPluginSystem();
  const service = createPipelineService({ store, plugins });

  assert.deepEqual(service.getPipeline(), createEmptyPipeline());
  assert.deepEqual(service.savePipeline(placeholderPipeline()), placeholderPipeline());
  assert.throws(() => service.savePipeline({}), /Invalid pipeline/);
});

test('pipeline persists the raw artifact before a plugin failure', async () => {
  const { artifactTypes, plugins } = createPluginSystem();
  const persisted = [];
  plugins.register({
    manifest: {
      id: 'test.failing',
      version: '1.0.0',
      name: 'Failing plugin',
      description: 'Fails for execution testing.',
      inputs: [{ id: 'text', type: TEXT_ARTIFACT_TYPE, required: true }],
      outputs: [{ id: 'text', type: TEXT_ARTIFACT_TYPE, required: true }],
      configSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    execute: async () => {
      throw new Error('plugin failed');
    },
  });
  const pipeline = placeholderPipeline();
  pipeline.nodes[0].pluginId = 'test.failing';

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
