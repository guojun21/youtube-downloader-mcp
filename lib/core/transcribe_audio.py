#!/usr/bin/env python3
"""
Why: standalone Python script for local ASR transcription using mlx-whisper.
Called by video_transcription_service.js via child_process.spawn().
Outputs progress JSON lines to stderr so the Node.js caller can parse them.
Writes plain-text transcript + JSON sidecar with segments/metadata.
"""

import argparse
import json
import os
import re
import sys
import time


def emit_progress(status, progress=0.0, **extra):
    """Write a JSON progress line to stderr for the Node.js parent to parse."""
    msg = {"status": status, "progress": round(progress, 3), **extra}
    sys.stderr.write(json.dumps(msg) + "\n")
    sys.stderr.flush()


def detect_language_from_title(title):
    """
    Why: fast heuristic to guess language from video title so Whisper can
    skip its 30s audio detection and start transcribing immediately.
    """
    if re.search(r"[\u4e00-\u9fff]", title):
        return "zh"
    if re.search(r"[\uac00-\ud7af]", title):
        return "ko"
    if re.search(r"[\u3040-\u309f\u30a0-\u30ff]", title):
        return "ja"
    return None


def main():
    parser = argparse.ArgumentParser(description="Transcribe audio/video with mlx-whisper")
    parser.add_argument("--input", required=True, help="Path to audio/video file")
    parser.add_argument("--output", required=True, help="Path for output .txt transcript")
    parser.add_argument("--language", default="auto", help="Language code or 'auto'")
    parser.add_argument("--model", default="mlx-community/whisper-large-v3-turbo",
                        help="HuggingFace model name")
    args = parser.parse_args()

    if not os.path.isfile(args.input):
        emit_progress("error", error=f"Input file not found: {args.input}")
        sys.exit(1)

    # Why: resolve language from title heuristic if auto
    language = None
    if args.language and args.language != "auto":
        language = args.language
    else:
        title = os.path.splitext(os.path.basename(args.input))[0]
        language = detect_language_from_title(title)

    emit_progress("loading_model", 0.0, model=args.model, language=language or "auto-detect")

    import mlx_whisper

    emit_progress("transcribing", 0.05)
    start_time = time.time()

    # Why: mlx_whisper.transcribe() runs the full pipeline — audio decode,
    # feature extraction, inference — all on Apple Silicon GPU via MLX.
    transcribe_kwargs = {
        "path_or_hf_repo": args.model,
        "verbose": False,
    }
    if language:
        transcribe_kwargs["language"] = language

    result = mlx_whisper.transcribe(args.input, **transcribe_kwargs)

    elapsed = time.time() - start_time
    emit_progress("transcribing", 0.95, elapsed_seconds=round(elapsed, 1))

    # Why: extract plain text from segments
    segments = result.get("segments", [])
    full_text = result.get("text", "").strip()
    if not full_text and segments:
        full_text = " ".join(seg.get("text", "").strip() for seg in segments)

    detected_language = result.get("language", language or "unknown")

    # Write plain-text transcript
    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        f.write(full_text)

    # Write JSON sidecar with segments and metadata
    json_output_path = args.output.replace(".txt", ".segments.json")
    sidecar = {
        "language": detected_language,
        "model": args.model,
        "duration_seconds": round(elapsed, 1),
        "text_length": len(full_text),
        "segment_count": len(segments),
        "segments": [
            {
                "start": seg.get("start", 0),
                "end": seg.get("end", 0),
                "text": seg.get("text", "").strip(),
            }
            for seg in segments
        ],
    }
    with open(json_output_path, "w", encoding="utf-8") as f:
        json.dump(sidecar, f, ensure_ascii=False, indent=2)

    emit_progress("completed", 1.0,
                  language=detected_language,
                  transcript_path=args.output,
                  segments_path=json_output_path,
                  text_length=len(full_text),
                  elapsed_seconds=round(elapsed, 1))


if __name__ == "__main__":
    main()
