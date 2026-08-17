import React, { useCallback, useEffect, useRef, useState } from "react";
import { GripVertical } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const BAR_COUNT = 28;
const SAMPLE_DND_PREFIX = "sample:";

const IDLE_HEIGHTS = Array.from({ length: BAR_COUNT }, (_, i) =>
  0.3 + 0.6 * Math.abs(Math.sin(i * 12.9898))
);

function StatusEyebrow({ children }) {
  return (
    <div className="font-mono text-[11px] tracking-[0.2em] text-idle uppercase">
      {children}
    </div>
  );
}

function Waveform({ state, verdict }) {
  const color =
    state === "settled"
      ? verdict?.is_tts
        ? "bg-synthetic"
        : "bg-authentic"
      : "bg-idle";

  return (
    <div className="flex h-16 items-center justify-center gap-[3px]">
      {IDLE_HEIGHTS.map((h, i) => {
        const settledHeight = verdict
          ? 0.15 + Math.abs(Math.sin(i * (verdict.synthetic_probability * 9 + 1))) * 0.85
          : h;
        return (
          <div
            key={i}
            className={`wave-bar ${state === "settled" ? "wave-bar--settled" : ""} w-[3px] rounded-full ${color}`}
            style={{
              height: "100%",
              transform: `scaleY(${state === "settled" ? settledHeight : h})`,
              animationDelay: `${(i % 8) * 0.09}s`,
              opacity: state === "analyzing" ? 0.6 + 0.4 * Math.random() : 1,
              transition: "transform 0.6s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.4s",
            }}
          />
        );
      })}
    </div>
  );
}

function VerdictMeter({ verdict }) {
  const pct = Math.round(verdict.synthetic_probability * 100);
  const color = verdict.is_tts ? "synthetic" : "authentic";

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between font-mono text-[10px] text-muted">
        <span>AUTHENTIC</span>
        <span>SYNTHETIC</span>
      </div>
      <div className="relative mt-1.5 h-1.5 w-full rounded-full bg-hairline">
        <div
          className={`absolute -top-1 h-3.5 w-[2px] bg-${color}`}
          style={{ left: `calc(${pct}% - 1px)`, transition: "left 0.6s cubic-bezier(0.22,1,0.36,1)" }}
        />
        <div
          className={`h-full rounded-full bg-${color}`}
          style={{ width: `${pct}%`, transition: "width 0.6s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div>
          <div className={`font-display text-xl font-semibold text-${color}`}>
            {verdict.is_tts ? "Synthetic" : "Authentic"}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-muted">
            model: distilhubert · task: is_tts
          </div>
        </div>
        <div className={`font-mono text-2xl text-${color}`}>
          {Math.round(verdict.confidence * 100)}%
        </div>
      </div>
    </div>
  );
}

function SampleClipCard({ item, onUse }) {
  const color = item.label === "synthetic" ? "synthetic" : "authentic";

  const handleDragStart = (e) => {
    e.dataTransfer.setData("text/plain", `${SAMPLE_DND_PREFIX}${item.filename}`);
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div className="rounded-md border border-hairline bg-panel/50 px-2.5 py-2">
      <div
        draggable
        onDragStart={handleDragStart}
        onClick={() => onUse(item.filename)}
        title="Drag onto the analyzer, or click"
        className="flex cursor-grab select-none items-center gap-1.5 active:cursor-grabbing"
      >
        <GripVertical size={13} className="text-muted/60 shrink-0" />
        <span className={`font-mono text-[10px] uppercase tracking-wide text-${color}`}>
          {item.label}
        </span>
      </div>
      <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
        <audio controls src={`/samples/${item.filename}`} className="h-7 w-full" />
      </div>
    </div>
  );
}

function SampleLibrary({ onUse }) {
  const [manifest, setManifest] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | missing
  const [selectedLang, setSelectedLang] = useState(null);

  useEffect(() => {
    fetch("/samples/manifest.json")
      .then((res) => {
        if (!res.ok) throw new Error("not found");
        return res.json();
      })
      .then((data) => {
        setManifest(data);
        const langs = [...new Set(data.map((d) => d.language))].sort();
        setSelectedLang(langs[0] || null);
        setStatus("ready");
      })
      .catch(() => setStatus("missing"));
  }, []);

  if (status === "loading") return null;

  if (status === "missing") {
    return (
      <div className="rounded-lg border border-dashed border-hairline bg-panel/40 px-4 py-6 text-center">
        <StatusEyebrow>Sample Library</StatusEyebrow>
        <p className="mt-2 text-xs text-muted">
          No samples yet — add wav files + manifest.json to
          <code className="mx-1 rounded bg-white/5 px-1 py-0.5 font-mono text-[10px]">frontend/public/samples/</code>
        </p>
      </div>
    );
  }

  const languages = [...new Set(manifest.map((d) => d.language))].sort();
  const pair = manifest.filter((d) => d.language === selectedLang);
  const real = pair.find((d) => d.label === "authentic");
  const fake = pair.find((d) => d.label === "synthetic");

  return (
    <div className="rounded-lg border border-hairline bg-panel/80 backdrop-blur-sm">
      <div className="border-b border-hairline px-4 py-3">
        <StatusEyebrow>Sample Library · Verified Ground Truth</StatusEyebrow>
        <p className="mt-1 text-[11px] text-muted leading-snug">
          Drag a clip onto the analyzer to test it against its known label.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 px-4 pt-3">
        {languages.map((lang) => (
          <button
            key={lang}
            onClick={() => setSelectedLang(lang)}
            className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors ${
              lang === selectedLang
                ? "border-idle/60 bg-idle/10 text-idle"
                : "border-hairline text-muted hover:text-white hover:border-white/30"
            }`}
          >
            {lang}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 p-4">
        {real ? <SampleClipCard item={real} onUse={onUse} /> : <div />}
        {fake ? <SampleClipCard item={fake} onUse={onUse} /> : <div />}
      </div>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState("idle"); // idle | analyzing | settled | error
  const [fileName, setFileName] = useState(null);
  const [verdict, setVerdict] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const analyze = useCallback(async (file) => {
    setFileName(file.name);
    setState("analyzing");
    setError(null);
    setVerdict(null);

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_URL}/predict`, { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Request failed (${res.status})`);
      }
      const data = await res.json();
      setVerdict(data);
      setState("settled");
    } catch (err) {
      setError(err.message || "Something went wrong.");
      setState("error");
    }
  }, []);

  const useSample = useCallback(
    async (filename) => {
      const res = await fetch(`/samples/${filename}`);
      const blob = await res.blob();
      analyze(new File([blob], filename, { type: "audio/wav" }));
    },
    [analyze]
  );

  const handleFiles = useCallback((files) => {
    const file = files?.[0];
    if (file) analyze(file);
  }, [analyze]);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      const text = e.dataTransfer.getData("text/plain");
      if (text && text.startsWith(SAMPLE_DND_PREFIX)) {
        useSample(text.slice(SAMPLE_DND_PREFIX.length));
      } else {
        handleFiles(e.dataTransfer.files);
      }
    },
    [useSample, handleFiles]
  );

  const reset = () => {
    setState("idle");
    setFileName(null);
    setVerdict(null);
    setError(null);
  };

  return (
    <div className="min-h-screen text-white/90 px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <StatusEyebrow>Signal Forensics · DistilHuBERT Classifier</StatusEyebrow>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight text-white">
          Detect synthetic speech.
        </h1>
        <p className="mt-2 text-sm text-muted leading-relaxed max-w-xl">
          Upload a clip, or drag one straight from the sample library. The model
          returns a verdict and confidence score.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-start">
          <SampleLibrary onUse={useSample} />

          <div className="rounded-lg border border-hairline bg-panel/80 backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
              <div className="font-mono text-[10px] tracking-[0.15em] text-muted uppercase truncate">
                {fileName || "No signal loaded"}
              </div>
              <div className="font-mono text-[10px] tracking-[0.15em] uppercase shrink-0 ml-2">
                {state === "idle" && <span className="text-muted">Standing by</span>}
                {state === "analyzing" && <span className="text-idle">Analyzing…</span>}
                {state === "settled" && (
                  <span className={verdict.is_tts ? "text-synthetic" : "text-authentic"}>
                    Verdict locked
                  </span>
                )}
                {state === "error" && <span className="text-synthetic">Error</span>}
              </div>
            </div>

            <div
              className={`m-3 rounded-md border border-dashed px-3 py-4 transition-colors ${
                dragOver ? "border-idle bg-idle/5" : "border-hairline"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <Waveform
                state={state === "settled" ? "settled" : state === "analyzing" ? "analyzing" : "idle"}
                verdict={verdict}
              />

              <div className="mt-3 flex flex-col items-center gap-1.5 text-center">
                {state !== "settled" && (
                  <>
                    <button
                      onClick={() => inputRef.current?.click()}
                      className="rounded-md bg-white/5 hover:bg-white/10 border border-hairline px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-white/90 transition-colors"
                    >
                      Choose file, or drag here
                    </button>
                    <input
                      ref={inputRef}
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => handleFiles(e.target.files)}
                    />
                  </>
                )}
                {state === "error" && (
                  <p className="mt-1 font-mono text-[11px] text-synthetic">{error}</p>
                )}
              </div>
            </div>

            {state === "settled" && verdict && (
              <div className="border-t border-hairline px-4 py-4">
                <VerdictMeter verdict={verdict} />
                <button
                  onClick={reset}
                  className="mt-4 w-full rounded-md border border-hairline px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide text-muted hover:text-white hover:border-white/30 transition-colors"
                >
                  Analyze another clip
                </button>
              </div>
            )}
          </div>
        </div>

        <p className="mt-6 text-center font-mono text-[10px] text-muted/70">
          Demo only — not a forensic-grade determination.
        </p>
      </div>
    </div>
  );
}
