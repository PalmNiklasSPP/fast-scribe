const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const test = require('node:test');

const { createArtifact } = require('./plugins/contracts.cjs');
const { createPluginSystem } = require('./plugins/index.cjs');
const { createEmptyPipeline } = require('./plugins/contracts.cjs');
const { createRunStore } = require('./run-store.cjs');

test('run store persists manifests and typed artifacts across instances', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fastscribe-runs-'));
  const { artifactTypes } = createPluginSystem();
  const ids = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
  ];
  const dependencies = {
    rootDir: root,
    artifactTypes,
    randomUUIDImpl: () => ids.shift(),
    nowImpl: () => '2026-09-11T10:00:00.000Z',
  };

  try {
    const store = createRunStore(dependencies);
    const run = await store.create({
      sourcePath: path.join(root, 'recording.m4a'),
      pipeline: createEmptyPipeline(),
    });
    const artifact = createArtifact(
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        type: 'fast-scribe/text',
        value: 'Raw transcript',
        producer: { kind: 'pipeline-input' },
      },
      artifactTypes,
    );
    await store.addArtifact(run.id, artifact);
    await store.update(run.id, {
      status: 'completed',
      finalArtifactId: artifact.id,
      outputPath: path.join(root, 'recording.txt'),
      finishedAt: '2026-09-11T10:01:00.000Z',
      publication: [{
        id: 'primary',
        kind: 'primary',
        artifactId: artifact.id,
        artifactType: artifact.type,
        path: path.join(root, 'recording.txt'),
        status: 'published',
      }],
    });

    const restartedStore = createRunStore({
      ...dependencies,
      randomUUIDImpl: () => '44444444-4444-4444-8444-444444444444',
    });
    assert.equal((await restartedStore.list())[0].status, 'completed');
    assert.equal((await restartedStore.get(run.id)).publication[0].status, 'published');
    assert.equal((await restartedStore.readArtifact(run.id, artifact.id)).value, 'Raw transcript');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('run store rejects invalid IDs and artifacts outside a run', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fastscribe-runs-'));
  const { artifactTypes } = createPluginSystem();
  const store = createRunStore({
    rootDir: root,
    artifactTypes,
    randomUUIDImpl: () => '11111111-1111-4111-8111-111111111111',
  });

  try {
    const run = await store.create({
      sourcePath: path.join(root, 'recording.m4a'),
      pipeline: createEmptyPipeline(),
    });
    await assert.rejects(store.get('..'), /Run ID is invalid/);
    await assert.rejects(
      store.readArtifact(run.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
      /not part of this run/,
    );
    await assert.rejects(
      store.addArtifact(run.id, {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        type: 'fast-scribe/text',
        typeVersion: 1,
        schemaVersion: 99,
        value: 'Unsupported',
        producer: { kind: 'pipeline-input' },
      }),
      /schema version is unsupported/,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('run store reports corrupted manifests instead of hiding them', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fastscribe-runs-'));
  const runId = '11111111-1111-4111-8111-111111111111';
  const { artifactTypes } = createPluginSystem();
  const store = createRunStore({ rootDir: root, artifactTypes });

  try {
    await fs.mkdir(path.join(root, runId));
    await fs.writeFile(path.join(root, runId, 'run.json'), '{not json', 'utf8');
    await assert.rejects(store.list(), /Run is corrupted/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
