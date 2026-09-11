const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { PublicationError, buildTargets, publishArtifacts, renderFilename } = require('./destination-publication.cjs');

function artifacts() {
  const final = {
    id: 'final',
    type: 'fast-scribe/text',
    value: 'Processed transcript',
    producer: { nodeId: 'anonymize', portId: 'text' },
  };
  return {
    final,
    all: [
      final,
      {
        id: 'map',
        type: 'fast-scribe/anonymization-map',
        value: { version: 1, replacements: [{ token: '[NUMBER_1]', original: '123' }] },
        producer: { nodeId: 'anonymize', portId: 'map' },
      },
    ],
  };
}

test('filename templates allow only safe names and the source-name token', () => {
  assert.equal(renderFilename('{sourceName}-processed', 'meeting', '.txt'), 'meeting-processed.txt');
  assert.throws(() => renderFilename('../secret', 'meeting', '.txt'), /unsafe/);
  assert.throws(() => renderFilename('map.json', 'meeting', '.txt'), /\.txt extension/);
});

test('publication suffixes collisions and serializes secondary maps', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fast-scribe-publication-'));
  try {
    const primaryPath = path.join(root, 'meeting.txt');
    await fs.writeFile(primaryPath, 'Existing output', 'utf8');
    const { final, all } = artifacts();
    const publication = await publishArtifacts({
      sourcePath: path.join(root, 'meeting.wav'),
      primaryOutputPath: primaryPath,
      finalArtifact: final,
      artifacts: all,
      destinations: [{
        id: 'map-output',
        from: { nodeId: 'anonymize', portId: 'map' },
        artifactType: 'fast-scribe/anonymization-map',
        serializer: 'json',
        folderMode: 'settings',
        filenameTemplate: '{sourceName}-map',
      }],
      settingsOutputDir: root,
    });
    assert.equal(publication.outputPath, path.join(root, 'meeting (2).txt'));
    assert.equal(await fs.readFile(primaryPath, 'utf8'), 'Existing output');
    assert.equal(await fs.readFile(publication.outputPath, 'utf8'), 'Processed transcript');
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, 'meeting-map.json'), 'utf8')), all[1].value);
    assert.deepEqual(publication.results.map((result) => result.status), ['published', 'published']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('destination folders prefer a custom folder over Settings and source folders', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fast-scribe-publication-'));
  try {
    const customFolder = path.join(root, 'custom');
    const { final, all } = artifacts();
    const targets = await buildTargets({
      sourcePath: path.join(root, 'source', 'meeting.wav'),
      primaryOutputPath: path.join(root, 'settings', 'meeting.txt'),
      finalArtifact: final,
      artifacts: all,
      destinations: [{
        id: 'map-output',
        from: { nodeId: 'anonymize', portId: 'map' },
        artifactType: 'fast-scribe/anonymization-map',
        serializer: 'json',
        folderMode: 'custom',
        customFolder,
        filenameTemplate: '{sourceName}-map',
      }],
      settingsOutputDir: path.join(root, 'settings'),
    });
    assert.equal(targets[1].path, path.join(customFolder, 'meeting-map.json'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('publication rolls back earlier files when a later destination fails', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fast-scribe-publication-'));
  try {
    const { final, all } = artifacts();
    let links = 0;
    const fsImpl = {
      ...fs,
      link: async (...args) => {
        links += 1;
        if (links === 2) throw new Error('disk error');
        return fs.link(...args);
      },
    };
    await assert.rejects(
      publishArtifacts({
        sourcePath: path.join(root, 'meeting.wav'),
        primaryOutputPath: path.join(root, 'meeting.txt'),
        finalArtifact: final,
        artifacts: all,
        destinations: [{
          id: 'map-output',
          from: { nodeId: 'anonymize', portId: 'map' },
          artifactType: 'fast-scribe/anonymization-map',
          serializer: 'json',
          folderMode: 'settings',
          filenameTemplate: 'map',
        }],
        settingsOutputDir: root,
      }, { fsImpl }),
      (error) => {
        assert.ok(error instanceof PublicationError);
        assert.deepEqual(error.results.map((result) => result.status), ['rolled_back', 'staged']);
        return true;
      },
    );
    await assert.rejects(fs.access(path.join(root, 'meeting.txt')));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
