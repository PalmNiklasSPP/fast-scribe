const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const test = require('node:test');

const {
  createTranscriptFileService,
  readTranscript,
  resolveTranscriptPath,
  writeTranscript,
} = require('./transcript-files.cjs');

test('resolveTranscriptPath accepts only absolute plain-text paths', () => {
  const transcriptPath = path.join(os.tmpdir(), 'recording.TXT');

  assert.equal(resolveTranscriptPath(transcriptPath), path.normalize(transcriptPath));
  assert.throws(() => resolveTranscriptPath('recording.txt'), /must be absolute/);
  assert.throws(
    () => resolveTranscriptPath(path.join(os.tmpdir(), 'recording.md')),
    /Only plain-text transcript files/,
  );
});

test('readTranscript returns the saved text', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fastscribe-transcript-test-'));
  const transcriptPath = path.join(root, 'recording.txt');
  await fs.writeFile(transcriptPath, 'Original transcript', 'utf8');

  try {
    assert.equal(await readTranscript(transcriptPath), 'Original transcript');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('writeTranscript atomically replaces the transcript and removes its temporary file', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fastscribe-transcript-test-'));
  const transcriptPath = path.join(root, 'recording.txt');
  await fs.writeFile(transcriptPath, 'Original transcript', 'utf8');

  try {
    await writeTranscript(transcriptPath, 'Edited transcript', {
      randomUUIDImpl: () => 'save-id',
    });

    assert.equal(await fs.readFile(transcriptPath, 'utf8'), 'Edited transcript');
    assert.deepEqual(await fs.readdir(root), ['recording.txt']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('writeTranscript preserves the existing transcript when replacement fails', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fastscribe-transcript-test-'));
  const transcriptPath = path.join(root, 'recording.txt');
  await fs.writeFile(transcriptPath, 'Original transcript', 'utf8');
  const fsImpl = {
    writeFile: fs.writeFile,
    rename: async () => {
      throw new Error('Replacement failed');
    },
    rm: fs.rm,
  };

  try {
    await assert.rejects(
      writeTranscript(transcriptPath, 'Edited transcript', {
        fsImpl,
        randomUUIDImpl: () => 'save-id',
      }),
      /Replacement failed/,
    );

    assert.equal(await fs.readFile(transcriptPath, 'utf8'), 'Original transcript');
    assert.deepEqual(await fs.readdir(root), ['recording.txt']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('transcript file service accesses only explicitly allowed transcripts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fastscribe-transcript-test-'));
  const transcriptPath = path.join(root, 'recording.txt');
  const otherPath = path.join(root, 'other.txt');
  await fs.writeFile(transcriptPath, 'Original transcript', 'utf8');
  await fs.writeFile(otherPath, 'Other text', 'utf8');
  const service = createTranscriptFileService();

  try {
    assert.throws(() => service.read(transcriptPath), /not available for editing/);
    service.allow(transcriptPath);

    assert.equal(await service.read(transcriptPath), 'Original transcript');
    await service.write(transcriptPath, 'Edited transcript');
    assert.equal(await fs.readFile(transcriptPath, 'utf8'), 'Edited transcript');
    assert.throws(() => service.read(otherPath), /not available for editing/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
