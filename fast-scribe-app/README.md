# Fast Scribe desktop app

Electron and React desktop client for bulk audio transcription.

## Secure settings transfer

Use **Settings > Export** to create a password-protected `.fss` settings file and
**Settings > Import** to use it on another device. The export includes the Azure endpoint,
model, API key, and transcription preferences, but leaves each device's output folder unchanged.
The API key is encrypted with the operating system's secure storage locally and is only decrypted
inside Electron's main process when a transcription request starts.

## Releases and automatic updates

Packaged builds check the public GitHub Releases feed when the app opens and every four
hours while it remains open. When a newer version is available, the app offers to download
it and restart into the update. Development builds never contact the update service.

To publish an update:

1. Follow the repository [release process](../RELEASING.md) to prepare, validate,
   merge, and tag the new version.

The `Build desktop installers` workflow creates the GitHub Release and uploads the installers,
blockmaps, and update metadata consumed by `electron-updater`. Each release must remain
published (not draft) and its tag must be newer than the installed app version. The workflow
fails before packaging if the tag and `package.json` version do not match.

macOS automatic updates require a code-signed and notarized build. Windows signing is also
recommended to avoid SmartScreen warnings.

## Built-in plugin pipelines

Fast Scribe has a main-process pipeline runtime for trusted plugins bundled with the app. The
active pipeline is an empty identity pipeline by default, so transcription output is unchanged
until a pipeline is configured. Pipeline definitions are persisted locally and exposed through
the preload API for a future drag-and-drop editor:

- `listPlugins()` returns safe plugin manifests, typed ports, and configuration schemas.
- `getPipeline()`, `validatePipeline()`, and `savePipeline()` manage the versioned graph.
- `listRuns()`, `getRun()`, and `readRunArtifact()` expose durable run history by opaque IDs.

Every run stores its raw transcript and typed plugin artifacts under Electron's application data
directory. Only the final text artifact is atomically published to the configured output folder.
The transcript panel can switch between final and raw text, and raw text can be exported manually.

### Adding a bundled plugin

Register artifact types in `electron/plugins/registry.cjs` and plugin definitions through
`electron/plugins/builtin-plugins.cjs`. A plugin manifest needs a stable namespaced ID, semantic
version, typed input/output ports, and an object configuration schema. Its asynchronous `execute`
function receives validated input values, configuration, and an `AbortSignal`, and must return
exactly the declared JSON-serializable outputs. Invalid output or an exception fails the run
without replacing an existing output file.

`fast-scribe.placeholder-anonymizer` is intentionally only an inspectable example. It adds a
marker, replaces digit groups, and emits a replacement-map artifact; it is not a privacy or
compliance feature.

Third-party installation, code isolation and signing, permissions, plugin secrets, parallel graph
execution, secondary-artifact export, pipeline import/export, and the visual editor are deferred.
