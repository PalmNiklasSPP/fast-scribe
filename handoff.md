# Fast Scribe plugin pipeline UI handoff

## Goal

Build a no-code, drag-and-drop pipeline editor for the plugin runtime already implemented in
`fast-scribe-app`. Think Power Automate or Salesforce Flow: users choose modules from a catalog,
place them on a canvas, connect typed ports, edit node settings, validate the graph, and save the
active pipeline used after transcription.

The backend foundation is complete. The visual editor is not implemented.

## Current implementation status

The current branch contains uncommitted plugin-system changes. Do not discard or replace them.

Implemented:

- Trusted plugins bundled with Fast Scribe.
- Versioned plugin manifests and typed input/output ports.
- A graph-shaped, persisted pipeline definition.
- Main-process pipeline validation and topological execution.
- Durable raw transcript and plugin artifact storage.
- Final processed text written atomically to the configured output folder.
- Safe Electron preload APIs for a future editor.
- Raw/final transcript switching and manual raw export.
- A placeholder anonymizer for development and UI testing.

Deferred:

- Functional pipeline editor wiring: the app now has a visual-only canvas preview. See
  `fast-scribe-app/docs/pipeline-ui-handoff.md` for the remaining persistence, pipeline
  selection, validation, and output-publication work.
- Third-party plugin installation or code loading.
- Plugin sandboxing, permissions, signing, and updates.
- Secret management for future LLM plugins.
- Parallel graph execution.
- Pipeline import/export and version migrations.
- Run-history UI and general secondary-artifact export.

Validation at handoff:

- `npm test`: 30 tests pass.
- `npm run build`: passes.
- `npm run lint`: passes with two pre-existing warnings in `FileList.tsx` and
  `components/ui/button.tsx`.

Run all npm scripts from `fast-scribe-app`.

## Architectural overview

```text
React editor
  |
  | window.electronAPI.listPlugins/getPipeline/validatePipeline/savePipeline
  v
Electron preload (safe IPC boundary)
  |
  v
Pipeline service (electron-store)
  |
  v
Pipeline validator and runner
  |
  +--> bundled plugin registry
  +--> typed artifact registry
  +--> durable run store under Electron userData
  |
  v
Final text published to output folder
```

Plugins run only in Electron's main process. Never send plugin implementation functions to the
renderer and do not add Node.js or filesystem access to the renderer.

## Important files

| File | Purpose |
|---|---|
| `fast-scribe-app/electron/plugins/contracts.cjs` | Artifact constants, artifact envelope, cancellation/errors, JSON/config validation, empty pipeline |
| `fast-scribe-app/electron/plugins/registry.cjs` | Artifact and plugin registries, manifest validation |
| `fast-scribe-app/electron/plugins/builtin-plugins.cjs` | Bundled plugin definitions; currently contains the placeholder anonymizer |
| `fast-scribe-app/electron/plugins/pipeline.cjs` | Pipeline graph validation and execution |
| `fast-scribe-app/electron/plugins/pipeline-service.cjs` | Persisted active pipeline in `electron-store` |
| `fast-scribe-app/electron/plugins/index.cjs` | Plugin-system startup registration |
| `fast-scribe-app/electron/run-store.cjs` | Durable run manifests and typed artifacts |
| `fast-scribe-app/electron/main.cjs` | IPC registration and transcription-to-pipeline integration |
| `fast-scribe-app/electron/preload.cjs` | Renderer-safe plugin, pipeline, run, and artifact APIs |
| `fast-scribe-app/src/lib/types.ts` | Renderer TypeScript contracts for all preload APIs |
| `fast-scribe-app/src/hooks/useTranscription.ts` | Pipeline-stage events reflected in file status |
| `fast-scribe-app/src/components/TranscriptPanel.tsx` | Raw/final transcript inspection |
| `fast-scribe-app/electron/plugins/pipeline.test.cjs` | Executable examples of valid pipelines |

## Renderer API available to the editor

The API is declared in `src/lib/types.ts`:

```ts
window.electronAPI.listPlugins(): Promise<PluginManifest[]>
window.electronAPI.getPipeline(): Promise<PipelineDefinition>
window.electronAPI.validatePipeline(
  pipeline: PipelineDefinition
): Promise<{ valid: boolean; errors: string[] }>
window.electronAPI.savePipeline(
  pipeline: PipelineDefinition
): Promise<PipelineDefinition>
```

Related inspection APIs:

```ts
window.electronAPI.listRuns(): Promise<PipelineRun[]>
window.electronAPI.getRun(runId: string): Promise<PipelineRun>
window.electronAPI.readRunArtifact(runId, artifactId): Promise<RunArtifact>
window.electronAPI.exportRunArtifact(runId, artifactId): Promise<SettingsFileResult>
```

Always call `validatePipeline` before saving. `savePipeline` validates again and rejects invalid
graphs.

## Pipeline document

Schema version 1:

```ts
interface PipelineDefinition {
  schemaVersion: 1
  nodes: Array<{
    id: string
    pluginId: string
    pluginVersion: string
    config: Record<string, unknown>
  }>
  connections: Array<{
    from: { nodeId: string; portId: string }
    to: { nodeId: string; portId: string }
  }>
  output: { nodeId: string; portId: string }
}
```

Example using the bundled placeholder plugin:

```json
{
  "schemaVersion": 1,
  "nodes": [
    {
      "id": "anonymize",
      "pluginId": "fast-scribe.placeholder-anonymizer",
      "pluginVersion": "1.0.0",
      "config": {}
    }
  ],
  "connections": [
    {
      "from": { "nodeId": "$input", "portId": "text" },
      "to": { "nodeId": "anonymize", "portId": "text" }
    }
  ],
  "output": { "nodeId": "anonymize", "portId": "text" }
}
```

### Special input and output behavior

- `$input:text` is the raw transcript and has type `fast-scribe/text`.
- `$input` is a reserved pseudo-node. Real node IDs cannot contain `$`.
- The final output is represented by `pipeline.output`, not by an entry in `connections`.
- The final output must resolve to `fast-scribe/text`.
- The empty identity pipeline has no nodes or connections and uses
  `{ nodeId: "$input", portId: "text" }` as its output.

For the UI, render fixed **Raw transcript** and **Final output** pseudo-nodes:

- Edges leaving Raw transcript become normal connections with source `$input:text`.
- The single edge entering Final output becomes `pipeline.output`.
- Do not serialize either pseudo-node in `pipeline.nodes`.
- Do not serialize the Final output edge in `pipeline.connections`.

## Plugin manifests

`listPlugins()` returns safe metadata such as:

```ts
interface PluginManifest {
  id: string
  version: string
  name: string
  description: string
  inputs: Array<{ id: string; type: string; required?: boolean }>
  outputs: Array<{ id: string; type: string; required?: boolean }>
  configSchema: Record<string, unknown>
}
```

Current plugin:

- ID: `fast-scribe.placeholder-anonymizer`
- Version: `1.0.0`
- Required input: `text`, type `fast-scribe/text`
- Outputs:
  - `text`, type `fast-scribe/text`
  - `map`, type `fast-scribe/anonymization-map`
- Config:
  - optional `marker: string`

It replaces digit groups with `[NUMBER_1]`, `[NUMBER_2]`, etc., prepends a marker, and emits the
replacement map. It is only a demonstrator and must not be described as real anonymization.

## Validation rules the UI should reflect

The main process is authoritative. The editor should prevent obvious invalid operations but still
use backend validation before save.

- Node IDs must be unique and match `[A-Za-z0-9][A-Za-z0-9_-]*`.
- Plugin ID and version must match an installed manifest exactly.
- Each required input must have one incoming connection.
- An input port cannot have multiple incoming connections.
- Connected port artifact types must match exactly.
- Connection sources must be `$input:text` or a declared plugin output.
- Connection targets must be declared plugin inputs.
- Cycles are rejected.
- Node configuration must match the manifest's configuration schema.
- The final output binding must exist and be `fast-scribe/text`.

The current configuration-schema validator supports:

- `object`, `array`, `string`, `number`, `integer`, and `boolean`
- `properties`, `required`, `items`, `enum`, and `additionalProperties: false`

It is a deliberately small JSON-Schema-like subset, not full JSON Schema. Do not build the form
renderer around unsupported keywords without first extending both the backend validator and
renderer types.

## Recommended editor UX

Use a full-height editor surface with three areas:

1. **Plugin palette** on the left
   - Search/filter the manifests from `listPlugins()`.
   - Show plugin name and description.
   - Drag a plugin onto the canvas or click to add it.
2. **Graph canvas** in the center
   - Fixed Raw transcript node on the left.
   - Plugin nodes with typed input and output handles.
   - Fixed Final output node on the right.
   - Pan, zoom, select, connect, delete, and keyboard support.
3. **Properties/validation panel** on the right
   - Selected plugin metadata and version.
   - Config fields generated from `configSchema`.
   - Graph validation errors.
   - Save/revert actions and dirty state.

Recommended top-level navigation:

- Add a **Pipeline** button beside **Settings** in `App.tsx`.
- Open the editor as a sibling panel/view to `SettingsPanel` and `TranscriptPanel`.
- Reuse the existing unsaved-change pattern before closing or switching views.
- Disable starting new transcriptions while a dirty pipeline draft is being edited, or clearly
  communicate that running jobs use the last saved pipeline.

There is no graph dependency installed. `@xyflow/react` is a reasonable fit for this interaction
model, but adding it is an implementation decision. If used, add it through npm from
`fast-scribe-app` and keep conversion between library nodes/edges and `PipelineDefinition` in a
small adapter rather than leaking library types into the Electron contracts.

## Recommended React structure

```text
src/
  components/
    pipeline/
      PipelineEditor.tsx
      PluginPalette.tsx
      PipelineCanvas.tsx
      PluginNode.tsx
      InputNode.tsx
      OutputNode.tsx
      PluginConfigPanel.tsx
      PipelineValidationPanel.tsx
  hooks/
    usePipelineEditor.ts
  lib/
    pipeline-editor.ts
```

Suggested responsibilities:

- `usePipelineEditor`
  - Load manifests and active pipeline together.
  - Own the draft and last-saved snapshots.
  - Track dirty/loading/saving/error states.
  - Debounce backend validation after graph/config changes.
  - Save only validated definitions.
  - Protect against stale async validation results.
- `pipeline-editor.ts`
  - Convert persisted definitions to visual nodes/edges.
  - Convert visual state back to a canonical definition.
  - Generate collision-free node IDs.
  - Check local type compatibility during connection attempts.
  - Keep graph-library types out of `src/lib/types.ts`.
- `PluginConfigPanel`
  - Render the supported schema subset.
  - Preserve valid falsy values such as `false`, `0`, and empty strings.
  - Show field-level errors where possible and backend validation errors otherwise.

## Persisting canvas layout

The execution schema currently does not type or require node positions. A visual editor needs
stable layout across restarts.

Recommended change:

```ts
interface PipelineNode {
  id: string
  pluginId: string
  pluginVersion: string
  config: Record<string, unknown>
  ui?: {
    position: { x: number; y: number }
  }
}
```

Then:

- Add the optional property to the renderer type.
- Validate that coordinates are finite numbers in the main process.
- Ignore `ui` during execution.
- Persist it with the pipeline.
- Give pseudo-nodes fixed or separately stored positions.

Do not depend on today's incidental behavior where unknown node fields pass validation. Make the UI
metadata explicit before relying on it.

## Save and validation flow

Recommended behavior:

1. Load `listPlugins()` and `getPipeline()`.
2. Convert the persisted pipeline into editor nodes and edges.
3. Apply immediate local checks while editing.
4. Debounce `validatePipeline(draft)` after meaningful changes.
5. Present every returned error; do not replace them with a generic invalid message.
6. Disable Save while validation is pending or invalid.
7. Call `savePipeline(draft)`.
8. Replace both the draft and saved snapshot with the returned value.
9. Show a clear success or explicit error toast.

Running transcription jobs capture the saved pipeline when the job starts. Editing or saving a
pipeline does not alter an already-running job.

## Data and execution behavior

- Pipeline execution is sequential in topological order.
- Every graph node executes, including branches not used by the final output, if its inputs are
  valid. The editor may warn about unused branches, but the backend currently allows them.
- Plugin output must exactly match declared ports and registered artifact types.
- A plugin exception or invalid output fails the run.
- Cancellation is passed to plugins through `AbortSignal`.
- Raw text is stored before plugin execution, so it survives plugin failure.
- Existing exported output files are preserved when transcription, processing, cancellation, or
  final publication fails.
- Run data is stored under `path.join(app.getPath("userData"), "pipeline-runs")`.
- Raw transcripts and artifacts are currently stored as JSON and are not encrypted.
- There is no retention/cleanup policy yet.

## UI-specific gaps worth addressing

These are not blockers for a basic editor but should be understood:

- Plugin manifests have no icon, category, color, documentation URL, or human-friendly port label.
  Add optional safe metadata if the palette needs richer presentation.
- Pipeline definitions have no title, description, or multiple saved workflows; there is one
  active pipeline.
- No migration exists for future pipeline schema versions.
- The persisted run list is not connected to a run-history screen.
- The in-memory transcription file list is not reconstructed from durable runs after restart.
- Secondary artifact types can be inspected through IPC but only text artifacts have an export
  flow.
- There is no event notifying other renderer views that the active pipeline changed.
- The browser-only Vite tab is not a faithful environment because `window.electronAPI` comes from
  Electron preload. Develop and verify the editor in the Electron desktop window.

## Suggested implementation order

1. Add explicit node UI-position metadata to the pipeline contract and tests.
2. Add the Pipeline navigation/view shell and unsaved-change protection.
3. Implement plugin/pipeline loading and draft state in `usePipelineEditor`.
4. Render fixed input/output nodes and saved plugin nodes.
5. Add palette-to-canvas node creation and deletion.
6. Add typed connections and output binding translation.
7. Add schema-driven configuration controls.
8. Add debounced backend validation and error presentation.
9. Add save/revert behavior and toasts.
10. Test an empty pipeline, one placeholder node, invalid connections, cycles, unsaved changes, and
    persistence after restarting the app.

## Acceptance criteria for the first UI milestone

- The user can open and close a Pipeline view from the app shell.
- The editor loads the saved graph and installed plugin catalog.
- The user can add, move, select, configure, connect, and remove a placeholder plugin node.
- Port handles visibly communicate artifact type and reject incompatible connections.
- Raw transcript and Final output pseudo-nodes serialize correctly.
- Invalid graphs show actionable errors and cannot be saved.
- A valid graph persists after app restart.
- An empty graph can be restored and behaves as pass-through.
- A saved placeholder graph visibly changes a new transcription.
- The resulting run still exposes both Raw and Final transcript views.
- Existing transcription, settings, updates, cancellation, and transcript editing remain intact.

## Useful commands

```powershell
Set-Location fast-scribe-app
npm run dev
npm test
npm run lint
npm run build
```

Use the Electron desktop window for manual testing. The direct runtime tests are in
`electron/plugins/pipeline.test.cjs`.
