import { FolderOutput, Info, Link2Off, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { PreviewNode } from '@/lib/pipeline-fixtures'
import { findModule } from '@/lib/pipeline-editor'

interface PluginConfigPanelProps {
  node: PreviewNode
  onClose: () => void
  onChange: (key: string, value: unknown) => void
  onDelete: () => void
  outputDir: string
  connections: Array<{ label: string; from: string; to: string; onDisconnect: () => void }>
}

export function PluginConfigPanel({ node, onClose, onChange, onDelete, outputDir, connections }: PluginConfigPanelProps) {
  const moduleDefinition = findModule(node.moduleId)
  if (!moduleDefinition) return null
  const extension = moduleDefinition.inputs[0]?.type === 'fast-scribe/anonymization-map' ? 'json' : 'txt'

  return (
    <aside className="pipeline-panel pipeline-inspector" aria-label="Module inspector">
      <div className="pipeline-panel__header">
        <div>
          <div className="flex items-center gap-2">
            <h2>{moduleDefinition.name}</h2>
            <span className="pipeline-badge">{moduleDefinition.kind === 'demo' ? 'Demo' : 'Example'}</span>
          </div>
          <p>v{moduleDefinition.version}</p>
        </div>
        <Button variant="ghost" size="icon" title="Close inspector" aria-label="Close inspector" onClick={onClose}>
          <X size={16} />
        </Button>
      </div>
      <div className="pipeline-inspector__body">
        <p className="pipeline-inspector__description">{moduleDefinition.description}</p>
        {moduleDefinition.kind === 'example' && (
          <div className="pipeline-notice">
            <Info size={14} />
            This example is not production anonymization.
          </div>
        )}
        <section>
          <p className="pipeline-section-label">Settings</p>
          <div className="flex flex-col gap-4">
            {moduleDefinition.fields.filter((field) =>
              field.id !== 'folder' || node.config.folderMode === 'Custom folder',
            ).map((field) => (
              <label key={field.id} className="pipeline-field">
                <span>{field.label}</span>
                {field.description && <small>{field.description}</small>}
                {field.type === 'string' && (
                  <Input
                    value={typeof node.config[field.id] === 'string' ? String(node.config[field.id]) : ''}
                    onChange={(event) => onChange(field.id, event.target.value)}
                  />
                )}
                {field.type === 'boolean' && (
                  <button
                    type="button"
                    className={`pipeline-toggle ${node.config[field.id] === true ? 'pipeline-toggle--on' : ''}`}
                    role="switch"
                    aria-checked={node.config[field.id] === true}
                    onClick={() => onChange(field.id, node.config[field.id] !== true)}
                  >
                    <span /> {node.config[field.id] === true ? 'On' : 'Off'}
                  </button>
                )}
                {field.type === 'enum' && (
                  <select value={String(node.config[field.id] ?? '')} onChange={(event) => onChange(field.id, event.target.value)}>
                    {field.options?.map((option) => <option key={option}>{option}</option>)}
                  </select>
                )}
              </label>
            ))}
          </div>
        </section>
        {moduleDefinition.kind === 'destination' && (
          <section className="pipeline-destination-details">
            <p className="pipeline-section-label">Destination preview</p>
            <div className="pipeline-destination-details__path">
              <FolderOutput size={14} />
              <span>
                {node.config.folderMode === 'Custom folder'
                  ? String(node.config.folder || 'Choose a custom folder')
                  : outputDir || 'Same folder as each source file'}
                \{String(node.config.filename || `export.${extension}`)}.{extension}
              </span>
            </div>
            <p>Not written. Folder access and JSON export are wired in the functional iteration.</p>
          </section>
        )}
        <section>
          <p className="pipeline-section-label">Ports</p>
          <div className="pipeline-port-summary">
            <span>Inputs</span>
            <strong>{moduleDefinition.inputs.map((port) => port.id).join(', ') || 'None'}</strong>
            <span>Outputs</span>
            <strong>{moduleDefinition.outputs.map((port) => port.id).join(', ') || 'None'}</strong>
          </div>
        </section>
        {connections.length > 0 && (
          <section>
            <p className="pipeline-section-label">Connections</p>
            <div className="pipeline-connections">
              {connections.map((connection) => (
                <div key={`${connection.from}-${connection.to}`}>
                  <span>{connection.label}</span>
                  <Button variant="ghost" size="sm" title={`Disconnect ${connection.label}`} onClick={connection.onDisconnect}>
                    <Link2Off size={13} /> Disconnect
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
      <div className="pipeline-inspector__footer">
        <Button variant="ghost" className="w-full text-red-300 hover:bg-red-950/40 hover:text-red-200" onClick={onDelete}>
          Delete module
        </Button>
      </div>
    </aside>
  )
}
