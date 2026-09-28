## Why

The dropped-audio import change added a relative `require` to the Electron
preload script. Electron runs this preload in a sandboxed context where local
CommonJS modules cannot be loaded, so preload initialization fails and the
renderer crashes with `window.electronAPI` undefined.

## What Changes

- Remove the sandbox-incompatible local module import from the preload script.
- Keep dropped-file path resolution available through the existing narrow
  context-isolated bridge.
- Remove the now-unusable helper module and retain coverage at the supported
  Electron integration boundary.
- Verify the renderer starts with `window.electronAPI` available.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `dropped-audio-file-import`: Require the preload bridge used for dropped-file
  path resolution to initialize successfully before the renderer uses it.

## Impact

- `fast-scribe-app/electron/preload.cjs`
- `fast-scribe-app/electron/dropped-file-paths.cjs`
- `fast-scribe-app/electron/dropped-file-paths.test.cjs`
- Desktop development startup verification
