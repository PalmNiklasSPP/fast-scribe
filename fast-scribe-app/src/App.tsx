import { useEffect, useState, useMemo } from "react"
import { Play, X, Trash2, AlertCircle, Settings, Download, RefreshCw } from "lucide-react"
import appIcon from "@/assets/app-icon.svg"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { DropZone } from "@/components/DropZone"
import { FileList } from "@/components/FileList"
import { OverwriteConfirmationDialog } from "@/components/OverwriteConfirmationDialog"
import { SettingsPanel } from "@/components/SettingsPanel"
import { ToastProvider, ToastViewport, Toast, ToastTitle, ToastDescription, ToastClose } from "@/components/ui/toast"
import { useTranscription } from "@/hooks/useTranscription"
import { useToast } from "@/hooks/useToast"
import type { AppConfig, AppConfigUpdate, UpdateState } from "@/lib/types"

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
  const [updateState, setUpdateState] = useState<UpdateState | null>(null)
  const { toasts, toast, dismiss } = useToast()

  useEffect(() => {
    window.electronAPI.getConfig().then((cfg) => {
      setConfig(cfg)
      setConfigLoaded(true)
    })

    const unsubscribe = window.electronAPI.onUpdateState(setUpdateState)
    window.electronAPI.getUpdateState().then(setUpdateState)
    return unsubscribe
  }, [])

  const {
    files,
    addFiles,
    removeFile,
    clearCompleted,
    startTranscription,
    cancelAll,
    pendingOverwrite,
    resolveOverwrite,
  } =
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
    (f) => f.status === "transcribing" || f.status === "converting" || f.status === "queued"
  )
  const idleCount = files.filter((f) => f.status === "idle").length
  const doneCount = files.filter((f) => f.status === "done").length
  const errorCount = files.filter((f) => f.status === "error").length
  const configMissing = !config.endpoint || !config.hasApiKey
  const pipelineSteps = useMemo(() => [] as string[], [])

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
                variant={settingsOpen ? "outline" : "ghost"}
                size="sm"
                title="Settings"
                onClick={() => setSettingsOpen((open) => !open)}
              >
                <Settings size={14} />
                Settings
              </Button>
            </div>
          </div>

          <Separator />

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
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
                  (updateState.status === "downloaded" && isRunning)
                }
                title={
                  updateState.status === "downloaded" && isRunning
                    ? "Finish or cancel active transcriptions before updating"
                    : undefined
                }
              >
                {updateState.status === "downloaded" && isRunning
                  ? "Finish transcription to update"
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
                onClick={() => setSettingsOpen(true)}
              >
                Open Settings
              </Button>
        </div>
          )}

          <DropZone onFilesAdded={addFiles} />

          {files.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">
                  {files.length} file{files.length !== 1 ? "s" : ""}
                  {doneCount > 0 && ` · ${doneCount} done`}
                  {errorCount > 0 && ` · ${errorCount} error${errorCount !== 1 ? "s" : ""}`}
                </span>
                {(doneCount > 0 || errorCount > 0) && (
                  <Button variant="ghost" size="sm" onClick={clearCompleted} className="h-6 gap-1 text-xs text-zinc-500">
                    <Trash2 size={11} /> Clear completed
                  </Button>
                )}
              </div>
              <FileList
                files={files}
                onRemove={removeFile}
                onOpenOutput={(p) => window.electronAPI.openInExplorer(p)}
              />
            </>
          )}

          {pipelineSteps.length > 0 && (
            <div className="rounded-lg border border-zinc-800 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600">Pipeline</p>
            </div>
          )}
        </div>

        {files.length > 0 && (
          <>
            <Separator />
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-xs text-zinc-600">
                {isRunning
                  ? `Transcribing ${files.filter((f) => f.status === "transcribing" || f.status === "converting").length} file(s)...`
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
          </div>

          {settingsOpen && (
            <SettingsPanel
              config={config}
              onSave={handleSaveConfig}
              onExportSettings={(passphrase) => window.electronAPI.exportConfig(passphrase)}
              onChooseSettingsImport={() => window.electronAPI.selectConfigImport()}
              onImportSettings={handleImportConfig}
              onClose={() => setSettingsOpen(false)}
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
      <OverwriteConfirmationDialog
        overwrite={pendingOverwrite}
        onCancel={() => resolveOverwrite(false)}
        onConfirm={() => resolveOverwrite(true)}
      />
    </ToastProvider>
  )
}
