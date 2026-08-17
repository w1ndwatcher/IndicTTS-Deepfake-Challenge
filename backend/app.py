from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

import predict

# Load the model once when the container starts, not on every request.
@asynccontextmanager
async def lifespan(app: FastAPI):
    predict.load_model()
    yield


app = FastAPI(title="IndicTTS Deepfake Detector", lifespan=lifespan)

# CORS: restrict this to your actual Static Web Apps domain before sharing
# the demo publicly. "*" is fine for local testing only.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

ALLOWED_CONTENT_TYPES = {"audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/webm", "audio/ogg"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/predict")
async def predict_endpoint(file: UploadFile = File(...)):
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported content type '{file.content_type}'. Upload wav/mp3/ogg/webm audio.",
        )

    audio_bytes = await file.read()
    print(audio_bytes)
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty file upload.")

    try:
        result = predict.predict(audio_bytes)
        print(result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Inference failed: {exc}")

    return result
