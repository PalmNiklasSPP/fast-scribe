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
import { INPUT_NODE_ID, OUTPUT_NODE_ID, edgeId, findPlugin } from '@/lib/pipeline-editor'
import type { PipelineDefinition, PipelineEndpoint, PipelinePosition, PluginManifest } from '@/lib/types'
import { InputNode, OutputNode, PluginNode, type PipelineNodeData } from '@/components/pipeline/PipelineNode'

interface PipelineCanvasProps {
  pipeline: PipelineDefinition
  plugins: PluginManifest[]
  onAdd: (plugin: PluginManifest, position: PipelinePosition) => void
  onMove: (nodeId: string, position: PipelinePosition) => void
  onConnect: (from: PipelineEndpoint, to: PipelineEndpoint) => boolean
  onRemoveNodes: (nodeIds: string[]) => void
  onDisconnectMany: (connections: Array<{ from: PipelineEndpoint; to: PipelineEndpoint }>) => void
  onSelectNode: (nodeId?: string) => void
  onSelectEdge: (connection?: { from: PipelineEndpoint; to: PipelineEndpoint }) => void
  selectedEdgeId?: string
  selectedNodeId?: string
}

const nodeTypes = {
  rawTranscript: InputNode,
  finalTranscript: OutputNode,
  pluginModule: PluginNode,
}

function PipelineFlow({
  pipeline,
  plugins,
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
      position: { x: 40, y: 230 },
      data: { label: 'Raw transcript', description: '', inputs: [], outputs: [] },
      draggable: false,
      deletable: false,
    }
    const pluginNodes = pipeline.nodes.flatMap((pipelineNode) => {
      const plugin = findPlugin(plugins, pipelineNode)
      if (!plugin) return []
      return [{
        id: pipelineNode.id,
        type: 'pluginModule',
        position: pipeline.layout[pipelineNode.id] ?? { x: 300, y: 230 },
        selected: pipelineNode.id === selectedNodeId,
        data: {
          label: plugin.name,
          description: plugin.description,
          inputs: plugin.inputs,
          outputs: plugin.outputs,
        },
      } satisfies Node<PipelineNodeData>]
    })
    const output: Node<PipelineNodeData> = {
      id: OUTPUT_NODE_ID,
      type: 'finalTranscript',
      position: { x: 840, y: 230 },
      data: { label: 'Final output', description: '', inputs: [], outputs: [] },
      draggable: false,
      deletable: false,
    }
    return [input, ...pluginNodes, output]
  }, [pipeline, plugins, selectedNodeId])
  const displayNodes = liveNodes.length ? liveNodes : nodes

  const edges = useMemo<Edge[]>(() => {
    const graphEdges = pipeline.connections.map((connection) => ({
      id: edgeId(connection),
      source: connection.from.nodeId,
      sourceHandle: connection.from.portId,
      target: connection.to.nodeId,
      targetHandle: connection.to.portId,
      type: 'smoothstep',
      selected: selectedEdgeId === edgeId(connection),
      data: connection,
    }))
    graphEdges.push({
      id: edgeId({ from: pipeline.output, to: { nodeId: OUTPUT_NODE_ID, portId: 'text' } }),
      source: pipeline.output.nodeId,
      sourceHandle: pipeline.output.portId,
      target: OUTPUT_NODE_ID,
      targetHandle: 'text',
      type: 'smoothstep',
      selected: selectedEdgeId === edgeId({ from: pipeline.output, to: { nodeId: OUTPUT_NODE_ID, portId: 'text' } }),
      data: { from: pipeline.output, to: { nodeId: OUTPUT_NODE_ID, portId: 'text' } },
    })
    return graphEdges
  }, [pipeline.connections, pipeline.output, selectedEdgeId])

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

  return (
    <div
      className="pipeline-canvas"
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(event) => {
        event.preventDefault()
        const pluginId = event.dataTransfer.getData('application/fast-scribe-plugin')
        const plugin = plugins.find((candidate) => `${candidate.id}@${candidate.version}` === pluginId)
        if (plugin) onAdd(plugin, screenToFlowPosition({ x: event.clientX, y: event.clientY }))
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
          const connection = edge.data as { from?: PipelineEndpoint; to?: PipelineEndpoint }
          if (connection.from && connection.to) onSelectEdge(connection as { from: PipelineEndpoint; to: PipelineEndpoint })
        }}
        onPaneClick={() => {
          onSelectNode(undefined)
          onSelectEdge(undefined)
        }}
        onNodeDragStart={() => setLiveNodes(nodes)}
        onNodeDragStop={(_event, node) => {
          onMove(node.id, node.position)
          setLiveNodes([])
        }}
        onNodesDelete={(deleted) => onRemoveNodes(
          deleted.filter((node) => !node.id.startsWith('$')).map((node) => node.id),
        )}
        onEdgesDelete={(deleted) => {
          const connections = deleted.flatMap((edge) => {
            const connection = edge.data as { from?: PipelineEndpoint; to?: PipelineEndpoint }
            return connection.from && connection.to ? [connection as { from: PipelineEndpoint; to: PipelineEndpoint }] : []
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
  return <ReactFlowProvider><PipelineFlow {...props} /></ReactFlowProvider>
}
