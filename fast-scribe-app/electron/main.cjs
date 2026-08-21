const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const Store = require('electron-store');

const store = new Store({
  defaults: {
    endpoint: '',
    apiKey: '',
    outputDir: '',
    chunkDurationMs: 600000,
    language: 'auto',
    theme: 'system',
  },
});

const isDev = process.env.NODE_ENV === 'development';

let mainWindow;

function createWindow() {
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

// --- IPC: Config ---

ipcMain.handle('config:get', () => store.store);

ipcMain.handle('config:set', (_event, updates) => {
  store.set(updates);
  return store.store;
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

ipcMain.handle('shell:openPath', (_event, filePath) => {
  shell.showItemInFolder(filePath);
});

// --- IPC: Transcription ---

const activeJobs = new Map(); // jobId -> childProcess

function getPythonPath() {
  // Try common Python executables
  return process.platform === 'win32' ? 'python' : 'python3';
}

function getScriptPath() {
  if (isDev) {
    return path.join(__dirname, '../../transcribe_cli.py');
  }
  return path.join(process.resourcesPath, 'transcribe_cli.py');
}

ipcMain.handle('transcription:start', (_event, { jobId, filePath, config }) => {
  const python = getPythonPath();
  const script = getScriptPath();

  const outputDir = config.outputDir || path.dirname(filePath);

  const args = [
    script,
    filePath,
    '--endpoint', config.endpoint,
    '--api-key', config.apiKey,
    '--output-dir', outputDir,
    '--chunk-duration-ms', String(config.chunkDurationMs ?? 600000),
  ];

  if (config.language && config.language !== 'auto') {
    args.push('--language', config.language);
  }

  const proc = spawn(python, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  activeJobs.set(jobId, proc);

  proc.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        mainWindow.webContents.send(`transcription:event:${jobId}`, event);
      } catch {
        // ignore non-JSON stdout
      }
    }
  });

  proc.stderr.on('data', (data) => {
    mainWindow.webContents.send(`transcription:event:${jobId}`, {
      type: 'log',
      message: data.toString(),
    });
  });

  proc.on('close', (code) => {
    activeJobs.delete(jobId);
    mainWindow.webContents.send(`transcription:event:${jobId}`, {
      type: code === 0 ? 'done' : 'error',
      message: code === 0 ? 'Transcription complete.' : `Process exited with code ${code}`,
    });
  });

  proc.on('error', (err) => {
    activeJobs.delete(jobId);
    mainWindow.webContents.send(`transcription:event:${jobId}`, {
      type: 'error',
      message: err.message,
    });
  });

  return { started: true };
});

ipcMain.handle('transcription:cancel', (_event, { jobId }) => {
  const proc = activeJobs.get(jobId);
  if (proc) {
    proc.kill();
    activeJobs.delete(jobId);
    return { cancelled: true };
  }
  return { cancelled: false };
});
