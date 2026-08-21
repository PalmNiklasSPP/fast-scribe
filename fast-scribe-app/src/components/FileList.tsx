import { CheckCircle2, XCircle, Loader2, Clock, FolderOpen, X, FileAudio } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { TranscriptionFile } from '@/lib/types'

interface FileListProps {
  files: TranscriptionFile[]
  onRemove: (id: string) => void
  onOpenOutput: (path: string) => void
}

function statusIcon(status: TranscriptionFile['status']) {
  switch (status) {
    case 'done': return <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
    case 'error': return <XCircle size={15} className="text-red-400 shrink-0" />
    case 'transcribing':
    case 'converting': return <Loader2 size={15} className="text-violet-400 animate-spin shrink-0" />
    case 'queued': return <Clock size={15} className="text-zinc-500 shrink-0" />
    default: return <FileAudio size={15} className="text-zinc-600 shrink-0" />
  }
}

function statusLabel(status: TranscriptionFile['status']) {
  const map: Record<TranscriptionFile['status'], string> = {
    idle: 'Ready',
    queued: 'Queued',
    converting: 'Converting…',
    transcribing: 'Transcribing…',
    done: 'Done',
    error: 'Error',
    cancelled: 'Cancelled',
  }
  return map[status]
}

function formatDuration(ms: number) {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

export function FileList({ files, onRemove, onOpenOutput }: FileListProps) {
  if (!files.length) return null

  return (
    <div className="flex flex-col gap-1.5">
      {files.map((file) => {
        const isActive = file.status === 'converting' || file.status === 'transcribing'
        const elapsed =
          file.startedAt && !file.finishedAt
            ? Date.now() - file.startedAt
            : file.startedAt && file.finishedAt
            ? file.finishedAt - file.startedAt
            : null

        return (
          <div
            key={file.id}
            className={cn(
              'group relative rounded-lg border px-4 py-3 transition-colors',
              file.status === 'done' && 'border-emerald-900/50 bg-emerald-950/20',
              file.status === 'error' && 'border-red-900/50 bg-red-950/20',
              isActive && 'border-violet-900/50 bg-violet-950/20',
              file.status === 'idle' || file.status === 'queued' || file.status === 'cancelled'
                ? 'border-zinc-800 bg-zinc-900/40'
                : ''
            )}
          >
            <div className="flex items-center gap-3">
              {statusIcon(file.status)}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-200">{file.name}</p>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className={cn(
                    'text-xs',
                    file.status === 'done' ? 'text-emerald-400' :
                    file.status === 'error' ? 'text-red-400' :
                    isActive ? 'text-violet-400' : 'text-zinc-500'
                  )}>
                    {statusLabel(file.status)}
                  </span>
                  {elapsed !== null && (
                    <span className="text-xs text-zinc-600">{formatDuration(elapsed)}</span>
                  )}
                  {file.error && (
                    <span className="truncate text-xs text-red-400">{file.error}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {file.status === 'done' && file.outputPath && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onOpenOutput(file.outputPath!)}
                    title="Show in explorer"
                  >
                    <FolderOpen size={14} />
                  </Button>
                )}
                {(file.status === 'idle' || file.status === 'done' || file.status === 'error' || file.status === 'cancelled') && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-zinc-600 hover:text-red-400"
                    onClick={() => onRemove(file.id)}
                    title="Remove"
                  >
                    <X size={14} />
                  </Button>
                )}
              </div>
            </div>

            {isActive && (
              <Progress value={file.progress} className="mt-2" />
            )}
          </div>
        )
      })}
    </div>
  )
}
