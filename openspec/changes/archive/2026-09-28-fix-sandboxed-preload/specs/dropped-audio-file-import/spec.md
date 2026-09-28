## MODIFIED Requirements

### Requirement: Dropped-file path resolution preserves renderer isolation
The renderer SHALL obtain a dropped file's path only through the dedicated
preload bridge, and the bridge SHALL use Electron's supported `webUtils`
utility to resolve the supplied `File`. The preload bridge SHALL initialize
successfully in Electron's sandboxed preload context before the renderer mounts.

#### Scenario: Renderer resolves a dropped file

- **WHEN** the drop zone handles a supported audio `File`
- **THEN** it invokes the dedicated preload bridge with that `File`
- **AND** the renderer does not access Electron or Node APIs directly

#### Scenario: Application starts in Electron

- **WHEN** Electron loads the Fast Scribe renderer with context isolation
  enabled
- **THEN** the preload bridge initializes without a module-loading error
- **AND** `window.electronAPI` is available before the application reads its
  configuration
