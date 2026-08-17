# Signal Forensics: IndicTTS Deepfake Speech Detector

A binary audio classifier that distinguishes AI-generated (TTS) speech from
authentic human speech, fine-tuned on the IndicTTS Deepfake Challenge dataset
and deployed as a containerized inference API with a React demo console.

**[Live demo](#) · [Model card](./MODEL_CARD.md) · [API docs](https://deepfake-api.politepond-e94e5adf.centralindia.azurecontainerapps.io/docs)**

---

## Problem

Synthetic speech generation has gotten good enough that distinguishing it
from real human speech is no longer trivial by ear. This project trains a
model to do it automatically, and packages that model as something you can
actually query over HTTP rather than leaving it in a notebook.

## Dataset

[`SherryT997/IndicTTS-Deepfake-Challenge-Data`](https://huggingface.co/datasets/SherryT997/IndicTTS-Deepfake-Challenge-Data)
on Hugging Face — Indic-language speech samples labeled `is_tts` (0 = real,
1 = synthetic).

- ~16GB across 35 parquet shards in the full training split
- Trained on a **10,000-sample random subset** (seed=37) for tractable
  iteration speed on Kaggle's session limits, rather than the full set
- 90/10 train/validation split (seed=42) within that subset
- Audio standardized to 16kHz mono, trimmed/zero-padded to a fixed 2-second
  (32,000 sample) window per clip

## Model

**Backbone:** [`ntu-spml/distilhubert`](https://huggingface.co/ntu-spml/distilhubert)
— a distilled version of HuBERT (~26M parameters vs. HuBERT-base's ~95M),
chosen specifically to keep both fine-tuning and inference cheap without
giving up much representational quality; HuBERT-family models learn speech
representations via masked prediction on discovered acoustic units, which
transfers well to detecting the artifacts synthetic speech leaves behind.

**Task head:** `HubertForSequenceClassification`, a linear classification
head over the pooled encoder output, fine-tuned for binary classification
(`num_labels=2`).

**Training configuration:**

| | |
|---|---|
| Optimizer | AdamW (via HF `Trainer`) |
| Learning rate | 1e-4, with 1,000 warmup steps |
| Weight decay | 0.005 |
| Epochs | 7 |
| Batch size | 4 (train + eval) |
| Precision | fp32 |
| Feature encoder | **Frozen** (`freeze_feature_encoder()`) — only the
  transformer layers and classification head are fine-tuned |
| Memory optimization | Gradient checkpointing enabled |
| Checkpoint selection | Best checkpoint by eval loss retained
  (`load_best_model_at_end`), 2 most recent checkpoints kept on disk |

Freezing the CNN feature encoder and fine-tuning only the transformer
layers + head is a standard efficient-fine-tuning approach for speech
transformers — it cuts trainable parameters and memory substantially with
minimal accuracy cost, since the low-level acoustic feature extraction
CNN layers transfer well across speech tasks without further tuning.

## Evaluation

Metrics computed via Hugging Face `evaluate` (accuracy, precision, recall,
F1, ROC-AUC) on the internal 10% held-out validation split, tracked every
500 steps across training (7 epochs, 15,750 total steps).

**Best checkpoint** (step 8,500 — lowest validation loss, the checkpoint
`load_best_model_at_end` selects):

| Metric | Score |
|---|---|
| Validation Loss | 0.1422 |
| Accuracy | 97.30% |
| Precision | 97.44% |
| Recall | 96.82% |
| F1 | 97.13% |
| ROC-AUC | 0.9960 |

**Final checkpoint** (step 15,000, near end of epoch 7) for comparison:

| Metric | Score |
|---|---|
| Validation Loss | 0.1931 |
| Accuracy | 97.80% |
| Precision | 98.28% |
| Recall | 97.03% |
| F1 | 97.65% |
| ROC-AUC | 0.9967 |

Validation loss fluctuates step-to-step on a relatively small held-out
set (~1,000 samples from the 10k subset) rather than declining smoothly —
expected at this scale, and why `load_best_model_at_end` rather than
simply taking the final step is used to select the deployed weights.

**Public leaderboard:** submitted predictions scored **0.9761** on the
IndicTTS Deepfake Challenge public leaderboard (up from an earlier
submission of 0.9452), using the same trained model scored against the
competition's unlabeled test set.

## Serving & Deployment

The trained model is exported (`trainer.save_model()`) and served
independently of the training notebook through a small inference stack:

- **FastAPI** backend wrapping a single `predict(audio_bytes)` function —
  model loaded once at process startup (not per-request), audio decoded
  via `soundfile` and resampled/padded to match the training-time
  preprocessing exactly
- **CPU-only inference** — DistilHuBERT is small enough that GPU serving
  isn't necessary for demo-scale traffic, which keeps the deployed
  container roughly a third the size of a CUDA-enabled image and avoids
  GPU billing entirely
- **Docker** containerized, pushed to **Azure Container Registry**
- **Azure Container Apps** for hosting — scales to zero between requests,
  scales out under load, no VM management
- **React + Vite** frontend on **Azure Static Web Apps**, calling the API
  over HTTPS

```
├── backend/
│   ├── app.py           # FastAPI routes + startup model loading
│   ├── predict.py        # Inference logic (decode → feature extract → classify)
│   ├── model/            # Exported fine-tuned weights (not committed — see below)
│   └── Dockerfile
├── frontend/
│   └── src/App.jsx       # Upload console UI
└── README.md
```

## Known limitations & next steps

Being upfront about what this is and isn't:

- Trained on a 10k-sample subset of a much larger (~16GB) dataset —
  performance on the full distribution and on TTS systems/languages
  underrepresented in that subset is untested, though the 97%+ validation
  accuracy and 0.976 public leaderboard score are encouraging signs.
- No quantization, ONNX export, or pruning has been applied yet — the
  served model is the raw fp32 fine-tuned checkpoint. Given the model is
  already small (DistilHuBERT), the main latency cost is decode +
  feature extraction rather than the forward pass itself, but INT8
  dynamic quantization (`torch.quantization`) would be a natural next
  step to shrink the container image and cut cold-start latency further.
- Fixed-length 2-second windows mean longer clips are truncated rather
  than analyzed in full — a chunked/windowed inference approach would
  handle longer audio more robustly.
- This is a demo, not a forensic-grade tool — false positives/negatives
  are expected, and the UI says so.

## Running locally

```bash
cd backend
pip install -r requirements.txt
uvicorn app:app --reload

cd ../frontend
npm install
npm run dev
```

See `backend/predict.py` for how to export a compatible `model/` folder
from the training notebook.
