## Why

Dragging an audio file into a packaged Fast Scribe window currently submits only
the filename instead of its absolute path. The main process then resolves that
name against the application installation directory and fails with `ENOENT`,
preventing users from transcribing dropped files.

## What Changes

- Resolve dropped `File` objects to their on-disk paths through Electron's
  supported `webUtils.getPathForFile` API.
- Expose only the required file-path resolver from the context-isolated preload
  bridge.
- Do not add files when Electron reports that a dropped `File` has no backing
  filesystem path.
- Cover the resolver behavior with an automated test.

## Capabilities

### New Capabilities

- `dropped-audio-file-import`: Accept supported audio files dropped into the
  application using their actual absolute filesystem paths.

### Modified Capabilities

<!-- None. -->

## Impact

- `fast-scribe-app/src/components/DropZone.tsx`
- `fast-scribe-app/electron/preload.cjs`
- `fast-scribe-app/src/lib/types.ts`
- Electron preload tests and the desktop app validation suite
