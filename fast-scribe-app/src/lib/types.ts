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

export interface PipelineDefinition {
  schemaVersion: number;
  nodes: Array<{
    id: string;
    pluginId: string;
    pluginVersion: string;
    config: Record<string, unknown>;
  }>;
  connections: Array<{ from: PipelineEndpoint; to: PipelineEndpoint }>;
  output: PipelineEndpoint;
}

export interface PipelineValidation {
  valid: boolean;
  errors: string[];
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
  pipeline: PipelineDefinition;
  artifacts: Array<Omit<RunArtifact, 'value'>>;
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
      getPipeline: () => Promise<PipelineDefinition>;
      validatePipeline: (pipeline: PipelineDefinition) => Promise<PipelineValidation>;
      savePipeline: (pipeline: PipelineDefinition) => Promise<PipelineDefinition>;
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
