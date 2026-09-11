export interface AppConfig {
  endpoint: string;
  model: string;
  outputDir: string;
  chunkDurationMs: number;
  language: string;
  theme: 'light' | 'dark' | 'system';
  hasApiKey: boolean;
}

export interface AppConfigUpdate extends Partial<Omit<AppConfig, 'hasApiKey'>> {
  apiKey?: string;
}

export interface SettingsFileResult {
  cancelled: boolean;
  filePath?: string;
}

export type FileStatus = 'idle' | 'queued' | 'converting' | 'transcribing' | 'processing' | 'done' | 'error' | 'cancelled';

export interface TranscriptionFile {
  id: string;
  path: string;
  name: string;
  size: number;
  status: FileStatus;
  progress: number; // 0-100
  outputPath?: string;
  runId?: string;
  rawArtifactId?: string;
  finalArtifactId?: string;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

export interface TranscriptionEvent {
  type: 'progress' | 'done' | 'error' | 'cancelled' | 'log' | 'output_path' | 'run_created' | 'plugin_started' | 'plugin_completed';
  message?: string;
  progress?: number;
  outputPath?: string;
  runId?: string;
  rawArtifactId?: string;
  finalArtifactId?: string;
  nodeId?: string;
  pluginId?: string;
}

export interface ArtifactPort {
  id: string;
  type: string;
  required?: boolean;
}

export interface PluginManifest {
  id: string;
  version: string;
  name: string;
  description: string;
  inputs: ArtifactPort[];
  outputs: ArtifactPort[];
  configSchema: Record<string, unknown>;
}

export interface PipelineEndpoint {
  nodeId: string;
  portId: string;
}

export interface PipelinePosition {
  x: number;
  y: number;
}

export interface PipelineNode {
  id: string;
  pluginId: string;
  pluginVersion: string;
  config: Record<string, unknown>;
}

export interface PipelineDestination {
  id: string;
  from: PipelineEndpoint;
  artifactType: string;
  serializer: 'txt' | 'json';
  folderMode: 'settings' | 'custom';
  customFolder?: string;
  filenameTemplate: string;
}

export interface PipelineDefinition {
  schemaVersion: number;
  nodes: PipelineNode[];
  connections: Array<{ from: PipelineEndpoint; to: PipelineEndpoint }>;
  output: PipelineEndpoint;
  layout: Record<string, PipelinePosition>;
  destinations: PipelineDestination[];
}

export interface PipelineValidation {
  valid: boolean;
  errors: string[];
}

export interface PipelineRecord {
  id: string;
  name: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  pipeline: PipelineDefinition;
}

export interface PipelineState {
  pipeline: PipelineRecord;
  validation: PipelineValidation;
  recoverable: boolean;
}

export interface PipelineSummary {
  id: string;
  name: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  valid: boolean;
  errors: string[];
}

export interface PipelineList {
  selected: { pipelineId: string; revision: number };
  pipelines: PipelineSummary[];
}

export interface SavePipelineRequest {
  id: string;
  name: string;
  pipeline: PipelineDefinition;
  expectedRevision: number;
}

export interface PublicationResult {
  id: string;
  kind: 'primary' | 'destination';
  artifactId: string;
  artifactType: string;
  path: string;
  status: 'pending' | 'staged' | 'published' | 'rolled_back' | 'rollback_failed';
}

export interface RunArtifact<T = unknown> {
  id: string;
  type: string;
  typeVersion: number;
  schemaVersion: number;
  value: T;
  producer: Record<string, unknown>;
}

export interface PipelineRun {
  schemaVersion: number;
  id: string;
  status: 'transcribing' | 'processing' | 'publishing' | 'completed' | 'failed' | 'cancelled';
  source: { path: string; name: string };
  pipeline: PipelineRecord;
  artifacts: Array<Omit<RunArtifact, 'value'>>;
  publication?: PublicationResult[];
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  outputPath?: string;
  finalArtifactId?: string;
  error?: { message: string; nodeId?: string; pluginId?: string };
}

export type UpdateStatus =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  version?: string;
  progress?: number;
  error?: string;
}

// Extend window with Electron API
declare global {
  interface Window {
    electronAPI: {
      getConfig: () => Promise<AppConfig>;
      setConfig: (updates: AppConfigUpdate) => Promise<AppConfig>;
      exportConfig: (passphrase: string) => Promise<SettingsFileResult>;
      selectConfigImport: () => Promise<SettingsFileResult>;
      importConfig: (filePath: string, passphrase: string) => Promise<AppConfig>;
      openFiles: () => Promise<string[]>;
      openFolder: () => Promise<string | null>;
      openInExplorer: (filePath: string) => Promise<void>;
      readTranscript: (filePath: string) => Promise<string>;
      saveTranscript: (filePath: string, content: string) => Promise<void>;
      setTranscriptDirty: (dirty: boolean) => Promise<void>;
      copyText: (text: string) => Promise<void>;
      listPlugins: () => Promise<PluginManifest[]>;
      listPipelines: () => Promise<PipelineList>;
      getPipeline: (pipelineId?: string) => Promise<PipelineState>;
      validatePipeline: (pipeline: PipelineDefinition) => Promise<PipelineValidation>;
      createPipeline: (request: { name: string; pipeline?: PipelineDefinition }) => Promise<PipelineState>;
      savePipeline: (request: SavePipelineRequest) => Promise<PipelineState>;
      selectPipeline: (request: { id: string; expectedRevision?: number }) => Promise<PipelineState>;
      setPipelineDirty: (dirty: boolean) => Promise<void>;
      onSelectedPipelineChange: (callback: (state: PipelineState) => void) => () => void;
      listRuns: () => Promise<PipelineRun[]>;
      getRun: (runId: string) => Promise<PipelineRun>;
      readRunArtifact: <T = unknown>(runId: string, artifactId: string) => Promise<RunArtifact<T>>;
      exportRunArtifact: (
        runId: string,
        artifactId: string
      ) => Promise<SettingsFileResult>;
      getUpdateState: () => Promise<UpdateState>;
      checkForUpdates: () => Promise<UpdateState>;
      downloadUpdate: () => Promise<UpdateState>;
      installUpdate: () => Promise<void>;
      onUpdateState: (callback: (state: UpdateState) => void) => () => void;
      startTranscription: (opts: {
        jobId: string;
        filePath: string;
      }) => Promise<{ started: boolean; runId: string }>;
      cancelTranscription: (opts: { jobId: string }) => Promise<{ cancelled: boolean }>;
      onTranscriptionEvent: (
        jobId: string,
        callback: (event: TranscriptionEvent) => void
      ) => () => void;
    };
  }
}
