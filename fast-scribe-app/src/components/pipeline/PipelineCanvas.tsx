import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type Node,
  type OnConnect,
  type OnNodesChange,
  applyNodeChanges,
  useReactFlow,
} from '@xyflow/react'
import { useCallback, useMemo, useState } from 'react'
import type { PreviewConnection, PreviewDraft, PreviewEndpoint, PreviewModule, PreviewPosition } from '@/lib/pipeline-fixtures'
import { INPUT_NODE_ID, OUTPUT_NODE_ID, previewModules } from '@/lib/pipeline-fixtures'
import { findModule } from '@/lib/pipeline-editor'
import { FileDestinationNode, InputNode, OutputNode, PluginNode, type PipelineNodeData } from '@/components/pipeline/PipelineNode'

interface PipelineCanvasProps {
  draft: PreviewDraft
  onAdd: (moduleDefinition: PreviewModule, position: PreviewPosition) => void
  onMove: (nodeId: string, position: PreviewPosition) => void
  onConnect: (from: PreviewEndpoint, to: PreviewEndpoint) => boolean
  onRemoveNodes: (nodeIds: string[]) => void
  onDisconnectMany: (connections: PreviewConnection[]) => void
  onSelectNode: (nodeId?: string) => void
  onSelectEdge: (connection?: PreviewConnection) => void
  selectedEdgeId?: string
  selectedNodeId?: string
}

const nodeTypes = {
  rawTranscript: InputNode,
  finalTranscript: OutputNode,
  pluginModule: PluginNode,
  fileDestination: FileDestinationNode,
}

function PreviewFlow({
  draft,
  onAdd,
  onMove,
  onConnect,
  onRemoveNodes,
  onDisconnectMany,
  onSelectNode,
  onSelectEdge,
  selectedNodeId,
  selectedEdgeId,
}: PipelineCanvasProps) {
  const { screenToFlowPosition } = useReactFlow()
  const [liveNodes, setLiveNodes] = useState<Node<PipelineNodeData>[]>([])
  const nodes = useMemo<Node<PipelineNodeData>[]>(() => {
    const input: Node<PipelineNodeData> = {
      id: INPUT_NODE_ID,
      type: 'rawTranscript',
      position: draft.layout[INPUT_NODE_ID],
      data: { label: 'Raw transcript', description: '', inputs: [], outputs: [] },
      draggable: false,
      deletable: false,
      selected: false,
    }
    const plugins = draft.nodes.flatMap((draftNode) => {
      const moduleDefinition = findModule(draftNode.moduleId)
      if (!moduleDefinition) return []
      return [{
        id: draftNode.id,
        type: moduleDefinition.kind === 'destination' ? 'fileDestination' : 'pluginModule',
        position: draft.layout[draftNode.id] ?? { x: 360, y: 280 },
        selected: draftNode.id === selectedNodeId,
        data: {
          label: moduleDefinition.name,
          description: moduleDefinition.description,
          badge: moduleDefinition.kind === 'demo' ? 'Demo' : 'Example',
          inputs: moduleDefinition.inputs,
          outputs: moduleDefinition.outputs,
        },
      } satisfies Node<PipelineNodeData>]
    })
    const output: Node<PipelineNodeData> = {
      id: OUTPUT_NODE_ID,
      type: 'finalTranscript',
      position: draft.layout[OUTPUT_NODE_ID],
      data: { label: 'Final output', description: '', inputs: [], outputs: [] },
      draggable: false,
      deletable: false,
      selected: false,
    }
    return [input, ...plugins, output]
  }, [draft, selectedNodeId])
  const displayNodes = liveNodes.length ? liveNodes : nodes

  const edges = useMemo<Edge[]>(() => {
    const graphEdges = draft.connections.map((connection) => ({
      id: `${connection.from.nodeId}:${connection.from.portId}-${connection.to.nodeId}:${connection.to.portId}`,
      source: connection.from.nodeId,
      sourceHandle: connection.from.portId,
      target: connection.to.nodeId,
      targetHandle: connection.to.portId,
      type: 'smoothstep',
      animated: false,
      selected: selectedEdgeId === `${connection.from.nodeId}:${connection.from.portId}-${connection.to.nodeId}:${connection.to.portId}`,
      data: { from: connection.from, to: connection.to },
    }))
    if (draft.output) {
      graphEdges.push({
        id: `output-${draft.output.nodeId}:${draft.output.portId}`,
        source: draft.output.nodeId,
        sourceHandle: draft.output.portId,
        target: OUTPUT_NODE_ID,
        targetHandle: 'text',
        type: 'smoothstep',
        animated: false,
        selected: selectedEdgeId === `output-${draft.output.nodeId}:${draft.output.portId}`,
        data: { from: draft.output, to: { nodeId: OUTPUT_NODE_ID, portId: 'text' } },
      })
    }
    return graphEdges
  }, [draft.connections, draft.output, selectedEdgeId])

  const handleConnect: OnConnect = (connection: Connection) => {
    if (!connection.source || !connection.sourceHandle || !connection.target || !connection.targetHandle) return
    onConnect(
      { nodeId: connection.source, portId: connection.sourceHandle },
      { nodeId: connection.target, portId: connection.targetHandle },
    )
  }

  const handleNodesChange: OnNodesChange<Node<PipelineNodeData>> = useCallback((changes) => {
    if (!changes.some((change) => change.type === 'position')) return
    setLiveNodes((current) => applyNodeChanges(changes, current.length ? current : nodes))
  }, [nodes])

  const handleDragStart = useCallback(() => {
    setLiveNodes(nodes)
  }, [nodes])

  const handleDragStop = useCallback((_event: MouseEvent | TouchEvent, node: Node) => {
    onMove(node.id, node.position)
    setLiveNodes([])
  }, [onMove])

  return (
    <div
      className="pipeline-canvas"
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(event) => {
        event.preventDefault()
        const moduleId = event.dataTransfer.getData('application/fast-scribe-module')
        const moduleDefinition = previewModules.find((candidate) => candidate.id === moduleId)
        if (!moduleDefinition) return
        onAdd(moduleDefinition, screenToFlowPosition({ x: event.clientX, y: event.clientY }))
      }}
    >
      <ReactFlow
        nodes={displayNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.24, maxZoom: 1 }}
        minZoom={0.35}
        maxZoom={1.8}
        deleteKeyCode={['Backspace', 'Delete']}
        onConnect={handleConnect}
        onNodesChange={handleNodesChange}
        onNodeClick={(_event, node) => onSelectNode(node.id.startsWith('$') ? undefined : node.id)}
        onEdgeClick={(_event, edge) => {
          const endpoints = edge.data as { from?: PreviewEndpoint; to?: PreviewEndpoint }
          if (endpoints.from && endpoints.to) onSelectEdge({ from: endpoints.from, to: endpoints.to })
        }}
        onPaneClick={() => {
          onSelectNode(undefined)
          onSelectEdge(undefined)
        }}
        onNodeDragStart={handleDragStart}
        onNodeDragStop={handleDragStop}
        onNodesDelete={(deleted) => onRemoveNodes(
          deleted.filter((node) => !node.id.startsWith('$')).map((node) => node.id),
        )}
        onEdgesDelete={(deleted) => {
          const connections = deleted.flatMap((edge) => {
            const endpoints = edge.data as { from?: PreviewEndpoint; to?: PreviewEndpoint }
            return endpoints.from && endpoints.to ? [{ from: endpoints.from, to: endpoints.to }] : []
          })
          onDisconnectMany(connections)
        }}
        defaultEdgeOptions={{ type: 'smoothstep' }}
      >
        <Background color="#3f3f46" gap={20} size={1} />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>
    </div>
  )
}

export function PipelineCanvas(props: PipelineCanvasProps) {
  return (
    <ReactFlowProvider>
      <PreviewFlow {...props} />
    </ReactFlowProvider>
  )
}
