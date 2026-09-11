import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Braces, FileOutput, FileText, Sparkles } from 'lucide-react'
import type { ArtifactPort } from '@/lib/types'

export interface PipelineNodeData extends Record<string, unknown> {
  label: string
  description: string
  inputs: ArtifactPort[]
  outputs: ArtifactPort[]
}

function ArtifactIcon({ type }: { type: string }) {
  return type === 'fast-scribe/text' ? <FileText size={12} /> : <Braces size={12} />
}

function artifactLabel(type: string): string {
  return type === 'fast-scribe/text' ? 'Text' : type === 'fast-scribe/anonymization-map' ? 'Replacement map' : type
}

function Port({ port, direction }: { port: ArtifactPort; direction: 'input' | 'output' }) {
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
      <p className="pipeline-node__description">Original transcription, before processing.</p>
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
