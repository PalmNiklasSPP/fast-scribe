const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Config
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (updates) => ipcRenderer.invoke('config:set', updates),

  // Dialogs
  openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  openInExplorer: (filePath) => ipcRenderer.invoke('shell:openPath', filePath),

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
