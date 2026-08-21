import { useState } from 'react'
import { FolderOpen, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import type { AppConfig } from '@/lib/types'

interface SettingsPanelProps {
  config: AppConfig
  onSave: (updates: Partial<AppConfig>) => Promise<void>
  onClose: () => void
}

export function SettingsPanel({ config, onSave, onClose }: SettingsPanelProps) {
  const [form, setForm] = useState<AppConfig>(config)

  const set = (key: keyof AppConfig, value: string | number) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleBrowseOutput = async () => {
    const folder = await window.electronAPI.openFolder()
    if (folder) set('outputDir', folder)
  }

  const handleSave = async () => {
    await onSave(form)
    onClose()
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
                    placeholder="••••••••••••••••"
                    value={form.apiKey}
                    onChange={(e) => set('apiKey', e.target.value)}
                  />
                </div>
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
    </aside>
  )
}
