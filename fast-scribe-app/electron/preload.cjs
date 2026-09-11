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

  // Transcript files
  readTranscript: (filePath) => ipcRenderer.invoke('transcript:read', filePath),
  saveTranscript: (filePath, content) => ipcRenderer.invoke('transcript:write', { filePath, content }),
  setTranscriptDirty: (dirty) => ipcRenderer.invoke('transcript:setDirty', dirty),
  copyText: (text) => ipcRenderer.invoke('clipboard:writeText', text),

  // Plugins and pipeline
  listPlugins: () => ipcRenderer.invoke('plugins:list'),
  listPipelines: () => ipcRenderer.invoke('pipeline:list'),
  getPipeline: (pipelineId) => ipcRenderer.invoke('pipeline:get', pipelineId),
  validatePipeline: (pipeline) => ipcRenderer.invoke('pipeline:validate', pipeline),
  createPipeline: (request) => ipcRenderer.invoke('pipeline:create', request),
  savePipeline: (request) => ipcRenderer.invoke('pipeline:save', request),
  selectPipeline: (request) => ipcRenderer.invoke('pipeline:select', request),
  setPipelineDirty: (dirty) => ipcRenderer.invoke('pipeline:setDirty', dirty),
  onSelectedPipelineChange: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('pipeline:selectedChanged', handler);
    return () => ipcRenderer.removeListener('pipeline:selectedChanged', handler);
  },

  // Pipeline runs and artifacts
  listRuns: () => ipcRenderer.invoke('runs:list'),
  getRun: (runId) => ipcRenderer.invoke('runs:get', runId),
  readRunArtifact: (runId, artifactId) => (
    ipcRenderer.invoke('runs:readArtifact', { runId, artifactId })
  ),
  exportRunArtifact: (runId, artifactId) => (
    ipcRenderer.invoke('runs:exportArtifact', { runId, artifactId })
  ),

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
