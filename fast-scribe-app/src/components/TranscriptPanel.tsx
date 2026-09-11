import { useEffect, useState } from 'react'
import { AlertCircle, Clipboard, Download, Loader2, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RunArtifact, TranscriptionFile } from '@/lib/types'

interface TranscriptPanelProps {
  fileName: TranscriptionFile['name']
  outputPath: string
  runId?: string
  rawArtifactId?: string
  onClose: () => void
  onDirtyChange: (dirty: boolean) => void
}

export function TranscriptPanel({
  fileName,
  outputPath,
  runId,
  rawArtifactId,
  onClose,
  onDirtyChange,
}: TranscriptPanelProps) {
  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [message, setMessage] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [view, setView] = useState<'final' | 'raw' | 'artifact'>('final')
  const [selectedArtifact, setSelectedArtifact] = useState<RunArtifact | null>(null)
  const isDirty = content !== savedContent
  const canViewRaw = Boolean(runId && rawArtifactId)

  useEffect(() => {
    let active = true

    const loadTranscript = view === 'artifact' && selectedArtifact
      ? Promise.resolve(JSON.stringify(selectedArtifact.value, null, 2))
      : view === 'raw' && runId && rawArtifactId
      ? window.electronAPI.readRunArtifact<string>(runId, rawArtifactId).then((artifact) => artifact.value)
      : window.electronAPI.readTranscript(outputPath)

    loadTranscript
      .then((transcript) => {
        if (!active) return
        setContent(transcript)
        setSavedContent(transcript)
      })
      .catch((loadError) => {
        if (!active) return
        setLoadError(loadError instanceof Error ? loadError.message : 'Unable to open the transcript.')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [outputPath, runId, rawArtifactId, selectedArtifact, view, loadAttempt])

  useEffect(() => {
    onDirtyChange(isDirty)
  }, [isDirty, onDirtyChange])

  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  const handleSave = async () => {
    if (view === 'raw') return
    if (!isDirty) return
    setIsSaving(true)
    setActionError('')
    setMessage('')
    try {
      await window.electronAPI.saveTranscript(outputPath, content)
      setSavedContent(content)
      setMessage('Transcript saved.')
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : 'Unable to save the transcript.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleExportRaw = async () => {
    if (!runId || !rawArtifactId) return
    setActionError('')
    setMessage('')
    try {
      const result = await window.electronAPI.exportRunArtifact(runId, rawArtifactId)
      if (!result.cancelled) setMessage('Raw transcript exported.')
    } catch (exportError) {
      setActionError(exportError instanceof Error ? exportError.message : 'Unable to export raw transcript.')
    }
  }

  const handleInspectArtifact = async () => {
    if (!runId) return
    setActionError('')
    setMessage('')
    try {
      const run = await window.electronAPI.getRun(runId)
      const artifact = run.artifacts.find((candidate) => candidate.type !== 'fast-scribe/text')
      if (!artifact) {
        setMessage('This run has no additional artifacts.')
        return
      }
      const fullArtifact = await window.electronAPI.readRunArtifact(runId, artifact.id)
      setSelectedArtifact(fullArtifact)
      setView('artifact')
      setIsLoading(true)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to inspect run artifacts.')
    }
  }

  const handleExportArtifact = async () => {
    if (!runId || !selectedArtifact) return
    setActionError('')
    setMessage('')
    try {
      const result = await window.electronAPI.exportRunArtifact(runId, selectedArtifact.id)
      if (!result.cancelled) setMessage('Artifact exported.')
    } catch (exportError) {
      setActionError(exportError instanceof Error ? exportError.message : 'Unable to export this artifact.')
    }
  }

  const handleRetry = () => {
    setIsLoading(true)
    setLoadError('')
    setActionError('')
    setMessage('')
    setLoadAttempt((attempt) => attempt + 1)
  }

  const handleCopy = async () => {
    setActionError('')
    setMessage('')
    try {
      await window.electronAPI.copyText(content)
      setMessage('Transcript copied to the clipboard.')
    } catch (copyError) {
      setActionError(copyError instanceof Error ? copyError.message : 'Unable to copy the transcript.')
    }
  }

  return (
    <aside className="flex w-[520px] min-w-[360px] shrink-0 flex-col border-l border-zinc-800 bg-zinc-950">
      <div className="flex h-10 items-center justify-between gap-3 border-b border-zinc-800 px-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-zinc-100">{fileName}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canViewRaw && (
            <div className="flex rounded-md border border-zinc-800 p-0.5">
              {(['final', 'raw'] as const).map((option) => (
                <Button
                  key={option}
                  variant={view === option ? 'outline' : 'ghost'}
                  size="sm"
                  className="h-6 px-2 capitalize"
                  onClick={() => {
                    if (!isDirty || window.confirm('Discard unsaved transcript changes?')) {
                      setView(option)
                      setIsLoading(true)
                      setLoadError('')
                    }
                  }}
                >
                  {option}
                </Button>
              ))}
            </div>
          )}
          {runId && (
            <Button variant="ghost" size="sm" onClick={() => { void handleInspectArtifact() }}>
              Inspect artifacts
            </Button>
          )}
          {isDirty && <span className="text-xs text-amber-400">Unsaved</span>}
          <Button variant="ghost" size="icon" title="Close transcript" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-4">
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-zinc-500">
            <Loader2 size={16} className="animate-spin" />
            Opening transcript...
          </div>
        ) : loadError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <AlertCircle size={22} className="text-red-400" />
            <p className="max-w-sm text-sm text-red-300">{loadError}</p>
            <Button variant="outline" size="sm" onClick={handleRetry}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            <textarea
              aria-label={`Transcript for ${fileName}`}
              spellCheck
              readOnly={view !== 'final'}
              value={content}
              onChange={(event) => {
                setContent(event.target.value)
                setMessage('')
                setActionError('')
              }}
              className="min-h-0 flex-1 resize-none rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 font-mono text-sm leading-6 text-zinc-200 outline-none transition-colors focus:border-violet-700 focus:ring-1 focus:ring-violet-700"
            />
            <div className="mt-3 min-h-5 text-xs">
              {actionError ? (
                <span className="text-red-400">{actionError}</span>
              ) : message ? (
                <span className="text-emerald-400">{message}</span>
              ) : (
                <span className="text-zinc-600">{content.length.toLocaleString()} characters</span>
              )}
            </div>
          </>
        )}
      </div>

      {!isLoading && !loadError && (
        <div className="flex justify-end gap-2 border-t border-zinc-800 p-4">
          <Button variant="outline" onClick={handleCopy}>
            <Clipboard size={14} /> Copy
          </Button>
          {view === 'artifact' ? (
            <Button onClick={() => { void handleExportArtifact() }}>
              <Download size={14} /> Export artifact
            </Button>
          ) : view === 'raw' ? (
            <Button onClick={handleExportRaw}>
              <Download size={14} /> Export raw
            </Button>
          ) : (
            <Button onClick={handleSave} disabled={!isDirty || isSaving}>
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save
            </Button>
          )}
        </div>
      )}
    </aside>
  )
}
