# Fast Scribe

A sleek desktop app for transcribing audio files using Azure OpenAI (gpt-4o-transcribe). Drag-and-drop multiple files, configure once, transcribe in bulk.

## Stack

| Layer | Tech |
|---|---|
| Desktop shell | Electron |
| UI | React + TypeScript + Vite |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Transcription | Python (pydub + requests) |
| Config persistence | electron-store |

## Prerequisites

- **Node.js** 18+
- **Python** 3.11+ with `pip`
- **ffmpeg** — required by pydub for audio conversion

### Install ffmpeg (Windows)
```powershell
winget install ffmpeg
```
Or download from https://ffmpeg.org/download.html and add to PATH.

### Install Python dependencies
```bash
pip install pydub requests
```

## Development

```bash
cd fast-scribe-app
npm install
npm run dev
```

This launches Vite (hot-reload) and Electron simultaneously.

## Configuration

On first launch, open **Settings** (gear icon, top-right) and configure:

| Field | Description |
|---|---|
| Endpoint URL | Full Azure OpenAI transcription endpoint (including deployment name + API version) |
| API Key | Your Azure OpenAI key |
| Output Folder | Where `.txt` files are saved (defaults to same folder as audio file) |
| Chunk Duration | How long each audio segment is before sending to the API (default: 10 min) |
| Language | ISO language code (e.g. `sv`, `en`) or `auto` for detection |

Settings are persisted in your OS app-data directory via `electron-store`.

## Usage

1. Launch the app (`npm run dev` or built binary)
2. Configure Settings on first run
3. Drag audio files onto the drop zone (or click to browse)
4. Click **Transcribe**
5. Each file's status updates in real-time; click the folder icon to open the output location

## Building a distributable

The project produces native installers, so end users do not need Node.js or
`npm run dev`. Build an installer for the operating system you are using:

```bash
cd fast-scribe-app
npm install
npm run build:win    # Windows installer (.exe)
# npm run build:mac  # macOS disk image (.dmg)
# npm run build:linux # Linux portable app (.AppImage)
```

Output appears in `fast-scribe-app/dist-electron/`. On Windows, distribute the
generated `Fast Scribe Setup *.exe`; recipients install it once and then launch
Fast Scribe like any other desktop application. The Python script
(`transcribe_cli.py`) is bundled as an extra resource.

> **Note:** The installer removes the Node.js/npm requirement, but transcription
> still requires Python, `pydub`, `requests`, and ffmpeg on the recipient's
> machine. A fully self-contained installer will additionally need a bundled
> Python runtime and ffmpeg.

## Publishing downloadable installers

Pushing a version tag triggers GitHub Actions to build Windows, macOS, and Linux
installers and attach them to a GitHub Release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Users can then download the appropriate file from the repository's
**Releases** page.

## Architecture

```
fast-scribe/
├── transcribe_cli.py          # Python transcription CLI (used by Electron)
└── fast-scribe-app/
    ├── electron/
    │   ├── main.cjs           # Electron main process, IPC handlers, spawns Python
    │   └── preload.cjs        # Context bridge — exposes safe API to renderer
    └── src/
        ├── components/
        │   ├── ui/            # shadcn/ui primitives (button, input, progress, …)
        │   ├── DropZone.tsx   # Drag-and-drop + file browser
        │   ├── FileList.tsx   # Per-file status rows with progress
        │   └── SettingsPanel.tsx  # Modal settings form
        ├── hooks/
        │   ├── useTranscription.ts  # Job orchestration, IPC events
        │   └── useToast.ts          # Toast notifications
        ├── lib/
        │   ├── types.ts       # Shared TypeScript types + Window.electronAPI declaration
        │   └── utils.ts       # cn() helper
        └── App.tsx            # Root — layout, config loading, action bar
```

## Future: Pipeline Steps

The architecture is designed for a post-processing pipeline. After transcription completes, results will flow through configurable steps (e.g. summarisation, speaker diarisation, translation). The `App.tsx` already contains a `pipelineSteps` placeholder — adding steps will surface a pipeline UI below the file list.
