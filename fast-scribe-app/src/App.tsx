import { useCallback, useEffect, useState } from "react"
import { Play, X, Trash2, AlertCircle, Settings, Download, RefreshCw, Workflow } from "lucide-react"
import appIcon from "@/assets/app-icon.svg"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { DropZone } from "@/components/DropZone"
import { FileList } from "@/components/FileList"
import { SettingsPanel } from "@/components/SettingsPanel"
import { TranscriptPanel } from "@/components/TranscriptPanel"
import { WorkspacePipelineSummary } from "@/components/WorkspacePipelineSummary"
import { PipelineEditor } from "@/components/pipeline/PipelineEditor"
import { ToastProvider, ToastViewport, Toast, ToastTitle, ToastDescription, ToastClose } from "@/components/ui/toast"
import { useTranscription } from "@/hooks/useTranscription"
import { useToast } from "@/hooks/useToast"
import type { AppConfig, AppConfigUpdate, PipelineList, PipelineState, PluginManifest, UpdateState } from "@/lib/types"

const DEFAULT_CONFIG: AppConfig = {
  endpoint: "",
  model: "gpt-4o-transcribe",
  outputDir: "",
  chunkDurationMs: 600000,
  language: "auto",
  theme: "system",
  hasApiKey: false,
}

export default function App() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG)
  const [configLoaded, setConfigLoaded] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [activeView, setActiveView] = useState<'workspace' | 'pipeline'>('workspace')
  const [pipelineDirty, setPipelineDirty] = useState(false)
  const [pipelineState, setPipelineState] = useState<PipelineState | null>(null)
  const [pipelineList, setPipelineList] = useState<PipelineList | null>(null)
  const [plugins, setPlugins] = useState<PluginManifest[]>([])
  const [selectedTranscriptId, setSelectedTranscriptId] = useState<string | null>(null)
  const [transcriptDirty, setTranscriptDirty] = useState(false)
  const [updateState, setUpdateState] = useState<UpdateState | null>(null)
  const { toasts, toast, dismiss } = useToast()

  useEffect(() => {
    window.electronAPI.getConfig().then((cfg) => {
      setConfig(cfg)
      setConfigLoaded(true)
    })
    Promise.all([
      window.electronAPI.getPipeline(),
      window.electronAPI.listPipelines(),
      window.electronAPI.listPlugins(),
    ]).then(([nextState, nextList, nextPlugins]) => {
      setPipelineState(nextState)
      setPipelineList(nextList)
      setPlugins(nextPlugins)
    }).catch((error) => {
      toast({
        title: 'Unable to load pipelines',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      })
    })

    const unsubscribe = window.electronAPI.onUpdateState(setUpdateState)
    const unsubscribePipeline = window.electronAPI.onSelectedPipelineChange((nextState) => {
      setPipelineState(nextState)
      window.electronAPI.listPipelines().then(setPipelineList).catch((error) => {
        toast({
          title: 'Pipeline list refresh failed',
          description: error instanceof Error ? error.message : String(error),
          variant: 'error',
        })
      })
    })
    window.electronAPI.getUpdateState().then(setUpdateState)
    return () => {
      unsubscribe()
      unsubscribePipeline()
    }
  }, [toast])

  const { files, addFiles, removeFile, clearCompleted, startTranscription, cancelAll } =
    useTranscription()

  const handleSaveConfig = async (updates: AppConfigUpdate) => {
    const updated = await window.electronAPI.setConfig(updates)
    setConfig(updated)
    toast({ title: "Settings saved" })
  }

  const handleImportConfig = async (filePath: string, passphrase: string) => {
    const updated = await window.electronAPI.importConfig(filePath, passphrase)
    setConfig(updated)
    toast({ title: "Settings imported", description: "Your model settings and API key are ready to use." })
    return updated
  }

  const isRunning = files.some(
    (f) => f.status === "transcribing" || f.status === "converting" || f.status === "processing" || f.status === "queued"
  )
  const idleCount = files.filter((f) => f.status === "idle").length
  const doneCount = files.filter((f) => f.status === "done").length
  const errorCount = files.filter((f) => f.status === "error").length
  const activeJobCount = files.filter(
    (f) => f.status === "transcribing" || f.status === "converting" || f.status === "processing" || f.status === "queued"
  ).length
  const selectedTranscript = files.find((file) => file.id === selectedTranscriptId) ?? null
  const configMissing = !config.endpoint || !config.hasApiKey
  const closeTranscript = () => {
    if (transcriptDirty && !window.confirm("Discard unsaved transcript changes?")) {
      return false
    }
    setSelectedTranscriptId(null)
    setTranscriptDirty(false)
    return true
  }

  const loadPipelines = async () => {
    const [nextState, nextList, nextPlugins] = await Promise.all([
      window.electronAPI.getPipeline(),
      window.electronAPI.listPipelines(),
      window.electronAPI.listPlugins(),
    ])
    setPipelineState(nextState)
    setPipelineList(nextList)
    setPlugins(nextPlugins)
  }

  const openSettings = () => {
    if (!closeTranscript()) return
    if (activeView === 'pipeline' && pipelineDirty && !window.confirm('Leave this unsaved pipeline? You can continue editing when you return.')) {
      return
    }
    setActiveView('workspace')
    setSettingsOpen(true)
  }

  const openPipeline = async () => {
    if (!closeTranscript()) return
    if (activeView === 'pipeline') return
    try {
      await loadPipelines()
      setSettingsOpen(false)
      setActiveView('pipeline')
    } catch (error) {
      toast({ title: 'Unable to load pipelines', description: error instanceof Error ? error.message : String(error), variant: 'error' })
    }
  }

  const openWorkspace = () => {
    if (activeView === 'pipeline' && pipelineDirty && !window.confirm('Leave this unsaved pipeline? You can continue editing when you return.')) {
      return
    }
    setActiveView('workspace')
  }

  const handlePipelineDirty = useCallback((dirty: boolean) => {
    setPipelineDirty(dirty)
    window.electronAPI.setPipelineDirty(dirty).catch((error) => {
      toast({
        title: 'Unsaved pipeline protection unavailable',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      })
    })
  }, [toast])

  const handlePipelineSaved = useCallback((nextState: PipelineState) => {
    setPipelineState(nextState)
    window.electronAPI.listPipelines().then(setPipelineList).catch((error) => {
      toast({ title: 'Pipeline list refresh failed', description: error instanceof Error ? error.message : String(error), variant: 'error' })
    })
  }, [toast])

  const handleSelectPipeline = useCallback(async (id: string, revision: number) => {
    if (pipelineDirty && !window.confirm('Discard unsaved pipeline changes?')) return
    try {
      const selected = await window.electronAPI.selectPipeline({ id, expectedRevision: revision })
      setPipelineState(selected)
      setPipelineList(await window.electronAPI.listPipelines())
      handlePipelineDirty(false)
    } catch (error) {
      toast({ title: 'Unable to select pipeline', description: error instanceof Error ? error.message : String(error), variant: 'error' })
    }
  }, [handlePipelineDirty, pipelineDirty, toast])

  const handleCreatePipeline = useCallback(async () => {
    const name = window.prompt('Name this pipeline')
    if (!name?.trim()) return
    try {
      const created = await window.electronAPI.createPipeline({ name: name.trim() })
      const selected = await window.electronAPI.selectPipeline({ id: created.pipeline.id, expectedRevision: created.pipeline.revision })
      setPipelineState(selected)
      setPipelineList(await window.electronAPI.listPipelines())
      handlePipelineDirty(false)
    } catch (error) {
      toast({ title: 'Unable to create pipeline', description: error instanceof Error ? error.message : String(error), variant: 'error' })
    }
  }, [handlePipelineDirty, toast])

  const handleReviewTranscript = (id: string) => {
    if (id === selectedTranscriptId || !closeTranscript()) return
    setSettingsOpen(false)
    setSelectedTranscriptId(id)
  }

  const handleRemoveFile = (id: string) => {
    if (id === selectedTranscriptId && !closeTranscript()) return
    removeFile(id)
  }

  const handleClearCompleted = () => {
    if (selectedTranscript && !closeTranscript()) return
    clearCompleted()
  }

  const handleStart = async () => {
    if (configMissing) {
      toast({ title: "Configuration required", description: "Set your Azure endpoint and API key in Settings.", variant: "error" })
      return
    }
    try {
      await startTranscription()
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "error" })
    }
  }

  const handleUpdate = async () => {
    if (updateState?.status === "downloaded" && (transcriptDirty || pipelineDirty)) {
      toast({
        title: "Save or discard edits",
        description: transcriptDirty ? "Close the transcript editor before restarting to update." : "Save or revert the pipeline before restarting to update.",
        variant: "error",
      })
      return
    }
    try {
      if (updateState?.status === "downloaded") {
        await window.electronAPI.installUpdate()
      } else {
        await window.electronAPI.downloadUpdate()
      }
    } catch (error) {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "error",
      })
    }
  }

  const updateVisible =
    updateState?.status === "available" ||
    updateState?.status === "downloading" ||
    updateState?.status === "downloaded"

  useEffect(() => {
    window.electronAPI.setTranscriptDirty(transcriptDirty).catch((error) => {
      toast({
        title: "Unsaved-change protection unavailable",
        description: error instanceof Error ? error.message : String(error),
        variant: "error",
      })
    })
  }, [toast, transcriptDirty])

  if (!configLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <img src={appIcon} alt="Fast Scribe" className="h-8 w-8 animate-pulse" />
      </div>
    )
  }

  return (
    <ToastProvider>
      <div className="flex h-screen bg-zinc-950 text-zinc-100 select-none">
        <div className="flex min-w-0 flex-1 flex-col">
          <div
            className="flex h-10 items-center justify-between px-4"
            style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
          >
            <div className="flex items-center gap-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
              <img src={appIcon} alt="" aria-hidden="true" className="h-4 w-4" />
              <span className="text-sm font-semibold tracking-tight">Fast Scribe</span>
              <Button
                variant={activeView === 'workspace' ? "outline" : "ghost"}
                size="sm"
                title="Transcription workspace"
                onClick={openWorkspace}
              >
                <Play size={14} />
                Workspace
              </Button>
              <Button
                variant={activeView === 'pipeline' ? "outline" : "ghost"}
                size="sm"
                title="Pipeline editor"
                onClick={() => { void openPipeline() }}
              >
                <Workflow size={14} />
                Pipeline
              </Button>
              <Button
                variant={settingsOpen && activeView === 'workspace' ? "outline" : "ghost"}
                size="sm"
                title="Settings"
                onClick={() => {
                  if (settingsOpen) {
                    setSettingsOpen(false)
                  } else {
                    openSettings()
                  }
                }}
              >
                <Settings size={14} />
                Settings
              </Button>
            </div>
          </div>

          <Separator />

        <div className={activeView === 'workspace' ? "flex flex-1 flex-col gap-4 overflow-y-auto p-5" : "hidden"}>
          {updateVisible && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-violet-800/70 bg-violet-950/30 px-4 py-3 text-xs text-violet-200">
              <div className="flex items-center gap-2">
                {updateState.status === "downloading" ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Download size={14} />
                )}
                <span>
                  {updateState.status === "downloaded"
                    ? `Fast Scribe ${updateState.version} is ready to install.`
                    : updateState.status === "downloading"
                      ? `Downloading Fast Scribe ${updateState.version}... ${updateState.progress ?? 0}%`
                      : `Fast Scribe ${updateState.version} is available.`}
                </span>
              </div>
              <Button
                size="sm"
                onClick={handleUpdate}
                disabled={
                  updateState.status === "downloading" ||
                  (updateState.status === "downloaded" && (isRunning || transcriptDirty))
                }
                title={
                  updateState.status === "downloaded"
                    ? isRunning
                      ? "Finish or cancel active transcriptions before updating"
                      : transcriptDirty
                        ? "Save or discard transcript changes before updating"
                        : undefined
                    : undefined
                }
              >
                {updateState.status === "downloaded" && (isRunning || transcriptDirty)
                  ? isRunning
                    ? "Finish transcription to update"
                    : "Save transcript to update"
                  : updateState.status === "downloaded"
                    ? "Restart and update"
                    : "Download update"}
              </Button>
            </div>
          )}

          {configMissing && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-900/60 bg-amber-950/30 px-4 py-2.5 text-xs text-amber-400">
              <div className="flex items-center gap-2">
              <AlertCircle size={13} className="shrink-0" />
                Azure endpoint and API key not configured.
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-amber-800 text-amber-300 hover:bg-amber-900/40 hover:text-amber-200"
                onClick={openSettings}
              >
                Open Settings
              </Button>
        </div>
          )}

          <WorkspacePipelineSummary
            pipelineName={pipelineState?.pipeline.name ?? 'Default pipeline'}
            destinationCount={pipelineState?.pipeline.pipeline.destinations.length ?? 0}
            valid={pipelineState?.validation.valid ?? true}
            outputDir={config.outputDir}
            onEdit={() => { void openPipeline() }}
          />

          <DropZone onFilesAdded={addFiles} />

          {activeView === 'workspace' && files.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">
                  {files.length} file{files.length !== 1 ? "s" : ""}
                  {doneCount > 0 && ` · ${doneCount} done`}
                  {errorCount > 0 && ` · ${errorCount} error${errorCount !== 1 ? "s" : ""}`}
                </span>
                {(doneCount > 0 || errorCount > 0) && (
                  <Button variant="ghost" size="sm" onClick={handleClearCompleted} className="h-6 gap-1 text-xs text-zinc-500">
                    <Trash2 size={11} /> Clear completed
                  </Button>
                )}
              </div>
              <FileList
                files={files}
                onRemove={handleRemoveFile}
                onOpenOutput={(p) => window.electronAPI.openInExplorer(p)}
                onReview={handleReviewTranscript}
              />
            </>
          )}

        </div>

        {files.length > 0 && (
          <>
            <Separator />
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-xs text-zinc-600">
                {isRunning
                  ? `Processing ${activeJobCount} file(s)...`
                  : idleCount > 0
                  ? `${idleCount} file${idleCount !== 1 ? "s" : ""} ready`
                  : "All complete"}
              </span>
              <div className="flex gap-2">
                {isRunning && (
                  <Button variant="outline" size="sm" onClick={cancelAll}>
                    <X size={14} /> Cancel
                  </Button>
                )}
                {!isRunning && idleCount > 0 && (
                  <Button size="sm" onClick={handleStart}>
                    <Play size={14} /> Transcribe
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
          <PipelineEditor
            active={activeView === 'pipeline'}
            selectedState={pipelineState}
            pipelines={pipelineList}
            plugins={plugins}
            onDirtyChange={handlePipelineDirty}
            onSaved={handlePipelineSaved}
            onSelect={(id, revision) => { void handleSelectPipeline(id, revision) }}
            onCreate={() => { void handleCreatePipeline() }}
            activeJobCount={activeJobCount}
            onCancelActiveJobs={cancelAll}
          />
          </div>

          {settingsOpen && activeView === 'workspace' && (
            <SettingsPanel
              config={config}
              onSave={handleSaveConfig}
              onExportSettings={(passphrase) => window.electronAPI.exportConfig(passphrase)}
              onChooseSettingsImport={() => window.electronAPI.selectConfigImport()}
              onImportSettings={handleImportConfig}
              onClose={() => setSettingsOpen(false)}
            />
          )}
          {selectedTranscript?.outputPath && (
            <TranscriptPanel
              key={selectedTranscript.id}
              fileName={selectedTranscript.name}
              outputPath={selectedTranscript.outputPath}
              runId={selectedTranscript.runId}
              rawArtifactId={selectedTranscript.rawArtifactId}
              onClose={closeTranscript}
              onDirtyChange={setTranscriptDirty}
            />
          )}
        </div>
      <ToastViewport />
      {toasts.map((t) => (
        <Toast key={t.id}>
          <div className="flex-1">
            <ToastTitle>{t.title}</ToastTitle>
            {t.description && <ToastDescription>{t.description}</ToastDescription>}
          </div>
          <ToastClose onClick={() => dismiss(t.id)} />
        </Toast>
      ))}
    </ToastProvider>
  )
}
