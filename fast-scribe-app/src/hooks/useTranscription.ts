import { useState, useCallback, useEffect, useRef } from 'react'
import type { PendingTranscriptOverwrite, TranscriptionFile } from '@/lib/types'

export function useTranscription() {
  const [files, setFiles] = useState<TranscriptionFile[]>([])
  const [pendingOverwrite, setPendingOverwrite] = useState<PendingTranscriptOverwrite | null>(null)
  const cancelRequested = useRef(false)
  const overwriteDecision = useRef<((overwrite: boolean) => void) | null>(null)

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

  const requestOverwrite = useCallback((file: TranscriptionFile, outputPath: string) => {
    return new Promise<boolean>((resolve) => {
      overwriteDecision.current = resolve
      setPendingOverwrite({ fileName: file.name, outputPath })
    })
  }, [])

  const resolveOverwrite = useCallback((overwrite: boolean) => {
    const resolve = overwriteDecision.current
    overwriteDecision.current = null
    setPendingOverwrite(null)
    resolve?.(overwrite)
  }, [])

  useEffect(() => {
    return () => overwriteDecision.current?.(false)
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

      const subscribeToTerminalEvent = () => {
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
        return { terminalEvent, unsubscribe }
      }

      let unsubscribe = () => {}
      let terminalEvent: Promise<void>
      try {
        const subscription = subscribeToTerminalEvent()
        terminalEvent = subscription.terminalEvent
        unsubscribe = subscription.unsubscribe
        let result = await window.electronAPI.startTranscription({
          jobId: file.id,
          filePath: file.path,
        })
        if (!result.started) {
          unsubscribe()
          if (!result.overwrite) {
            updateFile(file.id, { status: 'idle', progress: 0, startedAt: undefined })
            continue
          }

          updateFile(file.id, { status: 'queued', progress: 0, startedAt: undefined })
          const overwrite = await requestOverwrite(file, result.overwrite.outputPath)
          if (!overwrite) {
            updateFile(file.id, { status: 'idle', progress: 0, startedAt: undefined })
            continue
          }
          if (cancelRequested.current) {
            updateFile(file.id, { status: 'cancelled', finishedAt: Date.now() })
            continue
          }

          updateFile(file.id, { status: 'converting', progress: 5, startedAt: Date.now() })
          const retrySubscription = subscribeToTerminalEvent()
          terminalEvent = retrySubscription.terminalEvent
          unsubscribe = retrySubscription.unsubscribe
          result = await window.electronAPI.startTranscription({
            jobId: file.id,
            filePath: file.path,
            overwrite: true,
          })
          if (!result.started) {
            unsubscribe()
            throw new Error('Unable to start the transcription.')
          }
        }
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
  }, [files, requestOverwrite, updateFile])

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

  return {
    files,
    addFiles,
    removeFile,
    clearCompleted,
    startTranscription,
    cancelAll,
    pendingOverwrite,
    resolveOverwrite,
  }
}
