const { app, BrowserWindow, clipboard, ipcMain, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('fs/promises');
const path = require('path');
const Store = require('electron-store').default;
const { createConfigService } = require('./config.cjs');
const { createTranscriptFileService } = require('./transcript-files.cjs');
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

const isDev = process.env.NODE_ENV === 'development';

let mainWindow;
const activeJobs = new Map();
let allowQuit = false;
let shutdownPromise = null;
let hasUnsavedTranscript = false;
let allowWindowClose = false;
let isConfirmingTranscriptClose = false;
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

ipcMain.handle('transcription:start', (_event, { jobId, filePath }) => {
  if (activeJobs.has(jobId)) {
    throw new Error(`Transcription job ${jobId} is already active.`);
  }

  const config = configService.getPrivateConfig();
  const outputDir = config.outputDir || path.dirname(filePath);
  const sendEvent = (event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(`transcription:event:${jobId}`, event);
    }
  };
  const job = createTranscriptionJob({
    inputPath: filePath,
    outputDir,
    config,
    onEvent: sendEvent,
  });

  activeJobs.set(jobId, job);
  job.start()
    .then((outputPath) => {
      transcriptFiles.allow(outputPath);
      sendEvent({ type: 'done', message: 'Transcription complete.' });
    })
    .catch((error) => {
      if (error instanceof TranscriptionCancelledError) {
        sendEvent({ type: 'cancelled', message: error.message });
      } else {
        sendEvent({ type: 'error', message: error.message });
      }
    })
    .finally(() => {
      activeJobs.delete(jobId);
    });

  return { started: true };
});

ipcMain.handle('transcription:cancel', async (_event, { jobId }) => {
  const job = activeJobs.get(jobId);
  if (!job) return { cancelled: false };

  job.cancel();
  try {
    await job.completion;
  } catch (error) {
    if (!(error instanceof TranscriptionCancelledError)) {
      return { cancelled: false };
    }
  }
  return { cancelled: true };
});
