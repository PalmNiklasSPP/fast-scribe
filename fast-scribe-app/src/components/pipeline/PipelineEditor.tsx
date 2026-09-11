import { AlertCircle, ChevronDown, ChevronRight, FolderPlus, Link2Off, RotateCcw, Save, Trash2, Undo2, Redo2, Workflow } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PipelineCanvas } from '@/components/pipeline/PipelineCanvas'
import { PluginPalette } from '@/components/pipeline/PluginPalette'
import { PluginConfigPanel } from '@/components/pipeline/PluginConfigPanel'
import { usePipelineEditor } from '@/hooks/usePipelineEditor'
import { previewScenarios, type PreviewConnection } from '@/lib/pipeline-fixtures'
import './pipeline.css'

interface PipelineEditorProps {
  active: boolean
  onDirtyChange: (dirty: boolean) => void
  activeJobCount: number
  onCancelActiveJobs: () => void
  outputDir: string
  onScenarioChange: (scenarioName: string) => void
}

function edgeId(connection: PreviewConnection): string {
  return connection.to.nodeId === '$output'
    ? `output-${connection.from.nodeId}:${connection.from.portId}`
    : `${connection.from.nodeId}:${connection.from.portId}-${connection.to.nodeId}:${connection.to.portId}`
}

function endpointLabel(endpoint: { nodeId: string; portId: string }): string {
  if (endpoint.nodeId === '$input') return 'Raw transcript'
  if (endpoint.nodeId === '$output') return 'Final transcript'
  return endpoint.portId
}

export function PipelineEditor({ active, onDirtyChange, activeJobCount, onCancelActiveJobs, outputDir, onScenarioChange }: PipelineEditorProps) {
  const editor = usePipelineEditor(onDirtyChange)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [issuesOpen, setIssuesOpen] = useState(false)
  const [selectedConnection, setSelectedConnection] = useState<PreviewConnection>()
  const selectedNode = editor.draft.nodes.find((node) => node.id === editor.selectedNodeId)
  const allConnections = [
    ...editor.draft.connections,
    ...(editor.draft.output ? [{ from: editor.draft.output, to: { nodeId: '$output', portId: 'text' } }] : []),
  ]
  const nodeConnections = selectedNode
    ? allConnections.filter((connection) => connection.from.nodeId === selectedNode.id || connection.to.nodeId === selectedNode.id)
    : []

  if (!active) return null

  return (
    <main className="pipeline-editor" aria-label="Pipeline preview editor">
      <div className="pipeline-editor__header">
        <div className="pipeline-editor__title">
          <Workflow size={17} />
          <div>
            <div className="flex items-center gap-2">
              <h1>Pipeline</h1>
              <span className="pipeline-badge pipeline-badge--preview">Preview</span>
            </div>
            <p>Session-only composition. It does not affect transcription.</p>
          </div>
        </div>
        <div className="pipeline-editor__actions">
            <label className="pipeline-scenario-select">
              <span className="sr-only">Choose pipeline preview</span>
              <select
                value={editor.scenarioId}
                onChange={(event) => {
                  editor.selectScenario(event.target.value)
                  const scenario = previewScenarios.find((candidate) => candidate.id === event.target.value)
                  if (scenario) onScenarioChange(scenario.name)
                  setSelectedConnection(undefined)
                }}
              >
                {previewScenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}
              </select>
            </label>
          {editor.isDirty && <span className="pipeline-dirty">Unsaved preview</span>}
          {activeJobCount > 0 && (
            <Button variant="outline" size="sm" onClick={onCancelActiveJobs}>
              <AlertCircle size={14} /> Cancel {activeJobCount} active
            </Button>
          )}
          <Button variant="ghost" size="sm" title="Undo" aria-label="Undo" disabled={!editor.canUndo} onClick={editor.undo}>
            <Undo2 size={15} />
          </Button>
          <Button variant="ghost" size="sm" title="Redo" aria-label="Redo" disabled={!editor.canRedo} onClick={editor.redo}>
            <Redo2 size={15} />
          </Button>
          <Button variant="outline" size="sm" disabled={!editor.isDirty} onClick={editor.revert}>
            <RotateCcw size={14} /> Revert
          </Button>
          <Button size="sm" disabled={!editor.isDirty || editor.issues.length > 0} onClick={editor.save}>
            <Save size={14} /> Save preview
          </Button>
        </div>
      </div>

      <div className="pipeline-editor__notice">
        <AlertCircle size={14} />
        Demo modules and saved previews reset when Fast Scribe closes. The active runtime pipeline is never read or changed here.
      </div>

      <div className="pipeline-editor__body">
        <div className="pipeline-editor__canvas-area">
          <div className="pipeline-canvas-toolbar">
            <Button size="sm" variant={paletteOpen ? 'outline' : 'default'} onClick={() => setPaletteOpen((open) => !open)}>
              <FolderPlus size={14} /> Add module
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-zinc-500 hover:text-red-300"
              onClick={() => {
                if (window.confirm('Clear this preview flow and restore a direct pass-through?')) editor.clear()
              }}
            >
              <Trash2 size={14} /> Clear flow
            </Button>
          </div>
          {paletteOpen && (
            <PluginPalette
              onAdd={(moduleDefinition, position) => {
                editor.add(moduleDefinition, position)
                setPaletteOpen(false)
              }}
              onClose={() => setPaletteOpen(false)}
            />
          )}
          <PipelineCanvas
            draft={editor.draft}
            onAdd={(moduleDefinition, position) => {
              editor.add(moduleDefinition, position)
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
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  editor.disconnect(selectedConnection.from, selectedConnection.to)
                  setSelectedConnection(undefined)
                }}
              >
                <Link2Off size={13} /> Disconnect
              </Button>
            </div>
          )}
          {editor.message && <div className="pipeline-message" role="status">{editor.message}</div>}
          <div className="pipeline-validation">
            <button type="button" onClick={() => setIssuesOpen((open) => !open)}>
              {editor.issues.length ? <AlertCircle size={14} /> : <span className="pipeline-validation__dot" />}
              {editor.issues.length ? `${editor.issues.length} issue${editor.issues.length === 1 ? '' : 's'}` : 'Preview valid'}
              {issuesOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {issuesOpen && editor.issues.length > 0 && (
              <div className="pipeline-validation__issues">
                {editor.issues.map((issue, index) => (
                  <button
                    key={`${issue.message}-${index}`}
                    type="button"
                    onClick={() => {
                      editor.setSelectedNodeId(issue.nodeId)
                      setSelectedConnection(undefined)
                    }}
                  >
                    <AlertCircle size={13} /> {issue.message}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {selectedNode && (
          <PluginConfigPanel
            node={selectedNode}
            onClose={() => editor.setSelectedNodeId(undefined)}
            onChange={(key, value) => editor.updateConfig(selectedNode.id, key, value)}
            onDelete={() => editor.remove(selectedNode.id)}
            outputDir={outputDir}
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
