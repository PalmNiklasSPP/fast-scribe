import { Search, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { PipelinePosition, PluginManifest } from '@/lib/types'

interface PluginPaletteProps {
  plugins: PluginManifest[]
  onAdd: (plugin: PluginManifest, position: PipelinePosition) => void
  onClose: () => void
}

export function PluginPalette({ plugins, onAdd, onClose }: PluginPaletteProps) {
  const [query, setQuery] = useState('')
  const filtered = plugins.filter((plugin) =>
    `${plugin.name} ${plugin.description}`.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <aside className="pipeline-panel pipeline-palette" aria-label="Module library">
      <div className="pipeline-panel__header">
        <div>
          <h2>Module library</h2>
          <p>Installed processing plugins.</p>
        </div>
        <Button variant="ghost" size="icon" title="Close module library" aria-label="Close module library" onClick={onClose}>
          <X size={16} />
        </Button>
      </div>
      <label className="pipeline-search">
        <Search size={14} />
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search modules" />
      </label>
      <div className="pipeline-palette__list">
        {filtered.map((plugin) => (
          <article
            key={`${plugin.id}@${plugin.version}`}
            className="pipeline-module-card"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData('application/fast-scribe-plugin', `${plugin.id}@${plugin.version}`)
              event.dataTransfer.effectAllowed = 'move'
            }}
          >
            <div className="pipeline-module-card__title">
              <span className="pipeline-node__glyph"><Sparkles size={14} /></span>
              <strong>{plugin.name}</strong>
            </div>
            <p>{plugin.description}</p>
            <span className="pipeline-badge">v{plugin.version}</span>
            <Button size="sm" variant="outline" onClick={() => onAdd(plugin, { x: 380, y: 360 })}>Add</Button>
          </article>
        ))}
        {!filtered.length && <p className="pipeline-empty">No installed plugins match “{query}”.</p>}
      </div>
    </aside>
  )
}
