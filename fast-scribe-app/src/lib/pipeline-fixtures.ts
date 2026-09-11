export type ArtifactType = 'fast-scribe/text' | 'fast-scribe/anonymization-map'

export interface PreviewPort {
  id: string
  type: ArtifactType
  required?: boolean
}

export interface PreviewField {
  id: string
  label: string
  description?: string
  type: 'string' | 'boolean' | 'enum'
  options?: string[]
}

export interface PreviewModule {
  id: string
  version: string
  name: string
  description: string
  kind: 'example' | 'demo' | 'destination'
  inputs: PreviewPort[]
  outputs: PreviewPort[]
  fields: PreviewField[]
  initialConfig: Record<string, unknown>
}

export interface PreviewEndpoint {
  nodeId: string
  portId: string
}

export interface PreviewNode {
  id: string
  moduleId: string
  config: Record<string, unknown>
}

export interface PreviewConnection {
  from: PreviewEndpoint
  to: PreviewEndpoint
}

export interface PreviewPosition {
  x: number
  y: number
}

export interface PreviewDraft {
  nodes: PreviewNode[]
  connections: PreviewConnection[]
  output?: PreviewEndpoint
  layout: Record<string, PreviewPosition>
}

export const INPUT_NODE_ID = '$input'
export const OUTPUT_NODE_ID = '$output'
export const TEXT_TYPE: ArtifactType = 'fast-scribe/text'

export const previewModules: PreviewModule[] = [
  {
    id: 'fast-scribe.placeholder-anonymizer',
    version: '1.0.0',
    name: 'Placeholder anonymizer',
    description: 'Example text transform with a replacement-map artifact. Not production anonymization.',
    kind: 'example',
    inputs: [{ id: 'text', type: TEXT_TYPE, required: true }],
    outputs: [
      { id: 'text', type: TEXT_TYPE, required: true },
      { id: 'map', type: 'fast-scribe/anonymization-map', required: true },
    ],
    fields: [
      {
        id: 'marker',
        label: 'Output marker',
        description: 'A label prepended to the transformed text.',
        type: 'string',
      },
    ],
    initialConfig: { marker: '[Placeholder anonymization applied]' },
  },
  {
    id: 'demo.clean-text',
    version: 'preview',
    name: 'Clean text',
    description: 'Demo module for illustrating a focused text-cleanup stage.',
    kind: 'demo',
    inputs: [{ id: 'text', type: TEXT_TYPE, required: true }],
    outputs: [{ id: 'text', type: TEXT_TYPE, required: true }],
    fields: [
      {
        id: 'preserveParagraphs',
        label: 'Preserve paragraphs',
        description: 'Keeps paragraph breaks while applying cleanup.',
        type: 'boolean',
      },
    ],
    initialConfig: { preserveParagraphs: true },
  },
  {
    id: 'demo.summarize',
    version: 'preview',
    name: 'Summarize',
    description: 'Demo module for illustrating a concise final synthesis.',
    kind: 'demo',
    inputs: [{ id: 'text', type: TEXT_TYPE, required: true }],
    outputs: [{ id: 'text', type: TEXT_TYPE, required: true }],
    fields: [
      {
        id: 'length',
        label: 'Summary length',
        description: 'The intended level of detail for this demo stage.',
        type: 'enum',
        options: ['Brief', 'Standard', 'Detailed'],
      },
    ],
    initialConfig: { length: 'Standard' },
  },
  {
    id: 'preview.save-text-file',
    version: 'preview',
    name: 'Save text to file',
    description: 'Preview destination for an additional transcript text file.',
    kind: 'destination',
    inputs: [{ id: 'text', type: TEXT_TYPE, required: true }],
    outputs: [],
    fields: [
      {
        id: 'folderMode',
        label: 'Folder',
        description: 'Use the current Settings output folder or a session-only override.',
        type: 'enum',
        options: ['Settings default', 'Custom folder'],
      },
      {
        id: 'folder',
        label: 'Custom folder',
        description: 'Preview only. This path is not checked or created.',
        type: 'string',
      },
      {
        id: 'filename',
        label: 'File name',
        description: 'A text extension is added when the pipeline is made functional.',
        type: 'string',
      },
    ],
    initialConfig: {
      folderMode: 'Settings default',
      folder: '',
      filename: 'processed-transcript',
    },
  },
  {
    id: 'preview.save-map-file',
    version: 'preview',
    name: 'Save map to file',
    description: 'Preview destination for a replacement map JSON file.',
    kind: 'destination',
    inputs: [{ id: 'map', type: 'fast-scribe/anonymization-map', required: true }],
    outputs: [],
    fields: [
      {
        id: 'folderMode',
        label: 'Folder',
        description: 'Use the current Settings output folder or a session-only override.',
        type: 'enum',
        options: ['Settings default', 'Custom folder'],
      },
      {
        id: 'folder',
        label: 'Custom folder',
        description: 'Preview only. This path is not checked or created.',
        type: 'string',
      },
      {
        id: 'filename',
        label: 'File name',
        description: 'A JSON extension is added when the pipeline is made functional.',
        type: 'string',
      },
    ],
    initialConfig: {
      folderMode: 'Settings default',
      folder: '',
      filename: 'replacement-map',
    },
  },
]

export function createPreviewDraft(): PreviewDraft {
  return {
    nodes: [
      { id: 'clean-text', moduleId: 'demo.clean-text', config: { preserveParagraphs: true } },
      { id: 'summarize', moduleId: 'demo.summarize', config: { length: 'Standard' } },
    ],
    connections: [
      {
        from: { nodeId: INPUT_NODE_ID, portId: 'text' },
        to: { nodeId: 'clean-text', portId: 'text' },
      },
      {
        from: { nodeId: 'clean-text', portId: 'text' },
        to: { nodeId: 'summarize', portId: 'text' },
      },
    ],
    output: { nodeId: 'summarize', portId: 'text' },
    layout: {
      [INPUT_NODE_ID]: { x: 40, y: 230 },
      'clean-text': { x: 300, y: 230 },
      summarize: { x: 570, y: 230 },
      [OUTPUT_NODE_ID]: { x: 840, y: 230 },
    },
  }
}

export function createAnonymizerPreviewDraft(): PreviewDraft {
  return {
    nodes: [
      {
        id: 'placeholder-anonymizer',
        moduleId: 'fast-scribe.placeholder-anonymizer',
        config: { marker: '[Placeholder anonymization applied]' },
      },
      {
        id: 'save-map-to-file',
        moduleId: 'preview.save-map-file',
        config: { folderMode: 'Settings default', folder: '', filename: 'replacement-map' },
      },
    ],
    connections: [
      {
        from: { nodeId: INPUT_NODE_ID, portId: 'text' },
        to: { nodeId: 'placeholder-anonymizer', portId: 'text' },
      },
      {
        from: { nodeId: 'placeholder-anonymizer', portId: 'map' },
        to: { nodeId: 'save-map-to-file', portId: 'map' },
      },
    ],
    output: { nodeId: 'placeholder-anonymizer', portId: 'text' },
    layout: {
      [INPUT_NODE_ID]: { x: 40, y: 260 },
      'placeholder-anonymizer': { x: 320, y: 260 },
      'save-map-to-file': { x: 640, y: 405 },
      [OUTPUT_NODE_ID]: { x: 660, y: 160 },
    },
  }
}

export const previewScenarios = [
  { id: 'clean-and-summarize', name: 'Clean and summarize', createDraft: createPreviewDraft },
  { id: 'anonymize-and-save-map', name: 'Anonymize and save map', createDraft: createAnonymizerPreviewDraft },
] as const
