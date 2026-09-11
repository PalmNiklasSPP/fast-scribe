# Pipeline UI handoff

## Current visual prototype

Fast Scribe now includes a **Pipeline** preview designed as a canvas-first editor. It is deliberately isolated from the active runtime pipeline:

- The selector switches between session-only examples: **Clean and summarize** and **Anonymize and save map**.
- The Workspace shows a concise summary of the selected preview and the effective Settings output-folder display.
- React Flow uses custom Raw transcript and Final transcript render types. Neither is a persisted plugin node.
- Plugin cards have typed output/input handles. The canvas updates node positions and edge geometry throughout a drag; position persistence occurs when the drag ends.
- Edges are selectable and can be disconnected from the canvas action or module inspector. Delete/Backspace remains available for selected graph elements.
- **Save preview** and **Revert** affect an in-memory snapshot only. Closing Fast Scribe resets previews.
- The placeholder anonymizer demonstrates both a text output and a replacement-map output. The map can feed a visual-only `Save map to file` destination; a text variant is also available.
- File destinations can show the current Settings output folder or a session-only custom path and filename. They never browse, validate, create, or write files.

The UI labels all demo behavior as preview-only. It does not call `listPlugins`, `getPipeline`, `validatePipeline`, `savePipeline`, output export APIs, or transcription-start APIs.

## Runtime integration work

### Pipeline collection and selection

The current main process stores one pipeline under `pluginPipeline`. The visual selector is not a runtime selector.

1. Define a versioned collection of named pipeline records with selected saved revision, created/updated metadata, and UI layout metadata.
2. Migrate the existing single graph without changing its identity-pipeline behavior.
3. Add atomic list/get/save/select APIs in `pipeline-service.cjs`, matching preload declarations and renderer types.
4. Resolve installed plugin IDs and versions on load. Missing/invalid plugins must surface an editable recovery state rather than a misleading fallback.
5. Notify renderers when the saved selected pipeline changes. Keep React Flow and other UI-library types out of IPC contracts.

### Graph and layout

1. Add explicit optional UI position metadata to runtime pipeline nodes and validate finite coordinates in the main process.
2. Keep `$input:text` and primary `pipeline.output` as execution concepts; never serialize the visual Raw transcript or Final transcript cards as plugin nodes or regular graph connections.
3. Preserve current authoritative validation for type matching, required inputs, cycles, plugin versions, and configuration. Renderer validation stays advisory.
4. Add stale-validation/save protection and native dirty-pipeline close/update protection separately from transcript dirty protection.

### Secondary output destinations

Primary output stays a text `pipeline.output`. Secondary exports need a separate, versioned terminal-binding model:

1. Define a typed destination binding with stable ID, producer node/port, expected artifact type, serializer/format, folder mode, optional custom folder, and filename/template.
2. Do not model destinations as installed plugin implementations. The `preview.*` modules are visual fixtures and must never reach runtime APIs.
3. Resolve folders in the main process in this order: destination custom folder, current Settings output folder, source-file folder.
4. Support text/TXT and anonymization-map/JSON serializers explicitly. Do not run a map through the current text-only export route.
5. Validate paths, tokens, traversal, unsafe names, collisions, overwrite policy, folder access, artifact type, and destination uniqueness in the main process.
6. Establish atomic-publication and partial-failure policy across the primary transcript and multiple secondary outputs. Record each publication result in the durable run manifest.
7. Decide whether a secondary output failure fails the run, how retries behave, and how existing destination files are preserved.

### Execution and inspection

1. Capture the selected saved pipeline revision and effective destination settings immutably before each run. Decide whether capture happens once per queued batch or separately per file; current code reads the pipeline per started file.
2. Do not let editing, saving, or selecting another preview alter an active run.
3. Preserve raw and final transcript behavior. Extend artifact inspection/export by registered artifact type and intended file format.
4. For future “follow active module” UI, retain run ID, saved pipeline revision, and node ID from plugin lifecycle events. Never use the selected draft as a proxy for execution state.

## Data handling

The placeholder anonymizer is not a privacy or compliance feature. Its replacement map contains original values. Raw transcripts and artifacts are currently stored unencrypted under Electron user data without a retention policy. Before wiring map destinations, define export warnings, access expectations, and retention/cleanup behavior.

## Verification to add with runtime work

- Migration and selected-revision persistence across restart.
- Graph layout and collection concurrency/stale-save scenarios.
- Primary text plus secondary map/text publication, inherited versus custom folders, filename collisions, cancellation, unwritable paths, and partial failures.
- Immutable run snapshot behavior while the UI is edited.
- Type-correct artifact inspection/export and raw/final transcript preservation.
- Native close/update prompts for dirty pipeline drafts.
- No Node.js or filesystem access added to the renderer.
