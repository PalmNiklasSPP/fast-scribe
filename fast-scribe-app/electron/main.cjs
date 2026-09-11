const { app, BrowserWindow, clipboard, ipcMain, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('fs/promises');
const path = require('path');
const Store = require('electron-store').default;
const { createConfigService } = require('./config.cjs');
const { createTranscriptFileService, writeTranscript } = require('./transcript-files.cjs');
const { createPluginSystem } = require('./plugins/index.cjs');
const { createPipelineService } = require('./plugins/pipeline-service.cjs');
const { runPipeline } = require('./plugins/pipeline.cjs');
const { createRunStore } = require('./run-store.cjs');
const {
  createTranscriptionJob,
  TranscriptionCancelledError,
} = require('./transcription.cjs');
const { createUpdateController } = require('./updater.cjs');

const store = new Store({
  defaults: {
    endpoint: '',
    encryptedApiKey: '',
    model: 'gpt-4o-transcribe',
    outputDir: '',
    chunkDurationMs: 600000,
    language: 'auto',
    theme: 'system',
  },
});
const configService = createConfigService({ store, safeStorage: require('electron').safeStorage });
const transcriptFiles = createTranscriptFileService();
const pluginSystem = createPluginSystem();
const pipelineService = createPipelineService({ store, plugins: pluginSystem.plugins });

const isDev = process.env.NODE_ENV === 'development';

let mainWindow;
const activeJobs = new Map();
const startingJobs = new Set();
let allowQuit = false;
let shutdownPromise = null;
let hasUnsavedTranscript = false;
let allowWindowClose = false;
let isConfirmingTranscriptClose = false;
let runStore;
const updateController = createUpdateController({
  autoUpdater,
  currentVersion: app.getVersion(),
  isPackaged: app.isPackaged,
  sendState: (state) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:state', state);
    }
  },
});

function createWindow() {
  allowWindowClose = false;
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 560,
    backgroundColor: '#09090b',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#09090b',
      symbolColor: '#a1a1aa',
      height: 40,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../public/icon.png'),
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.once('did-finish-load', () => {
    updateController.initialize().catch(() => {});
  });

  const closingWindow = mainWindow;
  closingWindow.on('close', (event) => {
    if (!hasUnsavedTranscript || allowWindowClose) return;

    event.preventDefault();
    if (isConfirmingTranscriptClose) return;
    isConfirmingTranscriptClose = true;

    dialog.showMessageBox(closingWindow, {
      type: 'warning',
      buttons: ['Keep editing', 'Discard changes'],
      defaultId: 0,
      cancelId: 0,
      title: 'Unsaved transcript',
      message: 'Discard unsaved transcript changes?',
      detail: 'Your edits have not been written to the transcript file.',
    }).then(({ response }) => {
      if (response === 1) {
        hasUnsavedTranscript = false;
        allowWindowClose = true;
        closingWindow.close();
      } else {
        allowQuit = false;
        shutdownPromise = null;
      }
    }).catch((error) => {
      console.error('Unable to confirm transcript close:', error);
      allowQuit = false;
      shutdownPromise = null;
    }).finally(() => {
      isConfirmingTranscriptClose = false;
    });
  });
}

app.whenReady().then(() => {
  runStore = createRunStore({
    rootDir: path.join(app.getPath('userData'), 'pipeline-runs'),
    artifactTypes: pluginSystem.artifactTypes,
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  updateController.dispose();
});

app.on('before-quit', (event) => {
  if (allowQuit || activeJobs.size === 0) return;

  event.preventDefault();
  if (shutdownPromise) return;

  const jobs = [...activeJobs.values()];
  for (const job of jobs) job.cancel();

  shutdownPromise = Promise.allSettled(
    jobs.map((job) => job.completion),
  ).finally(() => {
    allowQuit = true;
    app.quit();
  });
});

// --- IPC: Config ---

ipcMain.handle('config:get', () => configService.getPublicConfig());

ipcMain.handle('config:set', (_event, updates) => {
  return configService.updateConfig(updates);
});

// --- IPC: File dialog ---

ipcMain.handle('dialog:openFiles', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'mp4', 'm4a', 'wav', 'ogg', 'flac', 'aac', 'wma', 'webm'] },
    ],
  });
  return result.filePaths;
});

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  return result.filePaths[0] ?? null;
});

ipcMain.handle('config:export', async (_event, passphrase) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: 'fast-scribe-settings.fss',
    filters: [{ name: 'Fast Scribe settings', extensions: ['fss'] }],
  });
  if (result.canceled || !result.filePath) return { cancelled: true };

  const tempPath = `${result.filePath}.tmp`;
  try {
    await fs.writeFile(tempPath, configService.exportSettings(passphrase), 'utf8');
    await fs.rename(tempPath, result.filePath);
  } finally {
    await fs.rm(tempPath, { force: true });
  }
  return { cancelled: false, filePath: result.filePath };
});

ipcMain.handle('config:selectImport', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Fast Scribe settings', extensions: ['fss'] }],
  });
  if (result.canceled || !result.filePaths[0]) return { cancelled: true };
  return { cancelled: false, filePath: result.filePaths[0] };
});

ipcMain.handle('config:import', async (_event, filePath, passphrase) => {
  if (typeof filePath !== 'string') {
    throw new Error('Select a settings file to import.');
  }
  const serialized = await fs.readFile(filePath, 'utf8');
  return configService.importSettings(serialized, passphrase);
});

ipcMain.handle('shell:openPath', (_event, filePath) => {
  shell.showItemInFolder(filePath);
});

// --- IPC: Transcript files ---

ipcMain.handle('transcript:read', (_event, filePath) => {
  return transcriptFiles.read(filePath);
});

ipcMain.handle('transcript:write', (_event, { filePath, content }) => {
  return transcriptFiles.write(filePath, content);
});

ipcMain.handle('transcript:setDirty', (_event, dirty) => {
  if (typeof dirty !== 'boolean') {
    throw new Error('Transcript dirty state must be a boolean.');
  }
  hasUnsavedTranscript = dirty;
});

// --- IPC: Plugins and pipeline ---

ipcMain.handle('plugins:list', () => pluginSystem.plugins.listManifests());
ipcMain.handle('pipeline:get', () => pipelineService.getPipeline());
ipcMain.handle('pipeline:validate', (_event, pipeline) => pipelineService.validatePipeline(pipeline));
ipcMain.handle('pipeline:save', (_event, pipeline) => pipelineService.savePipeline(pipeline));

// --- IPC: Pipeline runs ---

ipcMain.handle('runs:list', () => runStore.list());
ipcMain.handle('runs:get', (_event, runId) => runStore.get(runId));
ipcMain.handle('runs:readArtifact', (_event, { runId, artifactId }) => {
  return runStore.readArtifact(runId, artifactId);
});
ipcMain.handle('runs:exportArtifact', async (_event, { runId, artifactId }) => {
  const [run, artifact] = await Promise.all([
    runStore.get(runId),
    runStore.readArtifact(runId, artifactId),
  ]);
  if (artifact.type !== 'fast-scribe/text') {
    throw new Error('Only text artifacts can be exported.');
  }
  const sourceName = path.parse(run.source.name).name;
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `${sourceName}.raw.txt`,
    filters: [{ name: 'Plain text', extensions: ['txt'] }],
  });
  if (result.canceled || !result.filePath) return { cancelled: true };
  await writeTranscript(result.filePath, artifact.value);
  return { cancelled: false, filePath: result.filePath };
});

ipcMain.handle('clipboard:writeText', (_event, text) => {
  if (typeof text !== 'string') {
    throw new Error('Clipboard content must be text.');
  }
  clipboard.writeText(text);
});

// --- IPC: Updates ---

ipcMain.handle('update:getState', () => updateController.getState());
ipcMain.handle('update:check', () => updateController.check());
ipcMain.handle('update:download', () => updateController.download());
ipcMain.handle('update:install', () => updateController.install());

// --- IPC: Transcription ---

ipcMain.handle('transcription:start', async (_event, { jobId, filePath }) => {
  if (typeof jobId !== 'string' || !jobId || typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
    throw new Error('A job ID and absolute input file path are required.');
  }
  if (activeJobs.has(jobId) || startingJobs.has(jobId)) {
    throw new Error(`Transcription job ${jobId} is already active.`);
  }
  startingJobs.add(jobId);

  try {
    const config = configService.getPrivateConfig();
    const outputDir = config.outputDir || path.dirname(filePath);
    const pipeline = pipelineService.getPipeline();
    const run = await runStore.create({ sourcePath: filePath, pipeline });
    const sendEvent = (event) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`transcription:event:${jobId}`, event);
      }
    };
    sendEvent({ type: 'run_created', runId: run.id });
    let pipelineResult = null;
    const job = createTranscriptionJob({
      inputPath: filePath,
      outputDir,
      config,
      onEvent: sendEvent,
      processTranscript: async (rawTranscript, { signal }) => {
        await runStore.update(run.id, { status: 'processing' });
        pipelineResult = await runPipeline({
          pipeline,
          inputText: rawTranscript,
          plugins: pluginSystem.plugins,
          artifactTypes: pluginSystem.artifactTypes,
          signal,
          onArtifact: (artifact) => runStore.addArtifact(run.id, artifact),
          onEvent: sendEvent,
        });
        await runStore.update(run.id, {
          status: 'publishing',
          finalArtifactId: pipelineResult.finalArtifact.id,
        });
        return pipelineResult.finalArtifact.value;
      },
    });

    const activeJob = {
      cancel: () => job.cancel(),
      completion: null,
    };
    activeJobs.set(jobId, activeJob);
    activeJob.completion = job.start()
      .then(async (outputPath) => {
        transcriptFiles.allow(outputPath);
        await runStore.update(run.id, {
          status: 'completed',
          outputPath,
          finishedAt: new Date().toISOString(),
        });
        sendEvent({
          type: 'done',
          message: 'Transcription complete.',
          runId: run.id,
          rawArtifactId: pipelineResult?.inputArtifact.id,
          finalArtifactId: pipelineResult?.finalArtifact.id,
        });
      })
      .catch(async (error) => {
        const cancelled = error instanceof TranscriptionCancelledError;
        let reportedError = error;
        try {
          await runStore.update(run.id, {
            status: cancelled ? 'cancelled' : 'failed',
            error: {
              message: error.message,
              nodeId: error.nodeId,
              pluginId: error.pluginId,
            },
            finishedAt: new Date().toISOString(),
          });
        } catch (persistenceError) {
          console.error('Unable to persist failed pipeline run:', persistenceError);
          reportedError = new AggregateError(
            [error, persistenceError],
            `${error.message} Run history could not be updated.`,
          );
        }
        sendEvent({
          type: cancelled ? 'cancelled' : 'error',
          message: reportedError.message,
        });
      })
      .finally(() => {
        activeJobs.delete(jobId);
      });

    return { started: true, runId: run.id };
  } finally {
    startingJobs.delete(jobId);
  }
});

ipcMain.handle('transcription:cancel', async (_event, { jobId }) => {
  const job = activeJobs.get(jobId);
  if (!job) return { cancelled: false };

  job.cancel();
  await job.completion;
  return { cancelled: true };
});
