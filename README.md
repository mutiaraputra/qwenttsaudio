# Qwen TTS Audio Studio

Web studio **kloning suara (voice cloning)** dan **text-to-speech** berbasis **Qwen3-TTS** dari Alibaba Cloud DashScope. Unggah 10–20 detik audio referensi, buat voice kloningan, lalu ubah teks apa pun menjadi suara tersebut — semuanya dari browser.

> Dikembangkan dari skrip `app.py` (contoh SDK Python) menjadi aplikasi web full-stack yang siap deploy ke Vercel.

## Fitur

- **Kloning suara** — unggah file audio (atau tempel URL audio publik), beri nama, dapat voice kloningan.
- **Sintesis teks → suara** — hingga 600 karakter per permintaan, pilihan bahasa (`language_type`).
- **Riwayat voice** — voice yang pernah Anda buat tersimpan di browser (localStorage).
- **Dua region API** — Tiongkok (Beijing) dan Singapura (Internasional), bisa dipilih di UI.
- **Proteksi opsional** — password akses situs via env `APP_ACCESS_PASSWORD` (agar orang lain tidak memakai kuota API key Anda).
- **API key aman** — hanya tersimpan di environment server, tidak pernah dikirim ke browser.

## Tumpukan teknologi

| Lapisan | Teknologi |
| --- | --- |
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS 4 |
| Backend | Next.js Route Handlers (Node.js runtime, serverless) |
| API eksternal | DashScope `qwen-voice-enrollment` + `qwen3-tts-vc-2026-01-22` |

## Cara kerja API (DashScope)

1. **Kloning suara** — `POST /api/v1/services/audio/tts/customization`
   ```json
   {
     "model": "qwen-voice-enrollment",
     "input": {
       "action": "create",
       "target_model": "qwen3-tts-vc-2026-01-22",
       "preferred_name": "suara-saya",
       "audio": { "data": "data:audio/mpeg;base64,..." }
     }
   }
   ```
   Respons: `output.voice` (nama voice kloningan).

2. **Sintesis** — `POST /api/v1/services/aigc/multimodal-generation/generation`
   ```json
   {
     "model": "qwen3-tts-vc-2026-01-22",
     "input": { "text": "Halo dunia", "voice": "NAMA_VOICE" }
   }
   ```
   Respons: JSON berisi `output.audio.url` (berlaku 24 jam) atau data audio base64.

Endpoint aplikasi:

| Route | Fungsi |
| --- | --- |
| `GET /api/status` | Cek status API key & proteksi password |
| `POST /api/clone` | Kloning suara (multipart: `audio` / `audioUrl`, `preferredName`, `targetModel`, `region`) |
| `POST /api/tts` | Sintesis (JSON: `text`, `voice`, `model`, `language`, `region`) |

## Menjalankan secara lokal

```bash
npm install
cp .env.example .env.local   # lalu isi DASHSCOPE_API_KEY
npm run dev                  # http://localhost:3000
```

## Deploy ke Vercel

1. Push repo ini ke GitHub.
2. Di [vercel.com](https://vercel.com), **Add New → Project** dan pilih repo ini (framework terdeteksi otomatis sebagai Next.js).
3. Tambahkan **Environment Variables**:
   - `DASHSCOPE_API_KEY` (wajib) — dari [Model Studio Alibaba Cloud](https://modelstudio.console.alibabacloud.com/) (global) atau [Bailian](https://bailian.console.aliyun.com/) (Tiongkok). Kunci global **hanya berlaku** di region Internasional; kunci Bailian hanya di Tiongkok — jika salah, muncul "Invalid API-key".
   - `APP_ACCESS_PASSWORD` (opsional, disarankan untuk deployment publik).
   - `DASHSCOPE_REGION` (opsional) — `cn` atau `intl`.
4. **Deploy**.

Atau via CLI:

```bash
npx vercel login
npx vercel link
npx vercel env add DASHSCOPE_API_KEY
npx vercel --prod
```

### Batasan Vercel

- Payload request serverless maks ~4,5 MB → unggahan audio dibatasi **4 MB**. Untuk audio referensi lebih besar, gunakan **mode URL audio**.
- Durasi fungsi diatur 60 detik (`maxDuration`) — cukup untuk sintesis ≤600 karakter.

## Tips hasil kloning terbaik

- Audio referensi 10–20 detik, suara jernih **tanpa musik/noise latar**.
- Format WAV (16-bit), MP3, atau M4A; disarankan mono.
- Satu pembicara, volume konsisten.

## Skrip legacy

`app.py` adalah contoh awal pemakaian SDK Python `dashscope` (CLI). Aplikasi web ini menggantikan fungsinya dengan alur dua langkah yang setara via HTTP API.
