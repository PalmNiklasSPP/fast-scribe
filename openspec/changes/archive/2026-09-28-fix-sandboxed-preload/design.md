## Context

Electron's sandboxed preload runtime provides Electron's built-in modules but
does not resolve relative CommonJS module imports. The current preload imports
`./dropped-file-paths.cjs`, so it aborts before `contextBridge.exposeInMainWorld`
can define `window.electronAPI`. The React application subsequently dereferences
that undefined API during initial configuration loading and renders no content.

## Goals / Non-Goals

**Goals:**

- Restore reliable preload initialization in development and packaged Electron.
- Retain the supported `webUtils.getPathForFile` implementation for dropped
  audio files.
- Keep the bridge's scope limited to resolving the supplied File object.

**Non-Goals:**

- Change the renderer API's name or behavior.
- Expand renderer filesystem privileges.
- Alter audio file selection or transcription behavior.

## Decisions

### Define the resolver directly in preload

The exposed `getPathForFile` bridge will call
`webUtils.getPathForFile(file)` directly. This uses an Electron-built-in
already available to the sandboxed preload and avoids local module loading.

**Alternative considered:** configure the preload as unsandboxed. Rejected
because it broadens its runtime privileges merely to support a small helper.

### Test the preload-compatible contract without a local helper

The helper module and its unit test will be removed. Existing TypeScript
compilation validates the renderer API declaration, and the development startup
smoke test verifies that preload completion makes `window.electronAPI`
available before `App` mounts.

## Risks / Trade-offs

- [Less isolated unit coverage around a one-line bridge] → startup smoke
  validation covers the actual Electron sandbox integration that failed.
- [Future preload helpers use incompatible relative imports] → retain this
  design decision in the archived OpenSpec change and keep preload logic
  self-contained unless a compatible bundling approach is introduced.

## Migration Plan

1. Inline the built-in Electron resolver in preload and remove the helper.
2. Run application tests, lint, build, and a development startup smoke test.
3. Rollback is a direct restoration of the prior preload script; no data is
   migrated or persisted.

## Open Questions

None.
