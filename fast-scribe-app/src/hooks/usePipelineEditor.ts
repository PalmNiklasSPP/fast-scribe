import { useCallback, useRef, useState } from 'react'
import {
  addDestination,
  addPlugin,
  clearPipeline,
  clonePipeline,
  connectEndpoints,
  pipelinesMatch,
  removeConnection,
  removeDestination,
  removeNode,
  setNodeConfig,
  setNodePosition,
  updateDestination,
  validatePipelineDraft,
} from '@/lib/pipeline-editor'
import type {
  PipelineDestination,
  PipelineEndpoint,
  PipelinePosition,
  PipelineRecord,
  PipelineState,
  PluginManifest,
} from '@/lib/types'

const HISTORY_LIMIT = 40

interface DraftSnapshot {
  name: string
  pipeline: PipelineRecord['pipeline']
}

function cloneSnapshot(snapshot: DraftSnapshot): DraftSnapshot {
  return { name: snapshot.name, pipeline: clonePipeline(snapshot.pipeline) }
}

export function usePipelineEditor(
  initialState: PipelineState,
  plugins: PluginManifest[],
  onDirtyChange: (dirty: boolean) => void,
  onSaved: (state: PipelineState) => void,
) {
  const initialSnapshot = {
    name: initialState.pipeline.name,
    pipeline: clonePipeline(initialState.pipeline.pipeline),
  }
  const [draft, setDraft] = useState<DraftSnapshot>(initialSnapshot)
  const [saved, setSaved] = useState<DraftSnapshot>(initialSnapshot)
  const [revision, setRevision] = useState(initialState.pipeline.revision)
  const [selectedNodeId, setSelectedNodeId] = useState<string>()
  const [message, setMessage] = useState('')
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false })
  const undoStack = useRef<DraftSnapshot[]>([])
  const redoStack = useRef<DraftSnapshot[]>([])
  const issues = validatePipelineDraft(draft.pipeline, plugins)
  const isDirty = draft.name !== saved.name || !pipelinesMatch(draft.pipeline, saved.pipeline)

  const syncHistoryState = useCallback(() => {
    setHistoryState({ canUndo: undoStack.current.length > 0, canRedo: redoStack.current.length > 0 })
  }, [])

  const updateDraft = useCallback((next: DraftSnapshot, saveHistory = true) => {
    const changed = next.name !== draft.name || !pipelinesMatch(next.pipeline, draft.pipeline)
    if (!changed) return
    if (saveHistory) {
      undoStack.current = [...undoStack.current.slice(-(HISTORY_LIMIT - 1)), cloneSnapshot(draft)]
      redoStack.current = []
      syncHistoryState()
    }
    setDraft(next)
    onDirtyChange(next.name !== saved.name || !pipelinesMatch(next.pipeline, saved.pipeline))
    setMessage('')
  }, [draft, onDirtyChange, saved, syncHistoryState])

  const updatePipeline = useCallback((nextPipeline: PipelineRecord['pipeline'], saveHistory = true) => {
    updateDraft({ ...draft, pipeline: nextPipeline }, saveHistory)
  }, [draft, updateDraft])

  const add = useCallback((plugin: PluginManifest, position: PipelinePosition) => {
    const result = addPlugin(draft.pipeline, plugin, position)
    updatePipeline(result.pipeline)
    setSelectedNodeId(result.nodeId)
  }, [draft.pipeline, updatePipeline])

  const move = useCallback((nodeId: string, position: PipelinePosition) => {
    updatePipeline(setNodePosition(draft.pipeline, nodeId, position))
  }, [draft.pipeline, updatePipeline])

  const updateConfig = useCallback((nodeId: string, key: string, value: unknown) => {
    updatePipeline(setNodeConfig(draft.pipeline, nodeId, key, value))
  }, [draft.pipeline, updatePipeline])

  const connect = useCallback((from: PipelineEndpoint, to: PipelineEndpoint) => {
    const result = connectEndpoints(draft.pipeline, plugins, from, to)
    if (result.error) {
      setMessage(result.error)
      return false
    }
    if (result.pipeline) updatePipeline(result.pipeline)
    return true
  }, [draft.pipeline, plugins, updatePipeline])

  const remove = useCallback((nodeId: string) => {
    updatePipeline(removeNode(draft.pipeline, nodeId))
    setSelectedNodeId((selected) => selected === nodeId ? undefined : selected)
  }, [draft.pipeline, updatePipeline])

  const removeMany = useCallback((nodeIds: string[]) => {
    const next = nodeIds.reduce((pipeline, nodeId) => removeNode(pipeline, nodeId), draft.pipeline)
    updatePipeline(next)
    setSelectedNodeId((selected) => selected && nodeIds.includes(selected) ? undefined : selected)
  }, [draft.pipeline, updatePipeline])

  const disconnect = useCallback((from: PipelineEndpoint, to: PipelineEndpoint) => {
    updatePipeline(removeConnection(draft.pipeline, { from, to }))
  }, [draft.pipeline, updatePipeline])

  const disconnectMany = useCallback((connections: Array<{ from: PipelineEndpoint; to: PipelineEndpoint }>) => {
    const next = connections.reduce((pipeline, connection) => removeConnection(pipeline, connection), draft.pipeline)
    updatePipeline(next)
  }, [draft.pipeline, updatePipeline])

  const addOutputDestination = useCallback((artifactType: string, from?: PipelineEndpoint) => {
    updatePipeline(addDestination(draft.pipeline, artifactType, from))
  }, [draft.pipeline, updatePipeline])

  const editDestination = useCallback((destinationId: string, updates: Partial<PipelineDestination>) => {
    updatePipeline(updateDestination(draft.pipeline, destinationId, updates))
  }, [draft.pipeline, updatePipeline])

  const deleteDestination = useCallback((destinationId: string) => {
    updatePipeline(removeDestination(draft.pipeline, destinationId))
  }, [draft.pipeline, updatePipeline])

  const clear = useCallback(() => {
    updatePipeline(clearPipeline(draft.pipeline))
    setSelectedNodeId(undefined)
  }, [draft.pipeline, updatePipeline])

  const save = useCallback(async () => {
    if (issues.length || !isDirty) return false
    if (
      draft.pipeline.destinations.some((destination) => destination.artifactType === 'fast-scribe/anonymization-map') &&
      !window.confirm('Replacement maps contain original values. Save this sensitive output destination?')
    ) {
      return false
    }
    try {
      const state = await window.electronAPI.savePipeline({
        id: initialState.pipeline.id,
        name: draft.name,
        pipeline: draft.pipeline,
        expectedRevision: revision,
      })
      const snapshot = { name: state.pipeline.name, pipeline: clonePipeline(state.pipeline.pipeline) }
      setDraft(snapshot)
      setSaved(cloneSnapshot(snapshot))
      setRevision(state.pipeline.revision)
      onDirtyChange(false)
      onSaved(state)
      setMessage('Pipeline saved and selected for future transcriptions.')
      return true
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save this pipeline.')
      return false
    }
  }, [draft, initialState.pipeline.id, isDirty, issues.length, onDirtyChange, onSaved, revision])

  const revert = useCallback(() => {
    updateDraft(cloneSnapshot(saved), false)
    onDirtyChange(false)
    setSelectedNodeId(undefined)
    setMessage('Pipeline restored to its saved version.')
  }, [onDirtyChange, saved, updateDraft])

  const undo = useCallback(() => {
    const previous = undoStack.current.at(-1)
    if (!previous) return
    undoStack.current = undoStack.current.slice(0, -1)
    redoStack.current = [...redoStack.current, cloneSnapshot(draft)]
    updateDraft(cloneSnapshot(previous), false)
    syncHistoryState()
  }, [draft, syncHistoryState, updateDraft])

  const redo = useCallback(() => {
    const next = redoStack.current.at(-1)
    if (!next) return
    redoStack.current = redoStack.current.slice(0, -1)
    undoStack.current = [...undoStack.current, cloneSnapshot(draft)]
    updateDraft(cloneSnapshot(next), false)
    syncHistoryState()
  }, [draft, syncHistoryState, updateDraft])

  return {
    draft,
    isDirty,
    issues,
    message,
    selectedNodeId,
    canUndo: historyState.canUndo,
    canRedo: historyState.canRedo,
    add,
    move,
    updateConfig,
    connect,
    remove,
    removeMany,
    disconnect,
    disconnectMany,
    addOutputDestination,
    editDestination,
    deleteDestination,
    clear,
    save,
    revert,
    undo,
    redo,
    setName: (name: string) => updateDraft({ ...draft, name }),
    setSelectedNodeId,
    setMessage,
  }
}
