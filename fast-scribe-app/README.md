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
