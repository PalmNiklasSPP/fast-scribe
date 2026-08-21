import { useState, useEffect } from 'react'
import { Settings, FolderOpen } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import type { AppConfig } from '@/lib/types'

interface SettingsPanelProps {
  config: AppConfig
  onSave: (updates: Partial<AppConfig>) => Promise<void>
}

export function SettingsPanel({ config, onSave }: SettingsPanelProps) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<AppConfig>(config)

  useEffect(() => setForm(config), [config])

  const set = (key: keyof AppConfig, value: string | number) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleBrowseOutput = async () => {
    const folder = await window.electronAPI.openFolder()
    if (folder) set('outputDir', folder)
  }

  const handleSave = async () => {
    await onSave(form)
    setOpen(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="icon" title="Settings">
          <Settings size={18} />
        </Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <Dialog.Title className="text-base font-semibold text-zinc-100">Settings</Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-zinc-500">
            Configure your Azure OpenAI connection and transcription defaults.
          </Dialog.Description>

          <div className="mt-6 flex flex-col gap-4">
            {/* Azure Config */}
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-600">Azure OpenAI</p>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="endpoint">Endpoint URL</Label>
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
                    placeholder="••••••••••••••••"
                    value={form.apiKey}
                    onChange={(e) => set('apiKey', e.target.value)}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Output */}
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

            {/* Transcription */}
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

          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="outline">Cancel</Button>
            </Dialog.Close>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
