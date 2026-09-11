import { AlertCircle, ChevronDown, ChevronRight, FolderPlus, Link2Off, Plus, RotateCcw, Save, Trash2, Undo2, Redo2, Workflow } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PipelineCanvas } from '@/components/pipeline/PipelineCanvas'
import { PluginPalette } from '@/components/pipeline/PluginPalette'
import { PluginConfigPanel } from '@/components/pipeline/PluginConfigPanel'
import { usePipelineEditor } from '@/hooks/usePipelineEditor'
import { INPUT_NODE_ID, OUTPUT_NODE_ID, TEXT_ARTIFACT_TYPE, edgeId, findPlugin } from '@/lib/pipeline-editor'
import type { PipelineEndpoint, PipelineList, PipelineState, PluginManifest } from '@/lib/types'
import './pipeline.css'

interface PipelineEditorProps {
  active: boolean
  selectedState: PipelineState | null
  pipelines: PipelineList | null
  plugins: PluginManifest[]
  onDirtyChange: (dirty: boolean) => void
  onSaved: (state: PipelineState) => void
  onSelect: (id: string, revision: number) => void
  onCreate: () => void
  activeJobCount: number
  onCancelActiveJobs: () => void
}

function endpointLabel(endpoint: PipelineEndpoint): string {
  if (endpoint.nodeId === INPUT_NODE_ID) return 'Raw transcript'
  if (endpoint.nodeId === OUTPUT_NODE_ID) return 'Final transcript'
  return `${endpoint.nodeId}:${endpoint.portId}`
}

function RuntimePipelineEditor({
  state,
  plugins,
  onDirtyChange,
  onSaved,
  pipelines,
  onSelect,
  onCreate,
  activeJobCount,
  onCancelActiveJobs,
}: Omit<PipelineEditorProps, 'active' | 'selectedState'> & { state: PipelineState }) {
  const editor = usePipelineEditor(state, plugins, onDirtyChange, onSaved)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [issuesOpen, setIssuesOpen] = useState(false)
  const [selectedConnection, setSelectedConnection] = useState<{ from: PipelineEndpoint; to: PipelineEndpoint }>()
  const selectedNode = editor.draft.pipeline.nodes.find((node) => node.id === editor.selectedNodeId)
  const allConnections = [
    ...editor.draft.pipeline.connections,
    { from: editor.draft.pipeline.output, to: { nodeId: OUTPUT_NODE_ID, portId: 'text' } },
  ]
  const nodeConnections = selectedNode
    ? allConnections.filter((connection) => connection.from.nodeId === selectedNode.id || connection.to.nodeId === selectedNode.id)
    : []
  const artifactSources = useMemo(() => {
    const sources = [{ endpoint: { nodeId: INPUT_NODE_ID, portId: 'text' }, type: TEXT_ARTIFACT_TYPE, label: 'Raw transcript' }]
    for (const node of editor.draft.pipeline.nodes) {
      const plugin = findPlugin(plugins, node)
      for (const port of plugin?.outputs ?? []) {
        sources.push({ endpoint: { nodeId: node.id, portId: port.id }, type: port.type, label: `${node.id}: ${port.id}` })
      }
    }
    return sources
  }, [editor.draft.pipeline.nodes, plugins])
  const outputTypes = [...new Set(artifactSources.map((source) => source.type))]

  return (
    <main className="pipeline-editor" aria-label="Pipeline editor">
      <div className="pipeline-editor__header">
        <div className="pipeline-editor__title">
          <Workflow size={17} />
          <div>
            <div className="flex items-center gap-2"><h1>Pipeline</h1></div>
            <p>Saved pipelines apply to future transcriptions.</p>
          </div>
        </div>
        <div className="pipeline-editor__actions">
          <label className="pipeline-scenario-select">
            <span className="sr-only">Choose saved pipeline</span>
            <select
              value={state.pipeline.id}
              onChange={(event) => {
                const selected = pipelines?.pipelines.find((pipeline) => pipeline.id === event.target.value)
                if (selected) onSelect(selected.id, selected.revision)
              }}
              disabled={editor.isDirty}
            >
              {pipelines?.pipelines.map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>{pipeline.name}{pipeline.valid ? '' : ' (needs repair)'}</option>
              ))}
            </select>
          </label>
          <Button variant="outline" size="sm" onClick={onCreate} disabled={editor.isDirty}><Plus size={14} /> New</Button>
          {editor.isDirty && <span className="pipeline-dirty">Unsaved changes</span>}
          {activeJobCount > 0 && (
            <Button variant="outline" size="sm" onClick={onCancelActiveJobs}><AlertCircle size={14} /> Cancel {activeJobCount} active</Button>
          )}
          <Button variant="ghost" size="sm" title="Undo" aria-label="Undo" disabled={!editor.canUndo} onClick={editor.undo}><Undo2 size={15} /></Button>
          <Button variant="ghost" size="sm" title="Redo" aria-label="Redo" disabled={!editor.canRedo} onClick={editor.redo}><Redo2 size={15} /></Button>
          <Button variant="outline" size="sm" disabled={!editor.isDirty} onClick={editor.revert}><RotateCcw size={14} /> Revert</Button>
          <Button size="sm" disabled={!editor.isDirty || editor.issues.length > 0} onClick={() => { void editor.save() }}><Save size={14} /> Save</Button>
        </div>
      </div>

      {state.recoverable && (
        <div className="pipeline-editor__notice"><AlertCircle size={14} />This pipeline needs repair before it can run. Install missing plugins or remove invalid nodes.</div>
      )}
      <div className="pipeline-editor__body">
        <div className="pipeline-editor__canvas-area">
          <div className="pipeline-canvas-toolbar">
            <Button size="sm" variant={paletteOpen ? 'outline' : 'default'} onClick={() => setPaletteOpen((open) => !open)}>
              <FolderPlus size={14} /> Add module
            </Button>
            <Button size="sm" variant="ghost" className="text-zinc-500 hover:text-red-300" onClick={() => {
              if (window.confirm('Clear this saved pipeline and restore direct pass-through?')) editor.clear()
            }}><Trash2 size={14} /> Clear flow</Button>
          </div>
          {paletteOpen && <PluginPalette plugins={plugins} onAdd={(plugin, position) => {
            editor.add(plugin, position)
            setPaletteOpen(false)
          }} onClose={() => setPaletteOpen(false)} />}
          <PipelineCanvas
            pipeline={editor.draft.pipeline}
            plugins={plugins}
            onAdd={(plugin, position) => {
              editor.add(plugin, position)
              setPaletteOpen(false)
            }}
            onMove={editor.move}
            onConnect={editor.connect}
            onRemoveNodes={editor.removeMany}
            onDisconnectMany={editor.disconnectMany}
            onSelectNode={(nodeId) => {
              editor.setSelectedNodeId(nodeId)
              setSelectedConnection(undefined)
            }}
            onSelectEdge={setSelectedConnection}
            selectedEdgeId={selectedConnection ? edgeId(selectedConnection) : undefined}
            selectedNodeId={editor.selectedNodeId}
          />
          {selectedConnection && (
            <div className="pipeline-edge-actions">
              <span>{endpointLabel(selectedConnection.from)} <ChevronRight size={13} /> {endpointLabel(selectedConnection.to)}</span>
              <Button size="sm" variant="outline" onClick={() => {
                editor.disconnect(selectedConnection.from, selectedConnection.to)
                setSelectedConnection(undefined)
              }}><Link2Off size={13} /> Disconnect</Button>
            </div>
          )}
          {editor.message && <div className="pipeline-message" role="status">{editor.message}</div>}
          <div className="pipeline-validation">
            <button type="button" onClick={() => setIssuesOpen((open) => !open)}>
              {editor.issues.length ? <AlertCircle size={14} /> : <span className="pipeline-validation__dot" />}
              {editor.issues.length ? `${editor.issues.length} issue${editor.issues.length === 1 ? '' : 's'}` : 'Draft valid'}
              {issuesOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {issuesOpen && editor.issues.length > 0 && (
              <div className="pipeline-validation__issues">
                {editor.issues.map((issue, index) => (
                  <button key={`${issue.message}-${index}`} type="button" onClick={() => {
                    editor.setSelectedNodeId(issue.nodeId)
                    setSelectedConnection(undefined)
                  }}><AlertCircle size={13} /> {issue.message}</button>
                ))}
              </div>
            )}
          </div>
          <section className="pipeline-destinations">
            <div className="flex items-center justify-between gap-2">
              <div><p className="pipeline-section-label">Additional outputs</p><p className="text-xs text-zinc-500">Published with the transcript; filename collisions receive a suffix.</p></div>
              <div className="flex gap-2">
                {outputTypes.map((type) => (
                  <Button key={type} size="sm" variant="outline" onClick={() => {
                    const source = type === TEXT_ARTIFACT_TYPE
                      ? artifactSources.find((candidate) => (
                        candidate.endpoint.nodeId === editor.draft.pipeline.output.nodeId &&
                        candidate.endpoint.portId === editor.draft.pipeline.output.portId
                      ))
                      : artifactSources.find((candidate) => candidate.type === type)
                    if (source) editor.addOutputDestination(type, source.endpoint)
                  }}>Add {type === TEXT_ARTIFACT_TYPE ? 'text' : 'map'} output</Button>
                ))}
              </div>
            </div>
            {editor.draft.pipeline.destinations.map((destination) => {
              const sources = artifactSources.filter((source) => source.type === destination.artifactType)
              return (
                <div className="pipeline-destination-details" key={destination.id}>
                  <div className="flex items-center justify-between gap-2"><strong>{destination.artifactType === TEXT_ARTIFACT_TYPE ? 'Text output' : 'Replacement map output'}</strong>
                    <Button variant="ghost" size="sm" className="text-red-300" onClick={() => editor.deleteDestination(destination.id)}>Remove</Button>
                  </div>
                  {destination.artifactType !== TEXT_ARTIFACT_TYPE && <div className="pipeline-notice"><AlertCircle size={14} />Replacement maps contain original values. Store and share them only with authorized people.</div>}
                  <label className="pipeline-field"><span>Source</span>
                    <select value={`${destination.from.nodeId}:${destination.from.portId}`} onChange={(event) => {
                      const source = sources.find((candidate) => `${candidate.endpoint.nodeId}:${candidate.endpoint.portId}` === event.target.value)
                      if (source) editor.editDestination(destination.id, { from: source.endpoint })
                    }}>
                      {sources.map((source) => <option key={`${source.endpoint.nodeId}:${source.endpoint.portId}`} value={`${source.endpoint.nodeId}:${source.endpoint.portId}`}>{source.label}</option>)}
                    </select>
                  </label>
                  <label className="pipeline-field"><span>Folder</span>
                    <select value={destination.folderMode} onChange={(event) => editor.editDestination(destination.id, {
                      folderMode: event.target.value === 'custom' ? 'custom' : 'settings',
                    })}><option value="settings">Settings output folder</option><option value="custom">Custom folder</option></select>
                  </label>
                  {destination.folderMode === 'custom' && <label className="pipeline-field"><span>Custom folder</span>
                    <div className="flex gap-2"><Input value={destination.customFolder ?? ''} onChange={(event) => editor.editDestination(destination.id, { customFolder: event.target.value })} />
                      <Button variant="outline" size="sm" onClick={() => {
                        window.electronAPI.openFolder().then((folder) => {
                          if (folder) editor.editDestination(destination.id, { customFolder: folder })
                        }).catch((error) => editor.setMessage(error instanceof Error ? error.message : 'Unable to choose a folder.'))
                      }}>Choose</Button>
                    </div>
                  </label>}
                  <label className="pipeline-field"><span>Filename</span><small>Use {'{sourceName}'} for the source filename. The {destination.serializer} extension is added when omitted.</small>
                    <Input value={destination.filenameTemplate} onChange={(event) => editor.editDestination(destination.id, { filenameTemplate: event.target.value })} />
                  </label>
                </div>
              )
            })}
          </section>
        </div>
        {selectedNode && (
          <PluginConfigPanel
            node={selectedNode}
            plugin={findPlugin(plugins, selectedNode)}
            onClose={() => editor.setSelectedNodeId(undefined)}
            onChange={(key, value) => editor.updateConfig(selectedNode.id, key, value)}
            onDelete={() => editor.remove(selectedNode.id)}
            connections={nodeConnections.map((connection) => ({
              label: `${endpointLabel(connection.from)} to ${endpointLabel(connection.to)}`,
              from: edgeId(connection),
              to: `${connection.to.nodeId}:${connection.to.portId}`,
              onDisconnect: () => editor.disconnect(connection.from, connection.to),
            }))}
          />
        )}
      </div>
    </main>
  )
}

export function PipelineEditor(props: PipelineEditorProps) {
  if (!props.active) return null
  if (!props.selectedState || !props.pipelines) {
    return <main className="pipeline-editor"><div className="pipeline-editor__notice">Loading saved pipelines…</div></main>
  }
  return <RuntimePipelineEditor key={`${props.selectedState.pipeline.id}:${props.selectedState.pipeline.revision}`} state={props.selectedState} {...props} />
}
