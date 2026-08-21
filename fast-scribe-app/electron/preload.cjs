const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Config
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (updates) => ipcRenderer.invoke('config:set', updates),
  exportConfig: (passphrase) => ipcRenderer.invoke('config:export', passphrase),
  selectConfigImport: () => ipcRenderer.invoke('config:selectImport'),
  importConfig: (filePath, passphrase) => ipcRenderer.invoke('config:import', filePath, passphrase),

  // Dialogs
  openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  openInExplorer: (filePath) => ipcRenderer.invoke('shell:openPath', filePath),

  // Updates
  getUpdateState: () => ipcRenderer.invoke('update:getState'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('update:state', handler);
    return () => ipcRenderer.removeListener('update:state', handler);
  },

  // Transcription
  startTranscription: (opts) => ipcRenderer.invoke('transcription:start', opts),
  cancelTranscription: (opts) => ipcRenderer.invoke('transcription:cancel', opts),
  onTranscriptionEvent: (jobId, callback) => {
    const channel = `transcription:event:${jobId}`;
    const handler = (_event, data) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
});
