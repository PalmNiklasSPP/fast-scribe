import { useState } from 'react'
import { Download, FolderOpen, ShieldCheck, Trash2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import type { AppConfig, AppConfigUpdate, SettingsFileResult } from '@/lib/types'

interface SettingsPanelProps {
  config: AppConfig
  onSave: (updates: AppConfigUpdate) => Promise<void>
  onExportSettings: (passphrase: string) => Promise<SettingsFileResult>
  onChooseSettingsImport: () => Promise<SettingsFileResult>
  onImportSettings: (filePath: string, passphrase: string) => Promise<AppConfig>
  onClose: () => void
}

type TransferMode = 'export' | 'import' | null

export function SettingsPanel({
  config,
  onSave,
  onExportSettings,
  onChooseSettingsImport,
  onImportSettings,
  onClose,
}: SettingsPanelProps) {
  const [form, setForm] = useState<AppConfig>(config)
  const [apiKey, setApiKey] = useState('')
  const [transferMode, setTransferMode] = useState<TransferMode>(null)
  const [transferPassword, setTransferPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [importFilePath, setImportFilePath] = useState('')
  const [transferError, setTransferError] = useState('')
  const [isTransferring, setIsTransferring] = useState(false)

  const set = (key: keyof AppConfig, value: string | number) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleBrowseOutput = async () => {
    const folder = await window.electronAPI.openFolder()
    if (folder) set('outputDir', folder)
  }

  const handleSave = async () => {
    const { hasApiKey: _hasApiKey, ...updates } = form
    const settings: AppConfigUpdate = updates
    if (apiKey) settings.apiKey = apiKey
    await onSave(settings)
    onClose()
  }

  const closeTransfer = () => {
    setTransferMode(null)
    setTransferPassword('')
    setConfirmPassword('')
    setImportFilePath('')
    setTransferError('')
  }

  const startImport = async () => {
    setTransferError('')
    const result = await onChooseSettingsImport()
    if (!result.cancelled && result.filePath) {
      setImportFilePath(result.filePath)
      setTransferMode('import')
    }
  }

  const handleTransfer = async () => {
    if (transferPassword.length < 8) {
      setTransferError('Use a password with at least 8 characters.')
      return
    }
    if (transferMode === 'export' && transferPassword !== confirmPassword) {
      setTransferError('Passwords do not match.')
      return
    }

    setIsTransferring(true)
    setTransferError('')
    try {
      if (transferMode === 'export') {
        await onExportSettings(transferPassword)
      } else if (importFilePath) {
        const imported = await onImportSettings(importFilePath, transferPassword)
        setForm(imported)
        setApiKey('')
      }
      closeTransfer()
    } catch (error) {
      setTransferError(error instanceof Error ? error.message : 'Unable to transfer settings.')
    } finally {
      setIsTransferring(false)
    }
  }

  const clearApiKey = async () => {
    await onSave({ apiKey: '' })
    setApiKey('')
    setForm((previous) => ({ ...previous, hasApiKey: false }))
  }

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-zinc-800 bg-zinc-950">
      <div className="flex h-10 items-center justify-between border-b border-zinc-800 px-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Settings</h2>
        </div>
        <Button variant="ghost" size="icon" title="Close settings" onClick={onClose}>
          <X size={16} />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <p className="text-xs text-zinc-500">
          Configure where transcripts are saved and which Azure OpenAI model to use.
        </p>
        <div className="mt-6 flex flex-col gap-4">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-600">Model configuration</p>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="model">Model</Label>
                  <Input
                    id="model"
                    placeholder="gpt-4o-transcribe"
                    value={form.model}
                    onChange={(e) => set('model', e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="endpoint">Deployment endpoint</Label>
                  <Input
                    id="endpoint"
                    placeholder="https://your-resource.openai.azure.com/openai/deployments/..."
                    value={form.endpoint}
                    onChange={(e) => set('endpoint', e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="apiKey">API Key</Label>
                  <Input
                    id="apiKey"
                    type="password"
                    placeholder={form.hasApiKey ? "Stored securely (leave blank to keep)" : "Enter your API key"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                  {form.hasApiKey && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-fit px-0 text-zinc-500 hover:bg-transparent hover:text-red-300"
                      onClick={clearApiKey}
                    >
                      <Trash2 size={12} /> Clear stored key
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck size={14} className="text-violet-400" />
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600">Settings transfer</p>
              </div>
              <p className="mb-3 text-xs leading-5 text-zinc-500">
                Share model settings in a password-protected file. Your local output folder stays private.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setTransferMode('export')}>
                  <Download size={13} /> Export
                </Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={startImport}>
                  <Upload size={13} /> Import
                </Button>
              </div>
            </div>

            <Separator />

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-600">Output</p>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="outputDir">Output Folder</Label>
                  <div className="flex gap-2">
                    <Input
                      id="outputDir"
                      placeholder="Same folder as source file"
                      value={form.outputDir}
                      onChange={(e) => set('outputDir', e.target.value)}
                      className="flex-1"
                    />
                    <Button variant="outline" size="icon" onClick={handleBrowseOutput}>
                      <FolderOpen size={15} />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-600">Transcription</p>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="chunkDuration">Chunk Duration (minutes)</Label>
                  <Input
                    id="chunkDuration"
                    type="number"
                    min={1}
                    max={60}
                    value={Math.round(form.chunkDurationMs / 60000)}
                    onChange={(e) => set('chunkDurationMs', Number(e.target.value) * 60000)}
                    className="w-32"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="language">Language (ISO code or "auto")</Label>
                  <Input
                    id="language"
                    placeholder="auto"
                    value={form.language}
                    onChange={(e) => set('language', e.target.value)}
                    className="w-32"
                  />
                </div>
              </div>
            </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-zinc-800 p-4">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave}>Save changes</Button>
      </div>

      {transferMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-transfer-title"
            className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 id="settings-transfer-title" className="text-sm font-semibold text-zinc-100">
                  {transferMode === 'export' ? 'Protect settings export' : 'Unlock settings file'}
                </h3>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  {transferMode === 'export'
                    ? 'This password encrypts the API key and model settings in the exported file.'
                    : 'Enter the password used to protect this settings file.'}
                </p>
              </div>
              <Button variant="ghost" size="icon" title="Close" onClick={closeTransfer}>
                <X size={16} />
              </Button>
            </div>

            {transferMode === 'import' && (
              <p className="mb-3 truncate rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-400">
                {importFilePath}
              </p>
            )}

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="settings-password">Password</Label>
                <Input
                  id="settings-password"
                  type="password"
                  autoFocus
                  value={transferPassword}
                  onChange={(event) => setTransferPassword(event.target.value)}
                />
              </div>
              {transferMode === 'export' && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="settings-password-confirm">Confirm password</Label>
                  <Input
                    id="settings-password-confirm"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </div>
              )}
              {transferError && <p className="text-xs text-red-400">{transferError}</p>}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={closeTransfer} disabled={isTransferring}>Cancel</Button>
              <Button onClick={handleTransfer} disabled={isTransferring}>
                {transferMode === 'export' ? 'Export encrypted file' : 'Import settings'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
