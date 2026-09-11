import type {
  PipelineDefinition,
  PipelineDestination,
  PipelineEndpoint,
  PipelineNode,
  PipelinePosition,
  PluginManifest,
} from '@/lib/types'

export const INPUT_NODE_ID = '$input'
export const OUTPUT_NODE_ID = '$output'
export const TEXT_ARTIFACT_TYPE = 'fast-scribe/text'

export interface PipelineIssue {
  message: string
  nodeId?: string
}

export function clonePipeline(pipeline: PipelineDefinition): PipelineDefinition {
  return structuredClone(pipeline)
}

export function edgeId(connection: { from: PipelineEndpoint; to: PipelineEndpoint }): string {
  return connection.to.nodeId === OUTPUT_NODE_ID
    ? `output-${connection.from.nodeId}:${connection.from.portId}`
    : `${connection.from.nodeId}:${connection.from.portId}-${connection.to.nodeId}:${connection.to.portId}`
}

export function findPlugin(plugins: PluginManifest[], node: PipelineNode): PluginManifest | undefined {
  return plugins.find((plugin) => plugin.id === node.pluginId && plugin.version === node.pluginVersion)
}

function endpointType(
  pipeline: PipelineDefinition,
  plugins: PluginManifest[],
  endpoint: PipelineEndpoint,
  direction: 'input' | 'output',
): string | undefined {
  if (endpoint.nodeId === INPUT_NODE_ID && direction === 'output' && endpoint.portId === 'text') {
    return TEXT_ARTIFACT_TYPE
  }
  if (endpoint.nodeId === OUTPUT_NODE_ID && direction === 'input' && endpoint.portId === 'text') {
    return TEXT_ARTIFACT_TYPE
  }
  const node = pipeline.nodes.find((candidate) => candidate.id === endpoint.nodeId)
  const plugin = node && findPlugin(plugins, node)
  return plugin?.[direction === 'input' ? 'inputs' : 'outputs'].find(
    (port) => port.id === endpoint.portId,
  )?.type
}

function sameEndpoint(left: PipelineEndpoint, right: PipelineEndpoint): boolean {
  return left.nodeId === right.nodeId && left.portId === right.portId
}

function wouldCreateCycle(
  pipeline: PipelineDefinition,
  from: PipelineEndpoint,
  to: PipelineEndpoint,
): boolean {
  if (from.nodeId === INPUT_NODE_ID || to.nodeId === OUTPUT_NODE_ID) return false
  const adjacency = new Map(pipeline.nodes.map((node) => [node.id, [] as string[]]))
  for (const connection of pipeline.connections) {
    if (connection.from.nodeId !== INPUT_NODE_ID) {
      adjacency.get(connection.from.nodeId)?.push(connection.to.nodeId)
    }
  }
  adjacency.get(from.nodeId)?.push(to.nodeId)
  const pending = [to.nodeId]
  const visited = new Set<string>()
  while (pending.length > 0) {
    const current = pending.pop()
    if (!current || visited.has(current)) continue
    if (current === from.nodeId) return true
    visited.add(current)
    pending.push(...(adjacency.get(current) ?? []))
  }
  return false
}

export function connectEndpoints(
  pipeline: PipelineDefinition,
  plugins: PluginManifest[],
  from: PipelineEndpoint,
  to: PipelineEndpoint,
): { pipeline?: PipelineDefinition; error?: string } {
  if (from.nodeId === OUTPUT_NODE_ID || to.nodeId === INPUT_NODE_ID) {
    return { error: 'Connections flow from an output into an input.' }
  }
  if (from.nodeId === to.nodeId) return { error: 'A module cannot connect to itself.' }
  const sourceType = endpointType(pipeline, plugins, from, 'output')
  const targetType = endpointType(pipeline, plugins, to, 'input')
  if (!sourceType || !targetType) return { error: 'Choose declared plugin ports.' }
  if (sourceType !== targetType) return { error: 'These ports use different artifact types.' }
  if (to.nodeId === OUTPUT_NODE_ID) {
    return { pipeline: { ...clonePipeline(pipeline), output: from } }
  }
  if (pipeline.connections.some((connection) => sameEndpoint(connection.to, to))) {
    return { error: 'This input already has a connection.' }
  }
  if (wouldCreateCycle(pipeline, from, to)) return { error: 'This connection would create a cycle.' }
  return {
    pipeline: {
      ...clonePipeline(pipeline),
      connections: [...pipeline.connections, { from, to }],
    },
  }
}

export function createNodeId(pipeline: PipelineDefinition, plugin: PluginManifest): string {
  const base = plugin.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'module'
  const ids = new Set(pipeline.nodes.map((node) => node.id))
  if (!ids.has(base)) return base
  let suffix = 2
  while (ids.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

export function addPlugin(
  pipeline: PipelineDefinition,
  plugin: PluginManifest,
  position: PipelinePosition,
): { pipeline: PipelineDefinition; nodeId: string } {
  const next = clonePipeline(pipeline)
  const nodeId = createNodeId(next, plugin)
  next.nodes.push({ id: nodeId, pluginId: plugin.id, pluginVersion: plugin.version, config: {} })
  next.layout[nodeId] = position
  return { pipeline: next, nodeId }
}

export function removeNode(pipeline: PipelineDefinition, nodeId: string): PipelineDefinition {
  const next = clonePipeline(pipeline)
  next.nodes = next.nodes.filter((node) => node.id !== nodeId)
  next.connections = next.connections.filter(
    (connection) => connection.from.nodeId !== nodeId && connection.to.nodeId !== nodeId,
  )
  next.destinations = next.destinations.filter((destination) => destination.from.nodeId !== nodeId)
  if (next.output.nodeId === nodeId) {
    next.output = { nodeId: INPUT_NODE_ID, portId: 'text' }
  }
  delete next.layout[nodeId]
  return next
}

export function removeConnection(
  pipeline: PipelineDefinition,
  connection: { from: PipelineEndpoint; to: PipelineEndpoint },
): PipelineDefinition {
  const next = clonePipeline(pipeline)
  if (connection.to.nodeId === OUTPUT_NODE_ID) {
    if (sameEndpoint(next.output, connection.from)) {
      next.output = { nodeId: INPUT_NODE_ID, portId: 'text' }
    }
    return next
  }
  next.connections = next.connections.filter((candidate) => (
    !sameEndpoint(candidate.from, connection.from) || !sameEndpoint(candidate.to, connection.to)
  ))
  return next
}

export function setNodePosition(
  pipeline: PipelineDefinition,
  nodeId: string,
  position: PipelinePosition,
): PipelineDefinition {
  const next = clonePipeline(pipeline)
  if (next.nodes.some((node) => node.id === nodeId)) next.layout[nodeId] = position
  return next
}

export function setNodeConfig(
  pipeline: PipelineDefinition,
  nodeId: string,
  key: string,
  value: unknown,
): PipelineDefinition {
  const next = clonePipeline(pipeline)
  const node = next.nodes.find((candidate) => candidate.id === nodeId)
  if (node) node.config[key] = value
  return next
}

export function addDestination(
  pipeline: PipelineDefinition,
  artifactType: string,
  from?: PipelineEndpoint,
): PipelineDefinition {
  const next = clonePipeline(pipeline)
  let suffix = 1
  let id = 'destination'
  const ids = new Set(next.destinations.map((destination) => destination.id))
  while (ids.has(id)) {
    suffix += 1
    id = `destination-${suffix}`
  }
  next.destinations.push({
    id,
    from: from ?? (artifactType === TEXT_ARTIFACT_TYPE
      ? next.output
      : { nodeId: INPUT_NODE_ID, portId: 'text' }),
    artifactType,
    serializer: artifactType === TEXT_ARTIFACT_TYPE ? 'txt' : 'json',
    folderMode: 'settings',
    filenameTemplate: artifactType === TEXT_ARTIFACT_TYPE ? '{sourceName}-processed' : '{sourceName}-map',
  })
  return next
}

export function updateDestination(
  pipeline: PipelineDefinition,
  destinationId: string,
  updates: Partial<PipelineDestination>,
): PipelineDefinition {
  const next = clonePipeline(pipeline)
  const destination = next.destinations.find((candidate) => candidate.id === destinationId)
  if (destination) Object.assign(destination, updates)
  return next
}

export function removeDestination(pipeline: PipelineDefinition, destinationId: string): PipelineDefinition {
  return {
    ...clonePipeline(pipeline),
    destinations: pipeline.destinations.filter((destination) => destination.id !== destinationId),
  }
}

export function clearPipeline(pipeline: PipelineDefinition): PipelineDefinition {
  return {
    ...clonePipeline(pipeline),
    nodes: [],
    connections: [],
    output: { nodeId: INPUT_NODE_ID, portId: 'text' },
    layout: {},
    destinations: [],
  }
}

export function validatePipelineDraft(
  pipeline: PipelineDefinition,
  plugins: PluginManifest[],
): PipelineIssue[] {
  const issues: PipelineIssue[] = []
  const ids = new Set<string>()
  const connectedInputs = new Set<string>()
  for (const node of pipeline.nodes) {
    if (ids.has(node.id)) issues.push({ nodeId: node.id, message: `Module ID "${node.id}" is duplicated.` })
    ids.add(node.id)
    const plugin = findPlugin(plugins, node)
    if (!plugin) {
      issues.push({ nodeId: node.id, message: `Plugin ${node.pluginId}@${node.pluginVersion} is unavailable.` })
      continue
    }
    for (const input of plugin.inputs) {
      if (input.required !== false && !pipeline.connections.some((connection) => (
        connection.to.nodeId === node.id && connection.to.portId === input.id
      ))) {
        issues.push({ nodeId: node.id, message: `Required input "${input.id}" is not connected.` })
      }
    }
  }
  for (const connection of pipeline.connections) {
    const targetKey = `${connection.to.nodeId}:${connection.to.portId}`
    if (connectedInputs.has(targetKey)) {
      issues.push({ nodeId: connection.to.nodeId, message: `Input "${connection.to.portId}" has more than one connection.` })
    }
    connectedInputs.add(targetKey)
    const sourceType = endpointType(pipeline, plugins, connection.from, 'output')
    const targetType = endpointType(pipeline, plugins, connection.to, 'input')
    if (!sourceType || !targetType) {
      issues.push({ nodeId: connection.to.nodeId, message: 'A connection references a missing port.' })
    } else if (sourceType !== targetType) {
      issues.push({ nodeId: connection.to.nodeId, message: 'A connection has incompatible artifact types.' })
    }
  }
  if (endpointType(pipeline, plugins, pipeline.output, 'output') !== TEXT_ARTIFACT_TYPE) {
    issues.push({ message: 'Final output must be a text artifact.' })
  }
  for (const destination of pipeline.destinations) {
    const sourceType = endpointType(pipeline, plugins, destination.from, 'output')
    if (sourceType !== destination.artifactType) {
      issues.push({ message: `Destination "${destination.id}" needs a ${destination.artifactType} source.` })
    }
  }
  return issues
}

export function pipelinesMatch(left: PipelineDefinition, right: PipelineDefinition): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
