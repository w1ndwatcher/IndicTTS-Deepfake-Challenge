FROM python:3.11-slim

WORKDIR /app

# torchaudio needs libsndfile/ffmpeg to decode mp3/ogg/webm uploads
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install the CPU-only torch build first (much smaller than the CUDA wheel;
# there's no GPU on Azure Container Apps' consumption plan anyway).
RUN pip install --no-cache-dir torch==2.4.1 torchaudio==2.4.1 \
    --index-url https://download.pytorch.org/whl/cpu

RUN pip install --no-cache-dir -r requirements.txt

COPY . .
# Place your exported model here before building:
#   backend/model/config.json, pytorch_model.bin, preprocessor_config.json
# (see predict.py's MODEL_DIR)

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
