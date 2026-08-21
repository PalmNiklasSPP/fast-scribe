import { useState, useCallback } from 'react'
import { Upload, Music2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TranscriptionFile } from '@/lib/types'

interface DropZoneProps {
  onFilesAdded: (files: TranscriptionFile[]) => void
}

const SUPPORTED = new Set(['mp3', 'mp4', 'm4a', 'wav', 'ogg', 'flac', 'aac', 'wma', 'webm'])

function fileToTranscriptionFile(path: string): TranscriptionFile {
  const name = path.split(/[\\/]/).pop() ?? path
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    path,
    name,
    size: 0,
    status: 'idle',
    progress: 0,
  }
}

export function DropZone({ onFilesAdded }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const paths: string[] = []
      for (const item of Array.from(e.dataTransfer.files)) {
        const ext = item.name.split('.').pop()?.toLowerCase() ?? ''
        if (SUPPORTED.has(ext)) {
          // In Electron, File objects from drag-drop have a `path` property
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          paths.push((item as any).path ?? item.name)
        }
      }
      if (paths.length) onFilesAdded(paths.map(fileToTranscriptionFile))
    },
    [onFilesAdded]
  )

  const handleBrowse = useCallback(async () => {
    const paths = await window.electronAPI.openFiles()
    if (paths.length) onFilesAdded(paths.map(fileToTranscriptionFile))
  }, [onFilesAdded])

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={handleBrowse}
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 cursor-pointer transition-colors select-none',
        isDragging
          ? 'border-violet-500 bg-violet-500/10'
          : 'border-zinc-700 hover:border-zinc-600 hover:bg-zinc-900/60'
      )}
    >
      <div className={cn(
        'flex h-14 w-14 items-center justify-center rounded-full transition-colors',
        isDragging ? 'bg-violet-500/20' : 'bg-zinc-800'
      )}>
        {isDragging ? <Music2 size={26} className="text-violet-400" /> : <Upload size={26} className="text-zinc-500" />}
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-zinc-300">
          Drop audio files here or <span className="text-violet-400">browse</span>
        </p>
        <p className="mt-1 text-xs text-zinc-600">
          MP3, M4A, WAV, FLAC, AAC, OGG, WMA, WebM
        </p>
      </div>
    </div>
  )
}
