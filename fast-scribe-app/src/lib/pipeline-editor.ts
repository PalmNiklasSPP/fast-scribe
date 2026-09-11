import type {
  ArtifactType,
  PreviewConnection,
  PreviewDraft,
  PreviewEndpoint,
  PreviewModule,
  PreviewNode,
  PreviewPosition,
} from '@/lib/pipeline-fixtures'
import {
  INPUT_NODE_ID,
  OUTPUT_NODE_ID,
  TEXT_TYPE,
  createPreviewDraft,
  previewModules,
} from '@/lib/pipeline-fixtures'

export interface PreviewIssue {
  message: string
  nodeId?: string
}

export function cloneDraft(draft: PreviewDraft): PreviewDraft {
  return structuredClone(draft)
}

export function findModule(moduleId: string): PreviewModule | undefined {
  return previewModules.find((moduleDefinition) => moduleDefinition.id === moduleId)
}

function portType(
  draft: PreviewDraft,
  endpoint: PreviewEndpoint,
  direction: 'input' | 'output',
): ArtifactType | undefined {
  if (endpoint.nodeId === INPUT_NODE_ID && direction === 'output' && endpoint.portId === 'text') {
    return TEXT_TYPE
  }
  if (endpoint.nodeId === OUTPUT_NODE_ID && direction === 'input' && endpoint.portId === 'text') {
    return TEXT_TYPE
  }
  const node = draft.nodes.find((candidate) => candidate.id === endpoint.nodeId)
  const moduleDefinition = node && findModule(node.moduleId)
  return moduleDefinition?.[direction === 'input' ? 'inputs' : 'outputs'].find(
    (port) => port.id === endpoint.portId,
  )?.type
}

export function createNodeId(draft: PreviewDraft, moduleDefinition: PreviewModule): string {
  const base = moduleDefinition.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'module'
  const nodeIds = new Set(draft.nodes.map((node) => node.id))
  if (!nodeIds.has(base)) return base
  let suffix = 2
  while (nodeIds.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

export function addModule(
  draft: PreviewDraft,
  moduleDefinition: PreviewModule,
  position: PreviewPosition,
): { draft: PreviewDraft; nodeId: string } {
  const next = cloneDraft(draft)
  const nodeId = createNodeId(next, moduleDefinition)
  const offset = next.nodes.length * 18
  next.nodes.push({
    id: nodeId,
    moduleId: moduleDefinition.id,
    config: structuredClone(moduleDefinition.initialConfig),
  })
  next.layout[nodeId] = { x: position.x + offset, y: position.y + offset }
  return { draft: next, nodeId }
}

export function setNodePosition(draft: PreviewDraft, nodeId: string, position: PreviewPosition): PreviewDraft {
  const next = cloneDraft(draft)
  if (next.layout[nodeId]) next.layout[nodeId] = position
  return next
}

export function setNodeConfig(
  draft: PreviewDraft,
  nodeId: string,
  key: string,
  value: unknown,
): PreviewDraft {
  const next = cloneDraft(draft)
  const node = next.nodes.find((candidate) => candidate.id === nodeId)
  if (node) node.config[key] = value
  return next
}

export function removeNode(draft: PreviewDraft, nodeId: string): PreviewDraft {
  const next = cloneDraft(draft)
  next.nodes = next.nodes.filter((node) => node.id !== nodeId)
  next.connections = next.connections.filter(
    (connection) => connection.from.nodeId !== nodeId && connection.to.nodeId !== nodeId,
  )
  if (next.output?.nodeId === nodeId) next.output = undefined
  delete next.layout[nodeId]
  return next
}

export function removeConnection(draft: PreviewDraft, connection: PreviewConnection): PreviewDraft {
  const next = cloneDraft(draft)
  if (connection.to.nodeId === OUTPUT_NODE_ID) {
    if (next.output && sameEndpoint(next.output, connection.from)) next.output = undefined
    return next
  }
  next.connections = next.connections.filter(
    (candidate) =>
      candidate.from.nodeId !== connection.from.nodeId ||
      candidate.from.portId !== connection.from.portId ||
      candidate.to.nodeId !== connection.to.nodeId ||
      candidate.to.portId !== connection.to.portId,
  )
  return next
}

function sameEndpoint(left: PreviewEndpoint, right: PreviewEndpoint): boolean {
  return left.nodeId === right.nodeId && left.portId === right.portId
}

function wouldCreateCycle(draft: PreviewDraft, from: PreviewEndpoint, to: PreviewEndpoint): boolean {
  if (from.nodeId === INPUT_NODE_ID || to.nodeId === OUTPUT_NODE_ID) return false
  const adjacency = new Map<string, string[]>()
  for (const node of draft.nodes) adjacency.set(node.id, [])
  for (const connection of draft.connections) {
    if (connection.from.nodeId !== INPUT_NODE_ID) {
      adjacency.get(connection.from.nodeId)?.push(connection.to.nodeId)
    }
  }
  adjacency.get(from.nodeId)?.push(to.nodeId)
  const pending = [to.nodeId]
  const visited = new Set<string>()
  while (pending.length) {
    const current = pending.pop()
    if (!current || visited.has(current)) continue
    if (current === from.nodeId) return true
    visited.add(current)
    pending.push(...(adjacency.get(current) ?? []))
  }
  return false
}

export function connectEndpoints(
  draft: PreviewDraft,
  from: PreviewEndpoint,
  to: PreviewEndpoint,
): { draft?: PreviewDraft; error?: string } {
  if (from.nodeId === OUTPUT_NODE_ID || to.nodeId === INPUT_NODE_ID) {
    return { error: 'Connections flow from an output into an input.' }
  }
  if (from.nodeId === to.nodeId) return { error: 'A module cannot connect to itself.' }
  const sourceType = portType(draft, from, 'output')
  const targetType = portType(draft, to, 'input')
  if (!sourceType || !targetType) return { error: 'Choose a declared input and output port.' }
  if (sourceType !== targetType) return { error: 'These ports use different artifact types.' }
  if (to.nodeId === OUTPUT_NODE_ID) {
    if (draft.output) {
      return { error: 'Final output already has a connection. Disconnect it before choosing another source.' }
    }
    return { draft: { ...cloneDraft(draft), output: from } }
  }
  if (draft.connections.some((connection) => sameEndpoint(connection.to, to))) {
    return { error: 'This input already has a connection. Disconnect it before connecting another source.' }
  }
  if (wouldCreateCycle(draft, from, to)) return { error: 'This connection would create a cycle.' }
  return { draft: { ...cloneDraft(draft), connections: [...draft.connections, { from, to }] } }
}

export function clearToPassThrough(): PreviewDraft {
  const draft = createPreviewDraft()
  return {
    nodes: [],
    connections: [],
    output: { nodeId: INPUT_NODE_ID, portId: 'text' },
    layout: {
      [INPUT_NODE_ID]: draft.layout[INPUT_NODE_ID],
      [OUTPUT_NODE_ID]: draft.layout[OUTPUT_NODE_ID],
    },
  }
}

export function validatePreviewDraft(draft: PreviewDraft): PreviewIssue[] {
  const issues: PreviewIssue[] = []
  const ids = new Set<string>()
  const connectedInputs = new Set<string>()
  for (const node of draft.nodes) {
    if (ids.has(node.id)) issues.push({ nodeId: node.id, message: `Module ID "${node.id}" is duplicated.` })
    ids.add(node.id)
    const moduleDefinition = findModule(node.moduleId)
    if (!moduleDefinition) {
      issues.push({ nodeId: node.id, message: 'This module is unavailable in the preview catalog.' })
      continue
    }
    for (const field of moduleDefinition.fields) {
      const value = node.config[field.id]
      if (field.type === 'string' && value !== undefined && typeof value !== 'string') {
        issues.push({ nodeId: node.id, message: `${field.label} must be text.` })
      }
      if (field.type === 'boolean' && typeof value !== 'boolean') {
        issues.push({ nodeId: node.id, message: `${field.label} must be on or off.` })
      }
      if (field.type === 'enum' && (!field.options?.includes(String(value)))) {
        issues.push({ nodeId: node.id, message: `${field.label} must use one of the listed options.` })
      }
    }
    for (const input of moduleDefinition.inputs) {
      if (input.required !== false && !draft.connections.some((connection) =>
        connection.to.nodeId === node.id && connection.to.portId === input.id,
      )) {
        issues.push({ nodeId: node.id, message: `Required input "${input.id}" is not connected.` })
      }
    }
  }
  for (const connection of draft.connections) {
    const targetKey = `${connection.to.nodeId}:${connection.to.portId}`
    if (connectedInputs.has(targetKey)) {
      issues.push({ nodeId: connection.to.nodeId, message: `Input "${connection.to.portId}" has more than one connection.` })
    }
    connectedInputs.add(targetKey)
    const sourceType = portType(draft, connection.from, 'output')
    const targetType = portType(draft, connection.to, 'input')
    if (!sourceType || !targetType) {
      issues.push({ nodeId: connection.to.nodeId, message: 'A connection references a missing port.' })
    } else if (sourceType !== targetType) {
      issues.push({ nodeId: connection.to.nodeId, message: 'A connection has incompatible artifact types.' })
    }
  }
  if (!draft.output) {
    issues.push({ message: 'Final output is not connected.' })
  } else if (portType(draft, draft.output, 'output') !== TEXT_TYPE) {
    issues.push({ message: 'Final output must be a text artifact.' })
  }
  const adjacency = new Map(draft.nodes.map((node) => [node.id, [] as string[]]))
  for (const connection of draft.connections) {
    if (connection.from.nodeId !== INPUT_NODE_ID && connection.to.nodeId !== OUTPUT_NODE_ID) {
      adjacency.get(connection.from.nodeId)?.push(connection.to.nodeId)
    }
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const hasCycle = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true
    if (visited.has(nodeId)) return false
    visiting.add(nodeId)
    for (const target of adjacency.get(nodeId) ?? []) {
      if (hasCycle(target)) return true
    }
    visiting.delete(nodeId)
    visited.add(nodeId)
    return false
  }
  if (draft.nodes.some((node) => hasCycle(node.id))) issues.push({ message: 'The graph contains a cycle.' })
  return issues
}

export function draftsMatch(left: PreviewDraft, right: PreviewDraft): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export type { PreviewNode }
