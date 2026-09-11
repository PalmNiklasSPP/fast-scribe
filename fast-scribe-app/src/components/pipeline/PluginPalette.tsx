import { Search, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { PreviewModule, PreviewPosition } from '@/lib/pipeline-fixtures'
import { previewModules } from '@/lib/pipeline-fixtures'

interface PluginPaletteProps {
  onAdd: (moduleDefinition: PreviewModule, position: PreviewPosition) => void
  onClose: () => void
}

export function PluginPalette({ onAdd, onClose }: PluginPaletteProps) {
  const [query, setQuery] = useState('')
  const filtered = previewModules.filter((moduleDefinition) =>
    `${moduleDefinition.name} ${moduleDefinition.description}`.toLowerCase().includes(query.toLowerCase()),
  )

  const addModule = (moduleDefinition: PreviewModule) => onAdd(moduleDefinition, { x: 380, y: 360 })

  return (
    <aside className="pipeline-panel pipeline-palette" aria-label="Module library">
      <div className="pipeline-panel__header">
        <div>
          <h2>Module library</h2>
          <p>Compose a preview flow.</p>
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
        {filtered.map((moduleDefinition) => (
          <article
            key={moduleDefinition.id}
            className="pipeline-module-card"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData('application/fast-scribe-module', moduleDefinition.id)
              event.dataTransfer.effectAllowed = 'move'
            }}
          >
            <div className="pipeline-module-card__title">
              <span className="pipeline-node__glyph"><Sparkles size={14} /></span>
              <strong>{moduleDefinition.name}</strong>
              <span className="pipeline-badge">{moduleDefinition.kind === 'demo' ? 'Demo' : 'Example'}</span>
            </div>
            <p>{moduleDefinition.description}</p>
            <Button size="sm" variant="outline" onClick={() => addModule(moduleDefinition)}>Add</Button>
          </article>
        ))}
        {!filtered.length && <p className="pipeline-empty">No modules match “{query}”.</p>}
      </div>
    </aside>
  )
}
