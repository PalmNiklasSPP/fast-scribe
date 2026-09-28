# dropped-audio-file-import Specification

## Purpose
Ensure supported audio files dropped into Fast Scribe retain their absolute
filesystem paths while preserving the renderer's context-isolation boundary.
## Requirements
### Requirement: Dropped audio files retain their filesystem paths
The system SHALL resolve every supported audio `File` dropped into the Fast
Scribe drop zone to its backing absolute filesystem path through the
context-isolated Electron preload bridge before creating a transcription entry.

#### Scenario: Supported file is dropped from the filesystem

- **WHEN** a user drops a supported audio file that is backed by a filesystem
  path
- **THEN** the created transcription entry contains that absolute path
- **AND** the filename displayed to the user is derived from that path

#### Scenario: Supported file has no backing filesystem path

- **WHEN** a supported audio `File` has no backing filesystem path
- **THEN** the system SHALL not create a transcription entry for that file
- **AND** the system SHALL not submit its filename as an input path

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

