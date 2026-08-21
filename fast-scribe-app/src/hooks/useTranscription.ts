import { useState, useCallback, useRef } from 'react'
import type { TranscriptionFile } from '@/lib/types'

export function useTranscription() {
  const [files, setFiles] = useState<TranscriptionFile[]>([])
  const cancelRequested = useRef(false)

  const updateFile = useCallback((id: string, updates: Partial<TranscriptionFile>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)))
  }, [])

  const addFiles = useCallback((incoming: TranscriptionFile[]) => {
    setFiles((prev) => {
      const existingPaths = new Set(prev.map((f) => f.path))
      return [...prev, ...incoming.filter((f) => !existingPaths.has(f.path))]
    })
  }, [])

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }, [])

  const clearCompleted = useCallback(() => {
    setFiles((prev) => prev.filter((f) => f.status !== 'done' && f.status !== 'error' && f.status !== 'cancelled'))
  }, [])

  const startTranscription = useCallback(async () => {
    const toProcess = files.filter((f) => f.status === 'idle')
    if (!toProcess.length) return

    cancelRequested.current = false

    // Mark all as queued
    toProcess.forEach((f) => updateFile(f.id, { status: 'queued' }))

    for (const file of toProcess) {
      if (cancelRequested.current) break

      updateFile(file.id, { status: 'converting', progress: 5, startedAt: Date.now() })

      let unsubscribe = () => {}
      const terminalEvent = new Promise<void>((resolve) => {
        unsubscribe = window.electronAPI.onTranscriptionEvent(file.id, (event) => {
          switch (event.type) {
            case 'progress':
              updateFile(file.id, {
                status: 'transcribing',
                progress: Math.max(10, Math.min(95, event.progress ?? 50)),
              })
              break
            case 'output_path':
              updateFile(file.id, { outputPath: event.outputPath })
              break
            case 'done':
              updateFile(file.id, { status: 'done', progress: 100, finishedAt: Date.now() })
              unsubscribe()
              resolve()
              break
            case 'cancelled':
              updateFile(file.id, {
                status: 'cancelled',
                finishedAt: Date.now(),
              })
              unsubscribe()
              resolve()
              break
            case 'error':
              updateFile(file.id, {
                status: 'error',
                error: event.message ?? 'Unknown error',
                finishedAt: Date.now(),
              })
              unsubscribe()
              resolve()
              break
          }
        })
      })

      try {
        await window.electronAPI.startTranscription({
          jobId: file.id,
          filePath: file.path,
        })
        await terminalEvent
      } catch (error) {
        unsubscribe()
        updateFile(file.id, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Failed to start transcription',
          finishedAt: Date.now(),
        })
      }
    }
  }, [files, updateFile])

  const cancelAll = useCallback(async () => {
    cancelRequested.current = true
    const active = files.filter(
      (f) => f.status === 'transcribing' || f.status === 'converting' || f.status === 'queued'
    )
    for (const f of active) {
      if (f.status === 'queued') {
        updateFile(f.id, { status: 'cancelled', finishedAt: Date.now() })
      } else {
        await window.electronAPI.cancelTranscription({ jobId: f.id })
      }
    }
  }, [files, updateFile])

  return { files, addFiles, removeFile, clearCompleted, startTranscription, cancelAll }
}
