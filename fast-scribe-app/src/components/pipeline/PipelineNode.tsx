import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Braces, FileOutput, FileText, FolderOutput, Sparkles } from 'lucide-react'
import type { ArtifactType, PreviewPort } from '@/lib/pipeline-fixtures'

export interface PipelineNodeData extends Record<string, unknown> {
  label: string
  description: string
  badge?: 'Demo' | 'Example'
  inputs: PreviewPort[]
  outputs: PreviewPort[]
}

function ArtifactIcon({ type }: { type: ArtifactType }) {
  return type === 'fast-scribe/text' ? <FileText size={12} /> : <Braces size={12} />
}

function artifactLabel(type: ArtifactType): string {
  return type === 'fast-scribe/text' ? 'Text' : 'Replacement map'
}

function Port({ port, direction }: { port: PreviewPort; direction: 'input' | 'output' }) {
  const position = direction === 'input' ? Position.Left : Position.Right
  const className = port.type === 'fast-scribe/text' ? 'pipeline-handle--text' : 'pipeline-handle--artifact'

  return (
    <div className={`pipeline-port pipeline-port--${direction}`}>
      <Handle type={direction === 'input' ? 'target' : 'source'} position={position} id={port.id} className={className} />
      <span className="pipeline-port__type" title={port.type}>
        <ArtifactIcon type={port.type} />
        {artifactLabel(port.type)}
      </span>
    </div>
  )
}

export function PluginNode({ data, selected }: NodeProps) {
  const nodeData = data as PipelineNodeData
  return (
    <div className={`pipeline-node ${selected ? 'pipeline-node--selected' : ''}`}>
      <div className="pipeline-node__header">
        <span className="pipeline-node__glyph"><Sparkles size={15} /></span>
        <span className="pipeline-node__title">{nodeData.label}</span>
        {nodeData.badge && <span className="pipeline-badge">{nodeData.badge}</span>}
      </div>
      <p className="pipeline-node__description">{nodeData.description}</p>
      <div className="pipeline-node__ports">
        <div>{nodeData.inputs.map((port) => <Port key={port.id} port={port} direction="input" />)}</div>
        <div>{nodeData.outputs.map((port) => <Port key={port.id} port={port} direction="output" />)}</div>
      </div>
    </div>
  )
}

export function InputNode({ selected }: NodeProps) {
  return (
    <div className={`pipeline-node pipeline-node--endpoint ${selected ? 'pipeline-node--selected' : ''}`}>
      <div className="pipeline-node__header">
        <span className="pipeline-node__glyph pipeline-node__glyph--input"><FileText size={15} /></span>
        <span className="pipeline-node__title">Raw transcript</span>
      </div>
      <p className="pipeline-node__description">Original transcription, before any processing.</p>
      <div className="pipeline-node__ports pipeline-node__ports--single">
        <div className="ml-auto"><Port port={{ id: 'text', type: 'fast-scribe/text' }} direction="output" /></div>
      </div>
    </div>
  )
}

export function OutputNode({ selected }: NodeProps) {
  return (
    <div className={`pipeline-node pipeline-node--endpoint ${selected ? 'pipeline-node--selected' : ''}`}>
      <div className="pipeline-node__header">
        <span className="pipeline-node__glyph pipeline-node__glyph--output"><FileOutput size={15} /></span>
        <span className="pipeline-node__title">Final output</span>
      </div>
      <p className="pipeline-node__description">Text published with the transcription.</p>
      <div className="pipeline-node__ports pipeline-node__ports--single">
        <div><Port port={{ id: 'text', type: 'fast-scribe/text' }} direction="input" /></div>
      </div>
    </div>
  )
}

export function FileDestinationNode({ data, selected }: NodeProps) {
  const nodeData = data as PipelineNodeData
  const input = nodeData.inputs[0]
  return (
    <div className={`pipeline-node pipeline-node--destination ${selected ? 'pipeline-node--selected' : ''}`}>
      <div className="pipeline-node__header">
        <span className="pipeline-node__glyph pipeline-node__glyph--destination"><FolderOutput size={15} /></span>
        <span className="pipeline-node__title">Save to file</span>
        <span className="pipeline-badge">Preview</span>
      </div>
      <p className="pipeline-node__description">{nodeData.description}</p>
      <div className="pipeline-node__ports pipeline-node__ports--single">
        <div>{input && <Port port={input} direction="input" />}</div>
      </div>
    </div>
  )
}
