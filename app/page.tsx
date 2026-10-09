"use client";

import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type Region = "cn" | "intl";

type SavedVoice = {
  voice: string;
  name: string;
  model: string;
  region: Region;
  createdAt: number;
};

type AudioResult = { src: string; filename: string; note?: string };

const DEFAULT_MODEL = "qwen3-tts-vc-2026-01-22";
const VOICES_KEY = "qwenttsaudio.voices.v1";
const MAX_AUDIO_MB = 4;
const MAX_TEXT_LENGTH = 600;

const REGION_OPTIONS: { value: Region; label: string }[] = [
  { value: "cn", label: "Tiongkok (Beijing)" },
  { value: "intl", label: "Singapura (Internasional)" },
];

const LANGUAGE_OPTIONS = [
  "Auto",
  "Chinese",
  "English",
  "German",
  "Italian",
  "Portuguese",
  "Spanish",
  "Japanese",
  "Korean",
  "French",
  "Russian",
];

const EXAMPLE_TEXT =
  "Halo! Suara ini dihasilkan oleh Qwen3-TTS dari Alibaba Cloud. Selamat mencoba studio kloning suara ini.";

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export default function Home() {
  const [status, setStatus] = useState<{
    hasKey: boolean;
    passwordRequired: boolean;
  } | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");

  const [region, setRegion] = useState<Region>("cn");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [voices, setVoices] = useState<SavedVoice[]>([]);

  // ==== form kloning ====
  const [cloneMode, setCloneMode] = useState<"upload" | "url">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [audioUrlInput, setAudioUrlInput] = useState("");
  const [voiceName, setVoiceName] = useState("");
  const [cloning, setCloning] = useState(false);
  const [cloneResult, setCloneResult] = useState<string | null>(null);

  // ==== form sintesis ====
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("");
  const [language, setLanguage] = useState("Auto");
  const [generating, setGenerating] = useState(false);
  const [audioResult, setAudioResult] = useState<AudioResult | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const resultAudioRef = useRef<HTMLAudioElement>(null);

  // ---- efek awal: status server + daftar voice tersimpan ----
  useEffect(() => {
    fetch("/api/status")
      .then(async (res) => {
        const j = await res.json().catch(() => null);
        if (j) setStatus({ hasKey: !!j.hasKey, passwordRequired: !!j.passwordRequired });
        setUnlocked(res.ok);
      })
      .catch(() => setStatus({ hasKey: false, passwordRequired: false }));
    try {
      const raw = localStorage.getItem(VOICES_KEY);
      if (raw) setVoices(JSON.parse(raw));
    } catch {
      // abaikan localStorage rusak
    }
  }, []);

  const persistVoices = useCallback((list: SavedVoice[]) => {
    setVoices(list);
    try {
      localStorage.setItem(VOICES_KEY, JSON.stringify(list));
    } catch {
      // penyimpanan penuh / mode privat
    }
  }, []);

  const api = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      if (passwordInput) headers.set("x-app-password", passwordInput);
      const res = await fetch(url, { ...init, headers });
      const j = await res.json().catch(() => ({}));
      if (res.status === 401 && j?.passwordRequired) {
        setUnlocked(false);
        throw new Error(j?.error || "Password akses salah.");
      }
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      return j;
    },
    [passwordInput]
  );

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (passwordInput) headers["x-app-password"] = passwordInput;
      const res = await fetch("/api/status", { headers });
      if (res.ok) {
        setUnlocked(true);
        const j = await res.json().catch(() => null);
        if (j) setStatus({ hasKey: !!j.hasKey, passwordRequired: !!j.passwordRequired });
      } else {
        setError("Password akses salah.");
      }
    } catch {
      setError("Gagal menghubungi server.");
    }
  };

  // ---- preview audio referensi yang diunggah ----
  const [filePreview, setFilePreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setFilePreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onPickFile = (e: ChangeEvent<HTMLInputElement>) => {
    setCloneResult(null);
    const f = e.target.files?.[0] ?? null;
    if (f && f.size > MAX_AUDIO_MB * 1024 * 1024) {
      setError(
        `Ukuran file ${(f.size / 1024 / 1024).toFixed(1)} MB melebihi batas ${MAX_AUDIO_MB} MB. Gunakan mode URL untuk file besar.`
      );
      return;
    }
    setError(null);
    setFile(f);
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    setCloneResult(null);
    if (f.size > MAX_AUDIO_MB * 1024 * 1024) {
      setError(
        `Ukuran file ${(f.size / 1024 / 1024).toFixed(1)} MB melebihi batas ${MAX_AUDIO_MB} MB. Gunakan mode URL untuk file besar.`
      );
      return;
    }
    setError(null);
    setFile(f);
  };

  // ---- aksi kloning ----
  const submitClone = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setCloneResult(null);
    setCloning(true);
    try {
      const fd = new FormData();
      if (cloneMode === "upload" && file) fd.set("audio", file);
      if (cloneMode === "url") fd.set("audioUrl", audioUrlInput);
      fd.set("preferredName", voiceName || "suara-saya");
      fd.set("targetModel", model);
      fd.set("region", region);
      const j = await api("/api/clone", { method: "POST", body: fd });
      const sv: SavedVoice = {
        voice: j.voice,
        name: voiceName || "suara-saya",
        model,
        region,
        createdAt: Date.now(),
      };
      persistVoices([sv, ...voices.filter((v) => v.voice !== sv.voice)].slice(0, 30));
      setCloneResult(j.voice);
      setVoice(j.voice);
      setAudioResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setCloning(false);
    }
  };

  // ---- aksi sintesis ----
  const submitTts = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setAudioResult(null);
    setGenerating(true);
    try {
      const j = await api("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice, model, language, region }),
      });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      if (j.audioUrl) {
        setAudioResult({
          src: j.audioUrl,
          filename: `qwen-tts-${stamp}.mp3`,
          note: "Tautan audio dari DashScope berlaku 24 jam — unduh untuk menyimpan permanen.",
        });
      } else if (j.audioBase64) {
        setAudioResult({
          src: `data:${j.contentType || "audio/mpeg"};base64,${j.audioBase64}`,
          filename: `qwen-tts-${stamp}.mp3`,
        });
      } else {
        throw new Error("Server tidak mengembalikan audio.");
      }
      requestAnimationFrame(() => resultAudioRef.current?.play().catch(() => {}));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setGenerating(false);
    }
  };

  const removeVoice = (v: SavedVoice) => {
    persistVoices(voices.filter((x) => x.voice !== v.voice));
    if (voice === v.voice) setVoice("");
  };

  const copyVoice = async (v: string) => {
    try {
      await navigator.clipboard.writeText(v);
    } catch {
      // clipboard tidak tersedia
    }
  };

  const textOver = text.length > MAX_TEXT_LENGTH;

  if (status && status.passwordRequired && !unlocked) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6">
        <div className="w-full rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur">
          <div className="mb-6 text-center">
            <Logo />
            <h1 className="mt-4 text-xl font-semibold">Akses Terlindungi</h1>
            <p className="mt-1 text-sm text-white/60">
              Masukkan password untuk menggunakan studio ini.
            </p>
          </div>
          <form onSubmit={submitPassword} className="space-y-4">
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Password akses"
              autoFocus
              className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-sm outline-none placeholder:text-white/30 focus:border-violet-400/60"
            />
            {error && <Alert>{error}</Alert>}
            <button
              type="submit"
              className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold transition hover:brightness-110"
            >
              Buka Studio
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-10 sm:px-6">
      <header className="mb-10 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-3">
            <Logo />
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Qwen TTS Audio Studio
            </h1>
          </div>
          <p className="mt-2 max-w-xl text-sm text-white/60">
            Kloning suara dari audio referensi, lalu ubah teks apa pun menjadi suara
            tersebut — didukung <span className="text-white/85">Qwen3-TTS</span> dari
            Alibaba Cloud DashScope.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge>{DEFAULT_MODEL}</Badge>
          <Badge>24 kHz</Badge>
          <Badge>Maks 600 karakter</Badge>
        </div>
      </header>

      {status && !status.hasKey && (
        <div className="mb-6 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          <strong className="font-semibold">DASHSCOPE_API_KEY belum diatur.</strong>{" "}
          Tambahkan environment variable <code className="rounded bg-black/30 px-1">DASHSCOPE_API_KEY</code>{" "}
          di pengaturan project (lokal: <code className="rounded bg-black/30 px-1">.env.local</code>,
          Vercel: Settings → Environment Variables) lalu redeploy.
        </div>
      )}

      {error && (
        <div className="mb-6">
          <Alert>{error}</Alert>
        </div>
      )}

      {voices.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">
            Suara tersimpan (di perangkat ini)
          </h2>
          <div className="flex flex-wrap gap-2">
            {voices.map((v) => (
              <span
                key={v.voice}
                className={`group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
                  voice === v.voice
                    ? "border-violet-400/60 bg-violet-500/20 text-violet-100"
                    : "border-white/10 bg-white/5 text-white/70 hover:border-white/25"
                }`}
                title={`${v.voice} • dibuat ${formatDate(v.createdAt)}`}
              >
                <button
                  type="button"
                  onClick={() => setVoice(v.voice)}
                  className="font-medium"
                >
                  {v.name}
                </button>
                <button
                  type="button"
                  onClick={() => copyVoice(v.voice)}
                  className="text-white/40 transition hover:text-white/90"
                  aria-label="Salin nama voice"
                  title="Salin nama voice"
                >
                  ⧉
                </button>
                <button
                  type="button"
                  onClick={() => removeVoice(v)}
                  className="text-white/40 transition hover:text-red-300"
                  aria-label="Hapus"
                  title="Hapus dari daftar"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ================= KONFIGURASI UMUM + KLONING ================= */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
          <div className="mb-5 flex items-center gap-3">
            <StepNumber n={1} />
            <div>
              <h2 className="font-semibold">Kloning Suara</h2>
              <p className="text-xs text-white/50">
                Unggah 10–20 detik audio suara bersih (WAV/MP3/M4A, mono) untuk membuat
                voice kloningan.
              </p>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-white/60">Region API</span>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value as Region)}
                className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-violet-400/60"
              >
                {REGION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-zinc-900">
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-white/60">Model</span>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-violet-400/60"
              />
              <span className="mt-1.5 block text-[11px] leading-snug text-white/40">
                Biarkan nilai bawaan <code className="text-white/60">{DEFAULT_MODEL}</code>. Nama model lain
                (mis. <code className="text-white/60">qwen-audio-3.0-tts-plus</code> dari skrip Python lama) tidak
                dikenali DashScope.
              </span>
            </label>
          </div>

          <form onSubmit={submitClone} className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-black/30 p-1 text-xs font-medium">
              {(["upload", "url"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setCloneMode(m)}
                  className={`rounded-lg px-3 py-2 transition ${
                    cloneMode === m
                      ? "bg-violet-600/80 text-white shadow"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  {m === "upload" ? "Unggah File" : "URL Audio"}
                </button>
              ))}
            </div>

            {cloneMode === "upload" ? (
              <div>
                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center text-xs transition ${
                    dragOver
                      ? "border-violet-400/70 bg-violet-500/10"
                      : "border-white/20 bg-black/20 hover:border-white/40"
                  }`}
                >
                  <span className="text-sm font-medium text-white/80">
                    {file ? file.name : "Tarik & letakkan audio, atau klik untuk memilih"}
                  </span>
                  <span className="text-white/40">
                    WAV / MP3 / M4A • maks {MAX_AUDIO_MB} MB • 10–20 detik
                  </span>
                  <input
                    type="file"
                    accept="audio/*,.wav,.mp3,.m4a"
                    onChange={onPickFile}
                    className="hidden"
                  />
                </label>
                {filePreview && (
                  <audio
                    controls
                    src={filePreview}
                    className="mt-3 w-full"
                    aria-label="Pratinjau audio referensi"
                  />
                )}
              </div>
            ) : (
              <input
                type="url"
                value={audioUrlInput}
                onChange={(e) => setAudioUrlInput(e.target.value)}
                placeholder="https://contoh.com/suara-saya.mp3"
                className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm outline-none placeholder:text-white/30 focus:border-violet-400/60"
              />
            )}

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-white/60">
                Nama suara (opsional)
              </span>
              <input
                value={voiceName}
                onChange={(e) => setVoiceName(e.target.value)}
                placeholder="mis. suara-saya"
                className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm outline-none placeholder:text-white/30 focus:border-violet-400/60"
              />
            </label>

            <button
              type="submit"
              disabled={cloning || (cloneMode === "upload" ? !file : !audioUrlInput.trim())}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {cloning && <Spinner />}
              {cloning ? "Mengkloning…" : "Buat Suara Kloningan"}
            </button>

            {cloneResult && (
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                <div className="font-semibold">Suara berhasil dibuat</div>
                <div className="mt-1 flex items-center gap-2 break-all font-mono text-xs">
                  {cloneResult}
                  <button
                    type="button"
                    onClick={() => copyVoice(cloneResult)}
                    className="text-emerald-300/70 transition hover:text-emerald-100"
                    title="Salin"
                  >
                    ⧉
                  </button>
                </div>
                <div className="mt-1 text-xs text-emerald-200/70">
                  Sudah otomatis terisi di form sintesis →
                </div>
              </div>
            )}
          </form>
        </section>

        {/* ================= SINTESIS ================= */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
          <div className="mb-5 flex items-center gap-3">
            <StepNumber n={2} />
            <div>
              <h2 className="font-semibold">Sintesis Teks → Suara</h2>
              <p className="text-xs text-white/50">
                Gunakan voice bawaan (mis. <code className="text-white/70">Cherry</code>)
                atau voice hasil kloningan.
              </p>
            </div>
          </div>

          <form onSubmit={submitTts} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-white/60">
                <span>Voice / nama suara</span>
                <span className="font-mono text-white/35">wajib</span>
              </span>
              <input
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                placeholder="mis. hasil kloningan: suara-saya_xxxxxx"
                className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 font-mono text-sm outline-none placeholder:text-white/30 focus:border-violet-400/60"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-white/60">
                <span>Teks yang diucapkan</span>
                <span className={textOver ? "text-red-400" : "text-white/35"}>
                  {text.length}/{MAX_TEXT_LENGTH}
                </span>
              </span>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                placeholder="Tulis teks di sini…"
                className={`w-full resize-y rounded-xl border bg-black/30 px-3 py-2.5 text-sm outline-none placeholder:text-white/30 focus:border-violet-400/60 ${
                  textOver ? "border-red-400/60" : "border-white/15"
                }`}
              />
              <button
                type="button"
                onClick={() => setText(EXAMPLE_TEXT)}
                className="mt-1.5 text-xs text-violet-300/80 transition hover:text-violet-200"
              >
                Isi contoh teks
              </button>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-white/60">
                Bahasa (language_type)
              </span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-violet-400/60"
              >
                {LANGUAGE_OPTIONS.map((l) => (
                  <option key={l} value={l} className="bg-zinc-900">
                    {l}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              disabled={generating || !text.trim() || !voice.trim() || textOver}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-600 to-rose-600 px-4 py-3 text-sm font-semibold transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {generating && <Spinner />}
              {generating ? "Menghasilkan suara…" : "Generate Suara"}
            </button>

            {audioResult && (
              <div className="space-y-3 rounded-xl border border-white/15 bg-black/30 p-4">
                <audio
                  ref={resultAudioRef}
                  controls
                  src={audioResult.src}
                  className="w-full"
                  aria-label="Hasil sintesis suara"
                />
                <div className="flex items-center justify-between gap-3">
                  <a
                    href={audioResult.src}
                    download={audioResult.filename}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium transition hover:bg-white/20"
                  >
                    ⬇ Unduh {audioResult.filename}
                  </a>
                  {audioResult.note && (
                    <span className="text-right text-[11px] leading-tight text-white/40">
                      {audioResult.note}
                    </span>
                  )}
                </div>
              </div>
            )}
          </form>
        </section>
      </div>

      <footer className="mt-12 border-t border-white/10 pt-6 text-xs text-white/40">
        <p>
          Dibuat dengan Next.js • Model <code className="text-white/60">{DEFAULT_MODEL}</code>{" "}
          via DashScope API. Audio referensi: 10–20 detik, WAV/MP3/M4A, jernih tanpa
          noise. API key hanya tersimpan di environment server dan tidak pernah
          dikirim ke browser.
        </p>
      </footer>
    </main>
  );
}

function Logo() {
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-lg font-black text-white shadow-lg shadow-violet-900/40">
      Q
    </span>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm font-bold text-white/80">
      {n}
    </span>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 font-mono text-white/60">
      {children}
    </span>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
  );
}
