import os
import requests
import json
from pydub import AudioSegment

# Config
ENDPOINT = "https://sppark-poc-3-instruction-finder.openai.azure.com/openai/deployments/gpt-4o-transcribe/audio/transcriptions?api-version=2025-03-01-preview"
API_KEY = "7CDTL6LvdMPNRST356piWKIEa9q62pGUT8w0O5lGbfd3NdI7prHCJQQJ99BIACfhMk5XJ3w3AAABACOGqfAu"
FILE_PATH = r"C:\Users\NIPA01\source\ember_agent\future-of-ai-workshop - intention control\Sammanfattning.m4a"
OUTPUT_PATH = os.path.splitext(FILE_PATH)[0] + ".txt"
CHUNK_DURATION_MS = 600 * 1000  # 10 minutes (600s)
MAX_CHUNKS = None  # Set to an integer to transcribe only the last N chunks for quick tests.


def convert_to_safe_wav(input_path, output_path):
    """Convert to PCM 16-bit mono 16kHz WAV for compatibility."""
    audio = AudioSegment.from_file(input_path)
    audio = audio.set_channels(1).set_frame_rate(16000).set_sample_width(2)  # 16-bit PCM
    audio.export(output_path, format="wav")
    return output_path


def split_audio(input_path, chunk_length_ms):
    audio = AudioSegment.from_file(input_path, format="wav")
    chunks = []
    for i, start in enumerate(range(0, len(audio), chunk_length_ms)):
        chunk = audio[start:start + chunk_length_ms]
        chunk_path = f"chunk_{i}.wav"
        chunk.export(chunk_path, format="wav")
        chunks.append(chunk_path)
    return chunks


def transcribe_file(file_path):
    headers = {"Authorization": f"Bearer {API_KEY}"}
    with open(file_path, "rb") as f:
        files = {
            "file": (os.path.basename(file_path), f, "audio/wav"),
            "model": (None, "gpt-4o-transcribe")
        }
        response = requests.post(ENDPOINT, headers=headers, files=files)
    return response.text


def main():
    print("Converting input to safe WAV format...")
    safe_wav = os.path.splitext(FILE_PATH)[0] + "_converted.wav"
    convert_to_safe_wav(FILE_PATH, safe_wav)

    print("Splitting audio...")
    chunks = split_audio(safe_wav, CHUNK_DURATION_MS)
    if isinstance(MAX_CHUNKS, int) and MAX_CHUNKS > 0:
        chunks = chunks[-MAX_CHUNKS:]
    with open(OUTPUT_PATH, "w", encoding="utf-8") as out:
        out.write("--- Transcription Start ---\n\n")

        for i, chunk in enumerate(chunks, start=1):
            print(f"Transcribing chunk {i}/{len(chunks)}: {chunk}")
            result = transcribe_file(chunk)
            try:
                data = json.loads(result)
                if "text" in data:
                    out.write(data["text"] + "\n\n")
                else:
                    out.write(f"[Chunk {i} error]\n{result}\n\n")
            except json.JSONDecodeError:
                out.write(f"[Chunk {i} invalid JSON]\n{result}\n\n")

        out.write("--- Transcription End ---\n")

    print(f"Transcription saved to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
