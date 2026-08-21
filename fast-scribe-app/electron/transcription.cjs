const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const ffmpegStaticPath = require('ffmpeg-static');

class TranscriptionCancelledError extends Error {
  constructor() {
    super('Transcription cancelled.');
    this.name = 'TranscriptionCancelledError';
  }
}

function resolveFfmpegPath(binaryPath = ffmpegStaticPath) {
  if (!binaryPath) {
    throw new Error(`No bundled FFmpeg binary is available for ${process.platform}/${process.arch}.`);
  }

  return binaryPath.replace(
    `${path.sep}app.asar${path.sep}`,
    `${path.sep}app.asar.unpacked${path.sep}`,
  );
}

function buildFfmpegArgs(inputPath, chunkPattern, chunkDurationMs) {
  if (!Number.isFinite(chunkDurationMs) || chunkDurationMs <= 0) {
    throw new Error('Chunk duration must be greater than zero.');
  }

  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    inputPath,
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
    String(chunkDurationMs / 1000),
    '-reset_timestamps',
    '1',
    chunkPattern,
  ];
}

function throwIfCancelled(signal) {
  if (signal.aborted) {
    throw new TranscriptionCancelledError();
  }
}

function getTranscriptOutputPath(inputPath, outputDir) {
  const resolvedOutputDir = outputDir || path.dirname(path.resolve(inputPath));
  return path.join(resolvedOutputDir, `${path.parse(inputPath).name}.txt`);
}

function segmentAudio({
  ffmpegPath,
  inputPath,
  chunkPattern,
  chunkDurationMs,
  signal,
  onProcess,
  spawnImpl = spawn,
}) {
  throwIfCancelled(signal);

  return new Promise((resolve, reject) => {
    const child = spawnImpl(
      ffmpegPath,
      buildFfmpegArgs(inputPath, chunkPattern, chunkDurationMs),
      { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true },
    );
    let stderr = '';
    let settled = false;

    onProcess(child);

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', handleAbort);
      onProcess(null);
      callback();
    };

    const handleAbort = () => {
      if (!child.killed) child.kill();
    };

    signal.addEventListener('abort', handleAbort, { once: true });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.once('error', (error) => {
      finish(() => reject(error));
    });

    child.once('close', (code) => {
      finish(() => {
        if (signal.aborted) {
          reject(new TranscriptionCancelledError());
        } else if (code === 0) {
          resolve();
        } else {
          reject(new Error(stderr.trim() || `FFmpeg exited with code ${code}.`));
        }
      });
    });
  });
}

async function transcribeChunk({
  filePath,
  endpoint,
  apiKey,
  model,
  language,
  signal,
  fetchImpl = fetch,
  readFileImpl = fs.readFile,
}) {
  throwIfCancelled(signal);

  const audio = await readFileImpl(filePath);
  const form = new FormData();
  form.append('file', new Blob([audio], { type: 'audio/wav' }), path.basename(filePath));
  form.append('model', model);
  if (language && language !== 'auto') {
    form.append('language', language);
  }

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'api-key': apiKey },
    body: form,
    signal,
  });
  const responseBody = await response.text();

  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${responseBody}`);
  }

  let data;
  try {
    data = JSON.parse(responseBody);
  } catch {
    throw new Error('The transcription API returned invalid JSON.');
  }

  if (typeof data.text !== 'string') {
    throw new Error('The transcription API response did not include text.');
  }

  return data.text;
}

function createTranscriptionJob(options, dependencies = {}) {
  const abortController = new AbortController();
  let activeProcess = null;
  let completion = null;

  return {
    start() {
      if (completion) {
        throw new Error('Transcription job has already started.');
      }

      completion = runTranscription(
        {
          ...options,
          signal: abortController.signal,
          onProcess: (process) => {
            activeProcess = process;
          },
        },
        dependencies,
      );
      return completion;
    },
    cancel() {
      abortController.abort();
      if (activeProcess && !activeProcess.killed) {
        activeProcess.kill();
      }
    },
    get completion() {
      return completion;
    },
  };
}

async function runTranscription(
  {
    inputPath,
    outputDir,
    config,
    signal,
    onEvent,
    onProcess = () => {},
  },
  {
    fsImpl = fs,
    tempRoot = os.tmpdir(),
    randomUUIDImpl = randomUUID,
    segmentAudioImpl = segmentAudio,
    transcribeChunkImpl = transcribeChunk,
    ffmpegPath = resolveFfmpegPath(),
  } = {},
) {
  if (!inputPath || !config?.endpoint || !config?.apiKey) {
    throw new Error('Input path, endpoint, and API key are required.');
  }

  const resolvedOutputDir = outputDir || path.dirname(path.resolve(inputPath));
  const outputPath = getTranscriptOutputPath(inputPath, outputDir);
  const baseName = path.parse(inputPath).name;
  const temporaryOutputPath = path.join(
    resolvedOutputDir,
    `.${baseName}.${randomUUIDImpl()}.tmp`,
  );

  await fsImpl.access(inputPath);
  await fsImpl.mkdir(resolvedOutputDir, { recursive: true });
  const jobDirectory = await fsImpl.mkdtemp(path.join(tempRoot, 'fastscribe-'));
  const chunkPattern = path.join(jobDirectory, 'chunk_%05d.wav');
  let operationError = null;
  let result = null;

  try {
    onEvent({ type: 'output_path', outputPath });
    throwIfCancelled(signal);
    onEvent({ type: 'progress', progress: 5 });

    await segmentAudioImpl({
      ffmpegPath,
      inputPath,
      chunkPattern,
      chunkDurationMs: config.chunkDurationMs ?? 600_000,
      signal,
      onProcess,
    });

    throwIfCancelled(signal);
    const chunks = (await fsImpl.readdir(jobDirectory))
      .filter((fileName) => /^chunk_\d+\.wav$/.test(fileName))
      .sort()
      .map((fileName) => path.join(jobDirectory, fileName));

    if (chunks.length === 0) {
      throw new Error('FFmpeg did not produce any audio chunks.');
    }

    onEvent({ type: 'progress', progress: 15 });
    const transcriptParts = [];

    for (const [index, chunkPath] of chunks.entries()) {
      throwIfCancelled(signal);
      const text = await transcribeChunkImpl({
        filePath: chunkPath,
        endpoint: config.endpoint,
        apiKey: config.apiKey,
        model: config.model || 'gpt-4o-transcribe',
        language: config.language,
        signal,
      });
      transcriptParts.push(text);
      await fsImpl.rm(chunkPath, { force: true });
      onEvent({
        type: 'progress',
        progress: 15 + Math.floor(((index + 1) / chunks.length) * 80),
      });
    }

    throwIfCancelled(signal);
    const transcript = `--- Transcription Start ---\n\n${transcriptParts.join('\n\n')}\n\n--- Transcription End ---\n`;
    await fsImpl.writeFile(temporaryOutputPath, transcript, 'utf8');
    throwIfCancelled(signal);
    await fsImpl.rename(temporaryOutputPath, outputPath);

    onEvent({ type: 'progress', progress: 100 });
    result = outputPath;
  } catch (error) {
    if (signal.aborted && !(error instanceof TranscriptionCancelledError)) {
      operationError = new TranscriptionCancelledError();
    } else {
      operationError = error;
    }
  }

  onProcess(null);
  const cleanupResults = await Promise.allSettled([
    fsImpl.rm(temporaryOutputPath, { force: true }),
    fsImpl.rm(jobDirectory, { recursive: true, force: true }),
  ]);
  const cleanupErrors = cleanupResults
    .filter((cleanupResult) => cleanupResult.status === 'rejected')
    .map((cleanupResult) => cleanupResult.reason);

  if (cleanupErrors.length > 0) {
    const errors = operationError ? [operationError, ...cleanupErrors] : cleanupErrors;
    throw new AggregateError(errors, 'Failed to clean up transcription working files.');
  }
  if (operationError) throw operationError;

  return result;
}

module.exports = {
  TranscriptionCancelledError,
  buildFfmpegArgs,
  createTranscriptionJob,
  getTranscriptOutputPath,
  resolveFfmpegPath,
  runTranscription,
  segmentAudio,
  transcribeChunk,
};
