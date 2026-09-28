## Context

Fast Scribe runs its renderer with context isolation enabled and Node integration
disabled. `DropZone` currently reads the deprecated Electron-only `File.path`
augmentation and falls back to `File.name` when it is absent. In current
Electron versions that fallback is a relative filename, so the main-process
transcription handler receives an apparent absolute path only after it resolves
against the installed application's working directory.

Electron provides `webUtils.getPathForFile(file)` specifically to replace the
removed `File.path` property. With context isolation, Electron requires that
call to be made in preload and exposed through `contextBridge`.

## Goals / Non-Goals

**Goals:**

- Preserve the absolute filesystem path of supported audio files dropped into
  the application.
- Keep Node and Electron module access out of the React renderer.
- Avoid queueing browser-created or otherwise pathless `File` objects.
- Preserve the existing file-browser import flow.

**Non-Goals:**

- Change supported extensions, file deduplication, or transcription behavior.
- Add a renderer-accessible filesystem API beyond resolving a supplied `File`.
- Modify the main-process absolute-path validation.

## Decisions

### Resolve paths through a narrow preload bridge

The preload script will import `webUtils` and expose
`electronAPI.getPathForFile(file)`. `DropZone` will call that bridge for each
supported dropped file and queue only non-empty paths.

This follows Electron's supported migration from `File.path` while retaining
the existing context isolation and minimum renderer privilege.

**Alternatives considered:**

- Continue reading `(file as any).path`: rejected because the property is no
  longer provided in current Electron versions.
- Send file names to the main process and resolve them there: rejected because
  a name has no trustworthy source directory and could resolve to the app
  installation folder.
- Enable Node integration in the renderer: rejected because it weakens the
  application's security boundary for a single utility call.

### Treat an empty resolved path as non-importable

Electron returns an empty string for a JavaScript-created `File` that has no
backing on-disk file. The drop handler will omit those files rather than pass a
relative filename to transcription.

## Risks / Trade-offs

- [A malformed object reaches the preload resolver] → Electron throws instead
  of fabricating a path; only browser-provided dropped `File` objects are sent.
- [A pathless browser-created File is ignored without a distinct message] →
  this matches existing behavior for unsupported files and prevents a misleading
  later `ENOENT` error.
- [The bridge accepts `File` objects] → the exposed function performs one
  Electron utility call and returns only a path for that exact object; it does
  not provide arbitrary file-system access.

## Migration Plan

1. Update the preload bridge, renderer type declaration, and drop handler.
2. Add an isolated test for the resolver contract.
3. Run the focused test suite, lint, TypeScript/Vite build, and OpenSpec
   validation.
4. Ship the desktop build normally. Roll back by restoring the prior release;
   no persisted data or migrations are involved.

## Open Questions

None.
