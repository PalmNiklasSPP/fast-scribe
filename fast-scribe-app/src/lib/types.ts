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

export type FileStatus = 'idle' | 'queued' | 'converting' | 'transcribing' | 'done' | 'error' | 'cancelled';

export interface TranscriptionFile {
  id: string;
  path: string;
  name: string;
  size: number;
  status: FileStatus;
  progress: number; // 0-100
  outputPath?: string;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

export interface TranscriptionEvent {
  type: 'progress' | 'done' | 'error' | 'cancelled' | 'log' | 'output_path';
  message?: string;
  progress?: number;
  outputPath?: string;
}

export interface PendingTranscriptOverwrite {
  fileName: string;
  outputPath: string;
}

export interface TranscriptionStartResult {
  started: boolean;
  overwrite?: {
    outputPath: string;
  };
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
      getUpdateState: () => Promise<UpdateState>;
      checkForUpdates: () => Promise<UpdateState>;
      downloadUpdate: () => Promise<UpdateState>;
      installUpdate: () => Promise<void>;
      onUpdateState: (callback: (state: UpdateState) => void) => () => void;
      startTranscription: (opts: {
        jobId: string;
        filePath: string;
        overwrite?: boolean;
      }) => Promise<TranscriptionStartResult>;
      cancelTranscription: (opts: { jobId: string }) => Promise<{ cancelled: boolean }>;
      onTranscriptionEvent: (
        jobId: string,
        callback: (event: TranscriptionEvent) => void
      ) => () => void;
    };
  }
}
