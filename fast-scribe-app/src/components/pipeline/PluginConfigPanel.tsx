import { Info, Link2Off, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { PipelineNode, PluginManifest } from '@/lib/types'

interface PluginConfigPanelProps {
  node: PipelineNode
  plugin?: PluginManifest
  onClose: () => void
  onChange: (key: string, value: unknown) => void
  onDelete: () => void
  connections: Array<{ label: string; from: string; to: string; onDisconnect: () => void }>
}

interface SchemaProperty {
  type?: 'string' | 'number' | 'integer' | 'boolean'
  enum?: unknown[]
  description?: string
}

function schemaProperties(schema: Record<string, unknown>): Array<[string, SchemaProperty]> {
  const properties = schema.properties
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return []
  return Object.entries(properties).flatMap(([key, property]) => (
    property && typeof property === 'object' && !Array.isArray(property)
      ? [[key, property as SchemaProperty]]
      : []
  ))
}

export function PluginConfigPanel({ node, plugin, onClose, onChange, onDelete, connections }: PluginConfigPanelProps) {
  if (!plugin) {
    return (
      <aside className="pipeline-panel pipeline-inspector" aria-label="Missing plugin">
        <div className="pipeline-panel__header">
          <div><h2>Plugin unavailable</h2><p>{node.pluginId}@{node.pluginVersion}</p></div>
          <Button variant="ghost" size="icon" title="Close inspector" aria-label="Close inspector" onClick={onClose}><X size={16} /></Button>
        </div>
        <div className="pipeline-inspector__body">
          <div className="pipeline-notice"><Info size={14} />Install this plugin version or remove this node before saving.</div>
        </div>
        <div className="pipeline-inspector__footer">
          <Button variant="ghost" className="w-full text-red-300 hover:bg-red-950/40 hover:text-red-200" onClick={onDelete}>Delete unavailable node</Button>
        </div>
      </aside>
    )
  }
  const properties = schemaProperties(plugin.configSchema)

  return (
    <aside className="pipeline-panel pipeline-inspector" aria-label="Module inspector">
      <div className="pipeline-panel__header">
        <div><h2>{plugin.name}</h2><p>v{plugin.version}</p></div>
        <Button variant="ghost" size="icon" title="Close inspector" aria-label="Close inspector" onClick={onClose}><X size={16} /></Button>
      </div>
      <div className="pipeline-inspector__body">
        <p className="pipeline-inspector__description">{plugin.description}</p>
        {plugin.id === 'fast-scribe.placeholder-anonymizer' && (
          <div className="pipeline-notice"><Info size={14} />This placeholder is not production anonymization.</div>
        )}
        {properties.length > 0 && (
          <section>
            <p className="pipeline-section-label">Settings</p>
            <div className="flex flex-col gap-4">
              {properties.map(([key, property]) => {
                const value = node.config[key]
                const enumOptions = property.enum?.filter((entry): entry is string | number => (
                  typeof entry === 'string' || typeof entry === 'number'
                ))
                return (
                  <label key={key} className="pipeline-field">
                    <span>{key}</span>
                    {property.description && <small>{property.description}</small>}
                    {enumOptions ? (
                      <select value={String(value ?? '')} onChange={(event) => onChange(key, event.target.value)}>
                        {enumOptions.map((option) => <option key={String(option)} value={String(option)}>{option}</option>)}
                      </select>
                    ) : property.type === 'boolean' ? (
                      <button
                        type="button"
                        className={`pipeline-toggle ${value === true ? 'pipeline-toggle--on' : ''}`}
                        role="switch"
                        aria-checked={value === true}
                        onClick={() => onChange(key, value !== true)}
                      ><span /> {value === true ? 'On' : 'Off'}</button>
                    ) : (
                      <Input
                        type={property.type === 'number' || property.type === 'integer' ? 'number' : 'text'}
                        value={value === undefined ? '' : String(value)}
                        onChange={(event) => {
                          const next = property.type === 'number' || property.type === 'integer'
                            ? Number(event.target.value)
                            : event.target.value
                          onChange(key, next)
                        }}
                      />
                    )}
                  </label>
                )
              })}
            </div>
          </section>
        )}
        <section>
          <p className="pipeline-section-label">Ports</p>
          <div className="pipeline-port-summary">
            <span>Inputs</span><strong>{plugin.inputs.map((port) => port.id).join(', ') || 'None'}</strong>
            <span>Outputs</span><strong>{plugin.outputs.map((port) => port.id).join(', ') || 'None'}</strong>
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
        <Button variant="ghost" className="w-full text-red-300 hover:bg-red-950/40 hover:text-red-200" onClick={onDelete}>Delete module</Button>
      </div>
    </aside>
  )
}
