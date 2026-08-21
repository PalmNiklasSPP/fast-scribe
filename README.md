# Fast Scribe

A sleek desktop app for transcribing audio files using Azure OpenAI (gpt-4o-transcribe). Drag-and-drop multiple files, configure once, transcribe in bulk.

## Stack

| Layer | Tech |
|---|---|
| Desktop shell | Electron |
| UI | React + TypeScript + Vite |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Transcription | Node.js + bundled FFmpeg |
| Config persistence | electron-store |

## Prerequisites

- **Node.js** 18+

FFmpeg is installed as an npm dependency and bundled into desktop installers.
No system FFmpeg or Python installation is required.

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
5. Each file's status updates in real-time
6. Click the document icon on a completed file to review, edit, copy, or save its transcript
7. Click the folder icon to open the output location

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
Fast Scribe like any other desktop application. The installer includes the
native FFmpeg binary used for audio conversion and chunking, so no additional
runtime or audio tools are required.

Temporary converted audio and chunks are stored in a per-job OS temporary
directory. They are removed after success, failure, or normal cancellation.
The final `.txt` file is published only after every chunk succeeds.

## Publishing downloadable installers

Follow [RELEASING.md](RELEASING.md). It uses a release-preparation command to
update both package manifests before a version tag triggers the GitHub Actions
build and GitHub Release.

## Architecture

```
fast-scribe/
├── legacy/
│   └── transcribe_cli.py      # Unpackaged Python reference implementation
└── fast-scribe-app/
    ├── electron/
    │   ├── main.cjs           # Electron main process and job IPC handlers
    │   ├── preload.cjs        # Context bridge — exposes safe API to renderer
    │   └── transcription.cjs  # FFmpeg conversion, Azure upload, and cleanup
    └── src/
        ├── components/
        │   ├── ui/            # shadcn/ui primitives (button, input, progress, …)
        │   ├── DropZone.tsx   # Drag-and-drop + file browser
        │   ├── FileList.tsx   # Per-file status rows with progress
        │   ├── SettingsPanel.tsx  # Modal settings form
        │   └── TranscriptPanel.tsx  # Completed transcript review and editing
        ├── hooks/
        │   ├── useTranscription.ts  # Job orchestration, IPC events
        │   └── useToast.ts          # Toast notifications
        ├── lib/
        │   ├── types.ts       # Shared TypeScript types + Window.electronAPI declaration
        │   └── utils.ts       # cn() helper
        └── App.tsx            # Root — layout, config loading, action bar
```

The bundled FFmpeg distribution and license details are recorded in
`fast-scribe-app/THIRD_PARTY_NOTICES.md`.

## Future: Pipeline Steps

The architecture is designed for a post-processing pipeline. After transcription completes, results will flow through configurable steps (e.g. summarisation, speaker diarisation, translation). The `App.tsx` already contains a `pipelineSteps` placeholder — adding steps will surface a pipeline UI below the file list.
