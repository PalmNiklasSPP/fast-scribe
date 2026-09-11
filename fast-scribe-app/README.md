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
selected pipeline is an empty identity pipeline by default, so transcription output is unchanged
until a pipeline is configured. Named pipelines, their graph layouts, saved revisions, and the
current selection are persisted locally:

- `listPlugins()` returns safe plugin manifests, typed ports, and configuration schemas.
- `listPipelines()`, `getPipeline()`, `createPipeline()`, `savePipeline()`, and
  `selectPipeline()` manage revision-protected saved pipelines.
- `listRuns()`, `getRun()`, and `readRunArtifact()` expose durable run history by opaque IDs.

Every run stores its raw transcript and typed plugin artifacts under Electron's application data
directory. It captures the selected saved revision and output settings before processing begins,
so editor changes cannot alter an active run. The primary text artifact and any configured
secondary destinations are staged before publishing. If a secondary destination fails, the run
fails and Fast Scribe rolls back files it already published.

Secondary destinations support text/TXT and replacement-map/JSON outputs. A destination uses its
custom folder when configured, otherwise the Settings output folder, otherwise the source-file
folder. Filenames are literal except for `{sourceName}`; a suitable extension is added when
omitted, and existing filenames receive a numeric suffix rather than being overwritten.
Replacement maps contain original values, so Fast Scribe displays a warning before saving one.
They are not encrypted and this release does not apply automatic retention cleanup.

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

Open **Pipeline** in the desktop title bar to choose or create a saved pipeline, add installed
plugins, configure typed connections, and manage additional output destinations. The Raw
transcript and Final output cards are visual execution concepts only; neither is serialized as a
plugin. Unsaved pipeline drafts are protected independently from unsaved transcript edits when
closing or installing an update.

Third-party installation, code isolation and signing, permissions, plugin secrets, parallel graph
execution, and pipeline import/export remain deferred.
