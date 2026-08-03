"""
faster-whisper Transkription für CreatorHQ.
Nutzung: python3 transcribe.py <modell> <sprache|auto> <audio1> [audio2 ...]
Gibt JSON-Array aus: [{"file","text","language","segments":[...]}], Reihenfolge = Input.
Das Modell wird nur einmal geladen (effizient für mehrere Dateien).

word_timestamps=True liefert die Grundlage für kurze, exakt getimte
Untertitel-Cues und satzgenaue Clip-Grenzen (subtitle-cues.ts / sentences.ts).
condition_on_previous_text=False verhindert Wiederholungs-Halluzinationen
bei Musik/lauten Passagen.
"""
import sys
import json
from faster_whisper import WhisperModel


def to_segments(segments) -> list:
    out = []
    for seg in segments:
        text = seg.text.strip()
        if not text:
            continue
        words = [
            {"start": round(w.start, 3), "end": round(w.end, 3), "word": w.word.strip()}
            for w in (seg.words or [])
            if w.word and w.word.strip()
        ]
        out.append({
            "start": round(seg.start, 3),
            "end": round(seg.end, 3),
            "text": text,
            "words": words,
        })
    return out


def main() -> None:
    if len(sys.argv) < 4:
        print("[]")
        return
    model_name = sys.argv[1]
    language = None if sys.argv[2] == "auto" else sys.argv[2]
    files = sys.argv[3:]
    model = WhisperModel(model_name, device="cpu", compute_type="int8")

    results = []
    for f in files:
        try:
            segments, info = model.transcribe(
                f,
                language=language,
                vad_filter=True,
                word_timestamps=True,
                beam_size=5,
                condition_on_previous_text=False,
            )
            segs = to_segments(segments)
            text = " ".join(s["text"] for s in segs).strip()
            results.append({
                "file": f,
                "text": text,
                "language": info.language,
                "segments": segs,
            })
        except Exception as e:  # noqa: BLE001
            results.append({
                "file": f,
                "text": "",
                "language": None,
                "segments": [],
                "error": str(e),
            })

    print(json.dumps(results, ensure_ascii=False))


if __name__ == "__main__":
    main()
