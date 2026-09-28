## 1. Sandboxed preload repair

- [x] 1.1 Remove the relative helper-module import from the preload script.
- [x] 1.2 Invoke Electron's built-in `webUtils.getPathForFile` directly from
  the existing bridge and remove the incompatible helper files.

## 2. Verification

- [x] 2.1 Run the desktop app tests, lint, and production build.
- [x] 2.2 Verify a development Electron startup initializes the preload bridge
  and no longer crashes the renderer.
