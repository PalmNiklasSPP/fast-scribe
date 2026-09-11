import { useCallback, useRef, useState } from 'react'
import type { PreviewDraft, PreviewEndpoint, PreviewModule, PreviewPosition } from '@/lib/pipeline-fixtures'
import {
  addModule,
  clearToPassThrough,
  cloneDraft,
  connectEndpoints,
  draftsMatch,
  removeConnection,
  removeNode,
  setNodeConfig,
  setNodePosition,
  validatePreviewDraft,
} from '@/lib/pipeline-editor'
import { createPreviewDraft, previewScenarios } from '@/lib/pipeline-fixtures'

const HISTORY_LIMIT = 40

export function usePipelineEditor(onDirtyChange: (dirty: boolean) => void) {
  const [draft, setDraft] = useState<PreviewDraft>(createPreviewDraft)
  const [saved, setSaved] = useState<PreviewDraft>(createPreviewDraft)
  const [selectedNodeId, setSelectedNodeId] = useState<string>()
  const [message, setMessage] = useState('')
  const [scenarioId, setScenarioId] = useState<string>(previewScenarios[0].id)
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false })
  const undoStack = useRef<PreviewDraft[]>([])
  const redoStack = useRef<PreviewDraft[]>([])
  const issues = validatePreviewDraft(draft)
  const isDirty = !draftsMatch(draft, saved)

  const syncHistoryState = useCallback(() => {
    setHistoryState({ canUndo: undoStack.current.length > 0, canRedo: redoStack.current.length > 0 })
  }, [])

  const updateDraft = useCallback((next: PreviewDraft, saveHistory = true) => {
    if (draftsMatch(draft, next)) return
    if (saveHistory) {
      undoStack.current = [...undoStack.current.slice(-(HISTORY_LIMIT - 1)), cloneDraft(draft)]
      redoStack.current = []
      syncHistoryState()
    }
    setDraft(next)
    onDirtyChange(!draftsMatch(next, saved))
    setMessage('')
  }, [draft, onDirtyChange, saved, syncHistoryState])

  const add = useCallback((moduleDefinition: PreviewModule, position: PreviewPosition) => {
    const result = addModule(draft, moduleDefinition, position)
    updateDraft(result.draft)
    setSelectedNodeId(result.nodeId)
  }, [draft, updateDraft])

  const move = useCallback((nodeId: string, position: PreviewPosition) => {
    updateDraft(setNodePosition(draft, nodeId, position))
  }, [draft, updateDraft])

  const updateConfig = useCallback((nodeId: string, key: string, value: unknown) => {
    updateDraft(setNodeConfig(draft, nodeId, key, value))
  }, [draft, updateDraft])

  const connect = useCallback((from: PreviewEndpoint, to: PreviewEndpoint) => {
    const result = connectEndpoints(draft, from, to)
    if (result.error) {
      setMessage(result.error)
      return false
    }
    if (result.draft) updateDraft(result.draft)
    return true
  }, [draft, updateDraft])

  const remove = useCallback((nodeId: string) => {
    updateDraft(removeNode(draft, nodeId))
    setSelectedNodeId((selected) => selected === nodeId ? undefined : selected)
  }, [draft, updateDraft])

  const removeMany = useCallback((nodeIds: string[]) => {
    let next = draft
    for (const nodeId of nodeIds) next = removeNode(next, nodeId)
    updateDraft(next)
    setSelectedNodeId((selected) => selected && nodeIds.includes(selected) ? undefined : selected)
  }, [draft, updateDraft])

  const disconnect = useCallback((from: PreviewEndpoint, to: PreviewEndpoint) => {
    updateDraft(removeConnection(draft, { from, to }))
  }, [draft, updateDraft])

  const disconnectMany = useCallback((connections: Array<{ from: PreviewEndpoint; to: PreviewEndpoint }>) => {
    let next = draft
    for (const connection of connections) next = removeConnection(next, connection)
    updateDraft(next)
  }, [draft, updateDraft])

  const clear = useCallback(() => {
    updateDraft(clearToPassThrough())
    setSelectedNodeId(undefined)
  }, [updateDraft])

  const save = useCallback(() => {
    if (issues.length || !isDirty) return false
    const snapshot = cloneDraft(draft)
    setSaved(snapshot)
    onDirtyChange(false)
    setMessage('Preview saved for this session. Transcription is unchanged.')
    return true
  }, [draft, isDirty, issues.length, onDirtyChange])

  const revert = useCallback(() => {
    updateDraft(cloneDraft(saved), false)
    onDirtyChange(false)
    setSelectedNodeId(undefined)
    setMessage('Preview restored to the saved session version.')
  }, [onDirtyChange, saved, updateDraft])

  const undo = useCallback(() => {
    const previous = undoStack.current.at(-1)
    if (!previous) return
    undoStack.current = undoStack.current.slice(0, -1)
    redoStack.current = [...redoStack.current, cloneDraft(draft)]
    updateDraft(cloneDraft(previous), false)
    syncHistoryState()
  }, [draft, syncHistoryState, updateDraft])

  const redo = useCallback(() => {
    const next = redoStack.current.at(-1)
    if (!next) return
    redoStack.current = redoStack.current.slice(0, -1)
    undoStack.current = [...undoStack.current, cloneDraft(draft)]
    updateDraft(cloneDraft(next), false)
    syncHistoryState()
  }, [draft, syncHistoryState, updateDraft])

  const selectScenario = useCallback((nextScenarioId: string) => {
    const scenario = previewScenarios.find((candidate) => candidate.id === nextScenarioId)
    if (!scenario) return
    const nextDraft = scenario.createDraft()
    setScenarioId(scenario.id)
    setDraft(nextDraft)
    setSaved(cloneDraft(nextDraft))
    undoStack.current = []
    redoStack.current = []
    syncHistoryState()
    onDirtyChange(false)
    setSelectedNodeId(undefined)
    setMessage(`Opened ${scenario.name} preview.`)
  }, [onDirtyChange, syncHistoryState])

  return {
    draft,
    isDirty,
    issues,
    message,
    selectedNodeId,
    scenarioId,
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
    clear,
    save,
    revert,
    undo,
    redo,
    selectScenario,
    setSelectedNodeId,
    setMessage,
  }
}
