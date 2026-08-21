const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const test = require('node:test');

const {
  TranscriptionCancelledError,
  buildFfmpegArgs,
  createTranscriptionJob,
  resolveFfmpegPath,
  runTranscription,
  segmentAudio,
  transcribeChunk,
} = require('./transcription.cjs');

const config = {
  endpoint: 'https://example.test/audio/transcriptions',
  apiKey: 'test-key',
  model: 'gpt-4o-transcribe',
  language: 'sv',
  chunkDurationMs: 600_000,
};

test('resolveFfmpegPath redirects packaged ASAR paths to the unpacked binary', () => {
  const packagedPath = path.join('C:', 'app', 'resources', 'app.asar', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
  const expectedPath = path.join('C:', 'app', 'resources', 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');

  assert.equal(resolveFfmpegPath(packagedPath), expectedPath);
});

test('buildFfmpegArgs creates PCM segments with the configured duration', () => {
  const args = buildFfmpegArgs('input.m4a', 'chunk_%05d.wav', 90_000);

  assert.deepEqual(args, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    'input.m4a',
    '-map',
    '0:a:0',
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-c:a',
    'pcm_s16le',
    '-f',
    'segment',
    '-segment_time',
    '90',
    '-reset_timestamps',
    '1',
    'chunk_%05d.wav',
  ]);
});

test('segmentAudio runs the bundled FFmpeg binary', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fastscribe-ffmpeg-test-'));
  const inputPath = path.join(root, 'input.wav');
  const chunkPattern = path.join(root, 'chunk_%05d.wav');
  const sampleRate = 16_000;
  const audioData = Buffer.alloc(sampleRate * 2);
  const wav = Buffer.alloc(44 + audioData.length);

  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(audioData.length, 40);
  audioData.copy(wav, 44);

  await fs.writeFile(inputPath, wav);

  try {
    await segmentAudio({
      ffmpegPath: resolveFfmpegPath(),
      inputPath,
      chunkPattern,
      chunkDurationMs: 250,
      signal: new AbortController().signal,
      onProcess: () => {},
    });

    const chunks = (await fs.readdir(root)).filter((file) => file.startsWith('chunk_'));
    assert.ok(chunks.length >= 3);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('transcribeChunk sends the Azure multipart request and returns text', async () => {
  const signal = new AbortController().signal;
  const text = await transcribeChunk({
    filePath: 'chunk_00000.wav',
    ...config,
    signal,
    readFileImpl: async () => Buffer.from('audio'),
    fetchImpl: async (endpoint, request) => {
      assert.equal(endpoint, config.endpoint);
      assert.equal(request.method, 'POST');
      assert.equal(request.headers['api-key'], config.apiKey);
      assert.equal(request.body.get('model'), config.model);
      assert.equal(request.body.get('language'), config.language);
      assert.equal(request.body.get('file').name, 'chunk_00000.wav');
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ text: 'transcribed text' }),
      };
    },
  });

  assert.equal(text, 'transcribed text');
});

test('transcribeChunk surfaces Azure API failures', async () => {
  await assert.rejects(
    transcribeChunk({
      filePath: 'chunk.wav',
      ...config,
      signal: new AbortController().signal,
      readFileImpl: async () => Buffer.from('audio'),
      fetchImpl: async () => ({
        ok: false,
        status: 429,
        text: async () => 'rate limited',
      }),
    }),
    /API error 429: rate limited/,
  );
});

test('runTranscription publishes a complete transcript and removes working files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fastscribe-test-'));
  const tempRoot = path.join(root, 'jobs');
  const outputDir = path.join(root, 'output');
  const inputPath = path.join(root, 'recording.m4a');
  const events = [];

  await fs.mkdir(tempRoot);
  await fs.mkdir(outputDir);
  await fs.writeFile(inputPath, 'input');
  await fs.writeFile(path.join(outputDir, 'recording.txt'), 'existing transcript');

  try {
    const outputPath = await runTranscription(
      {
        inputPath,
        outputDir,
        config,
        signal: new AbortController().signal,
        onEvent: (event) => events.push(event),
      },
      {
        tempRoot,
        ffmpegPath: 'ffmpeg',
        randomUUIDImpl: () => 'job-id',
        segmentAudioImpl: async ({ chunkPattern }) => {
          const directory = path.dirname(chunkPattern);
          await fs.writeFile(path.join(directory, 'chunk_00000.wav'), 'first');
          await fs.writeFile(path.join(directory, 'chunk_00001.wav'), 'second');
        },
        transcribeChunkImpl: async ({ filePath }) => path.basename(filePath),
      },
    );

    assert.equal(outputPath, path.join(outputDir, 'recording.txt'));
    assert.equal(
      await fs.readFile(outputPath, 'utf8'),
      '--- Transcription Start ---\n\nchunk_00000.wav\n\nchunk_00001.wav\n\n--- Transcription End ---\n',
    );
    assert.deepEqual(await fs.readdir(tempRoot), []);
    assert.equal(events.at(-1).progress, 100);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('runTranscription preserves an existing transcript and cleans up after failure', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fastscribe-test-'));
  const tempRoot = path.join(root, 'jobs');
  const outputDir = path.join(root, 'output');
  const inputPath = path.join(root, 'recording.m4a');
  const outputPath = path.join(outputDir, 'recording.txt');

  await fs.mkdir(tempRoot);
  await fs.mkdir(outputDir);
  await fs.writeFile(inputPath, 'input');
  await fs.writeFile(outputPath, 'existing transcript');

  try {
    await assert.rejects(
      runTranscription(
        {
          inputPath,
          outputDir,
          config,
          signal: new AbortController().signal,
          onEvent: () => {},
        },
        {
          tempRoot,
          ffmpegPath: 'ffmpeg',
          randomUUIDImpl: () => 'job-id',
          segmentAudioImpl: async ({ chunkPattern }) => {
            await fs.writeFile(
              path.join(path.dirname(chunkPattern), 'chunk_00000.wav'),
              'audio',
            );
          },
          transcribeChunkImpl: async () => {
            throw new Error('request failed');
          },
        },
      ),
      /request failed/,
    );

    assert.equal(await fs.readFile(outputPath, 'utf8'), 'existing transcript');
    assert.deepEqual(await fs.readdir(tempRoot), []);
    assert.deepEqual(await fs.readdir(outputDir), ['recording.txt']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('createTranscriptionJob aborts active work and cleans up', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fastscribe-test-'));
  const tempRoot = path.join(root, 'jobs');
  const inputPath = path.join(root, 'recording.m4a');
  let transcriptionStarted;
  const started = new Promise((resolve) => {
    transcriptionStarted = resolve;
  });

  await fs.mkdir(tempRoot);
  await fs.writeFile(inputPath, 'input');

  try {
    const job = createTranscriptionJob(
      {
        inputPath,
        outputDir: root,
        config,
        onEvent: () => {},
      },
      {
        tempRoot,
        ffmpegPath: 'ffmpeg',
        segmentAudioImpl: async ({ chunkPattern }) => {
          await fs.writeFile(
            path.join(path.dirname(chunkPattern), 'chunk_00000.wav'),
            'audio',
          );
        },
        transcribeChunkImpl: ({ signal }) => new Promise((_resolve, reject) => {
          transcriptionStarted();
          signal.addEventListener(
            'abort',
            () => reject(new TranscriptionCancelledError()),
            { once: true },
          );
        }),
      },
    );

    const completion = job.start();
    await started;
    job.cancel();

    await assert.rejects(completion, TranscriptionCancelledError);
    assert.deepEqual(await fs.readdir(tempRoot), []);
    assert.equal(
      await fs.access(path.join(root, 'recording.txt')).then(() => true, () => false),
      false,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('cancellation before publication does not replace the final transcript', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fastscribe-test-'));
  const tempRoot = path.join(root, 'jobs');
  const outputDir = path.join(root, 'output');
  const inputPath = path.join(root, 'recording.m4a');
  const outputPath = path.join(outputDir, 'recording.txt');
  const controller = new AbortController();
  const fsImpl = new Proxy(fs, {
    get(target, property) {
      if (property === 'writeFile') {
        return async (...args) => {
          await target.writeFile(...args);
          if (args[0].toString().endsWith('.tmp')) controller.abort();
        };
      }
      return target[property];
    },
  });

  await fs.mkdir(tempRoot);
  await fs.mkdir(outputDir);
  await fs.writeFile(inputPath, 'input');
  await fs.writeFile(outputPath, 'existing transcript');

  try {
    await assert.rejects(
      runTranscription(
        {
          inputPath,
          outputDir,
          config,
          signal: controller.signal,
          onEvent: () => {},
        },
        {
          fsImpl,
          tempRoot,
          ffmpegPath: 'ffmpeg',
          randomUUIDImpl: () => 'job-id',
          segmentAudioImpl: async ({ chunkPattern }) => {
            await fs.writeFile(
              path.join(path.dirname(chunkPattern), 'chunk_00000.wav'),
              'audio',
            );
          },
          transcribeChunkImpl: async () => 'new transcript',
        },
      ),
      TranscriptionCancelledError,
    );

    assert.equal(await fs.readFile(outputPath, 'utf8'), 'existing transcript');
    assert.deepEqual(await fs.readdir(tempRoot), []);
    assert.deepEqual(await fs.readdir(outputDir), ['recording.txt']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
