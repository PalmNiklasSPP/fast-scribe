import { useState, useCallback } from 'react'
import type { AppConfig, TranscriptionFile } from '@/lib/types'

export function useTranscription(config: AppConfig) {
  const [files, setFiles] = useState<TranscriptionFile[]>([])

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

    // Mark all as queued
    toProcess.forEach((f) => updateFile(f.id, { status: 'queued' }))

    for (const file of toProcess) {
      updateFile(file.id, { status: 'converting', progress: 5, startedAt: Date.now() })

      await window.electronAPI.startTranscription({
        jobId: file.id,
        filePath: file.path,
        config,
      })

      await new Promise<void>((resolve) => {
        const unsub = window.electronAPI.onTranscriptionEvent(file.id, (event) => {
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
              unsub()
              resolve()
              break
            case 'error':
              updateFile(file.id, {
                status: 'error',
                error: event.message ?? 'Unknown error',
                finishedAt: Date.now(),
              })
              unsub()
              resolve()
              break
          }
        })
      })
    }
  }, [files, config, updateFile])

  const cancelAll = useCallback(async () => {
    const active = files.filter(
      (f) => f.status === 'transcribing' || f.status === 'converting' || f.status === 'queued'
    )
    for (const f of active) {
      await window.electronAPI.cancelTranscription({ jobId: f.id })
      updateFile(f.id, { status: 'cancelled' })
    }
  }, [files, updateFile])

  return { files, addFiles, removeFile, clearCompleted, startTranscription, cancelAll }
}
