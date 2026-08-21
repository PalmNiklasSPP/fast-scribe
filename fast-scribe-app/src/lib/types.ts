export interface AppConfig {
  endpoint: string;
  apiKey: string;
  outputDir: string;
  chunkDurationMs: number;
  language: string;
  theme: 'light' | 'dark' | 'system';
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
  type: 'progress' | 'done' | 'error' | 'log' | 'output_path';
  message?: string;
  progress?: number;
  outputPath?: string;
}

// Extend window with Electron API
declare global {
  interface Window {
    electronAPI: {
      getConfig: () => Promise<AppConfig>;
      setConfig: (updates: Partial<AppConfig>) => Promise<AppConfig>;
      openFiles: () => Promise<string[]>;
      openFolder: () => Promise<string | null>;
      openInExplorer: (filePath: string) => Promise<void>;
      startTranscription: (opts: {
        jobId: string;
        filePath: string;
        config: AppConfig;
      }) => Promise<{ started: boolean }>;
      cancelTranscription: (opts: { jobId: string }) => Promise<{ cancelled: boolean }>;
      onTranscriptionEvent: (
        jobId: string,
        callback: (event: TranscriptionEvent) => void
      ) => () => void;
    };
  }
}
