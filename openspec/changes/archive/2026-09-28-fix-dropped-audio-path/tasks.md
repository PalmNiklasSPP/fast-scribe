## 1. Secure file-path resolution

- [x] 1.1 Add a testable helper that resolves an Electron-backed dropped
  `File` through `webUtils.getPathForFile`.
- [x] 1.2 Expose the narrowly scoped resolver from the context-isolated
  preload bridge and declare it for the renderer.

## 2. Drop-zone import behavior

- [x] 2.1 Replace the deprecated `File.path` lookup with the preload resolver.
- [x] 2.2 Skip supported dropped files without a backing filesystem path rather
  than queueing their relative filenames.

## 3. Verification

- [x] 3.1 Add focused automated coverage for the resolver contract.
- [x] 3.2 Run OpenSpec validation plus the desktop app lint, tests, and build.
