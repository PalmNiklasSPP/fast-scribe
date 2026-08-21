"""
Legacy Fast Scribe transcription CLI retained as an unpackaged reference.
Usage: python transcribe_cli.py <file> --endpoint <url> --api-key <key> [options]

Emits JSON events to stdout for the Electron host to consume:
  {"type": "progress", "progress": <0-100>}
  {"type": "output_path", "outputPath": "<path>"}
  {"type": "done", "message": "Transcription complete."}
  {"type": "error", "message": "<error message>"}
"""

import argparse
import json
import os
import sys
import tempfile

import requests
from pydub import AudioSegment


def emit(event: dict):
    print(json.dumps(event), flush=True)


def convert_to_safe_wav(input_path: str, output_path: str) -> str:
    audio = AudioSegment.from_file(input_path)
    audio = audio.set_channels(1).set_frame_rate(16000).set_sample_width(2)
    audio.export(output_path, format="wav")
    return output_path


def split_audio(wav_path: str, chunk_length_ms: int) -> list[str]:
    audio = AudioSegment.from_file(wav_path, format="wav")
    chunks = []
    tmp_dir = tempfile.mkdtemp(prefix="fastscribe_")
    for i, start in enumerate(range(0, len(audio), chunk_length_ms)):
        chunk = audio[start : start + chunk_length_ms]
        chunk_path = os.path.join(tmp_dir, f"chunk_{i}.wav")
        chunk.export(chunk_path, format="wav")
        chunks.append(chunk_path)
    return chunks


def transcribe_chunk(file_path: str, endpoint: str, api_key: str, model: str, language: str | None) -> str:
    headers = {"api-key": api_key}
    with open(file_path, "rb") as f:
        files_payload = {
            "file": (os.path.basename(file_path), f, "audio/wav"),
            "model": (None, model),
        }
        if language and language != "auto":
            files_payload["language"] = (None, language)
        response = requests.post(endpoint, headers=headers, files=files_payload, timeout=300)

    if not response.ok:
        raise RuntimeError(f"API error {response.status_code}: {response.text}")

    data = response.json()
    return data.get("text", "")


def main():
    parser = argparse.ArgumentParser(description="Fast Scribe — transcribe audio via Azure OpenAI")
    parser.add_argument("file", help="Path to the audio file to transcribe")
    parser.add_argument("--endpoint", required=True, help="Azure OpenAI transcription endpoint URL")
    parser.add_argument("--api-key", required=True, help="Azure OpenAI API key")
    parser.add_argument("--model", default="gpt-4o-transcribe", help="Azure OpenAI transcription model")
    parser.add_argument("--output-dir", default=None, help="Directory for output .txt file (default: same as input)")
    parser.add_argument("--chunk-duration-ms", type=int, default=600_000, help="Audio chunk duration in ms (default: 600000 = 10min)")
    parser.add_argument("--language", default=None, help="Language ISO code, or omit for auto-detect")
    args = parser.parse_args()

    input_path = args.file
    if not os.path.isfile(input_path):
        emit({"type": "error", "message": f"File not found: {input_path}"})
        sys.exit(1)

    output_dir = args.output_dir or os.path.dirname(os.path.abspath(input_path))
    os.makedirs(output_dir, exist_ok=True)

    base_name = os.path.splitext(os.path.basename(input_path))[0]
    output_path = os.path.join(output_dir, base_name + ".txt")
    emit({"type": "output_path", "outputPath": output_path})

    tmp_wav = None
    chunks = []
    try:
        emit({"type": "progress", "progress": 5})

        # Convert to safe WAV
        tmp_fd, tmp_wav = tempfile.mkstemp(suffix="_converted.wav", prefix="fastscribe_")
        os.close(tmp_fd)
        convert_to_safe_wav(input_path, tmp_wav)

        emit({"type": "progress", "progress": 15})

        # Split into chunks
        chunks = split_audio(tmp_wav, args.chunk_duration_ms)
        total = len(chunks)

        with open(output_path, "w", encoding="utf-8") as out:
            out.write("--- Transcription Start ---\n\n")
            for i, chunk in enumerate(chunks, start=1):
                progress = 15 + int((i / total) * 80)
                emit({"type": "progress", "progress": progress})

                text = transcribe_chunk(chunk, args.endpoint, args.api_key, args.model, args.language)
                out.write(text + "\n\n")

                # Clean up chunk immediately
                try:
                    os.remove(chunk)
                except OSError:
                    pass

            out.write("--- Transcription End ---\n")

        emit({"type": "progress", "progress": 100})
        emit({"type": "done", "message": "Transcription complete."})

    except Exception as exc:
        emit({"type": "error", "message": str(exc)})
        sys.exit(1)

    finally:
        # Clean up temp files
        if tmp_wav and os.path.exists(tmp_wav):
            try:
                os.remove(tmp_wav)
            except OSError:
                pass
        for chunk in chunks:
            if os.path.exists(chunk):
                try:
                    os.remove(chunk)
                except OSError:
                    pass


if __name__ == "__main__":
    main()
