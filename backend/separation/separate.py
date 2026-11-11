"""Separa un stem (drums, bass, vocals, other) de un WAV con Demucs.

Uso: python separate.py <entrada.wav> <stem> <salida.wav>

Lee y escribe con soundfile para no depender del backend de audio de torchaudio.
"""
import sys

import numpy as np
import soundfile as sf
import torch
from demucs.apply import apply_model
from demucs.pretrained import get_model


def main() -> int:
    if len(sys.argv) != 4:
        print(__doc__, file=sys.stderr)
        return 2

    src, stem, dst = sys.argv[1:4]

    model = get_model("htdemucs")
    model.eval()

    if stem not in model.sources:
        print(f"Stem desconocido: {stem}. Opciones: {model.sources}", file=sys.stderr)
        return 2

    audio, sr = sf.read(src, dtype="float32", always_2d=True)  # (frames, canales)
    if sr != model.samplerate:
        print(f"Se esperaba {model.samplerate} Hz y llegó {sr} Hz", file=sys.stderr)
        return 2
    if audio.shape[1] == 1:
        audio = np.repeat(audio, 2, axis=1)

    wav = torch.from_numpy(audio.T.copy())  # (canales, frames)
    ref = wav.mean(0)
    mean, std = ref.mean(), ref.std() + 1e-8
    wav = (wav - mean) / std

    with torch.no_grad():
        sources = apply_model(model, wav[None], device="cpu", split=True, overlap=0.25, progress=False)[0]
    sources = sources * std + mean

    out = sources[model.sources.index(stem)].numpy().T
    sf.write(dst, out, sr, subtype="PCM_16")
    return 0


if __name__ == "__main__":
    sys.exit(main())
