"""
Inference logic for the IndicTTS Deepfake Detector.

Loads the fine-tuned DistilHuBERT audio classifier exported from the
training notebook (trainer.save_model("model/")) and exposes a single
predict(audio_bytes) function that FastAPI calls per request.
"""

import io
import numpy as np
import soundfile as sf
import torch
import torchaudio
from transformers import AutoFeatureExtractor, AutoModelForAudioClassification

MODEL_DIR = "model"          # folder produced by trainer.save_model("model/")
TARGET_SAMPLE_RATE = 16000
EXPECTED_LENGTH = 32000       # 2 sec @ 16kHz, matches training preprocessing

_device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
_feature_extractor = None
_model = None


def load_model():
    global _feature_extractor, _model
    _feature_extractor = AutoFeatureExtractor.from_pretrained(MODEL_DIR)
    _model = AutoModelForAudioClassification.from_pretrained(MODEL_DIR)
    _model.to(_device)
    _model.eval()

    import os
    print(f"[load_model] Loaded from: {os.path.abspath(MODEL_DIR)}")
    print(f"[load_model] num_labels: {_model.config.num_labels}")
    print(f"[load_model] classifier weight sample: {_model.classifier.weight[0][:5]}")
    return _model, _feature_extractor


def _load_audio(audio_bytes: bytes) -> np.ndarray:
    """Decode uploaded bytes into a mono 16kHz float32 waveform.

    Uses soundfile (libsndfile) directly instead of torchaudio's backend
    dispatch, since torchaudio can fail to find a usable backend for
    in-memory MP3 buffers on some platforms unless FFmpeg is on PATH.
    Modern soundfile wheels bundle libsndfile 1.2+, which decodes MP3
    natively with no external binary required.
    """
    audio, sr = sf.read(io.BytesIO(audio_bytes), dtype="float32", always_2d=False)

    # Downmix to mono if needed
    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    # Resample to the rate the model was trained on
    if sr != TARGET_SAMPLE_RATE:
        waveform = torch.from_numpy(audio).unsqueeze(0)
        resampler = torchaudio.transforms.Resample(sr, TARGET_SAMPLE_RATE)
        waveform = resampler(waveform)
        audio = waveform.squeeze(0).numpy()

    # Match training-time trim/pad to a fixed 2-second window
    if len(audio) < EXPECTED_LENGTH:
        audio = np.pad(audio, (0, EXPECTED_LENGTH - len(audio)), mode="constant")
    else:
        audio = audio[:EXPECTED_LENGTH]

    return audio


def predict(audio_bytes: bytes) -> dict:
    """
    Run inference on raw audio bytes (wav/mp3/etc, anything torchaudio can decode).
    Returns {"is_tts": bool, "confidence": float, "label": "synthetic"|"authentic"}.
    """
    if _model is None or _feature_extractor is None:
        raise RuntimeError("Model not loaded. Call load_model() at startup.")

    audio = _load_audio(audio_bytes)

    inputs = _feature_extractor(
        audio, sampling_rate=TARGET_SAMPLE_RATE, return_tensors="pt", padding=True
    )
    inputs = {k: v.to(_device) for k, v in inputs.items()}

    with torch.no_grad():
        logits = _model(**inputs).logits
        probs = torch.softmax(logits, dim=-1).squeeze(0).cpu().numpy()

    synthetic_prob = float(probs[1])  # class 1 = synthetic/TTS, per training notebook
    is_tts = synthetic_prob >= 0.5

    return {
        "is_tts": is_tts,
        "label": "synthetic" if is_tts else "authentic",
        "confidence": synthetic_prob if is_tts else 1.0 - synthetic_prob,
        "synthetic_probability": synthetic_prob,
    }
