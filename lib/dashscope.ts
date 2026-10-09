export const REGIONS = {
  cn: "https://dashscope.aliyuncs.com",
  intl: "https://dashscope-intl.aliyuncs.com",
} as const;

export type Region = keyof typeof REGIONS;

export const DEFAULT_TTS_MODEL = "qwen3-tts-vc-2026-01-22";
export const ENROLL_MODEL = "qwen-voice-enrollment";
export const MAX_TEXT_LENGTH = 600;
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024; // batas payload Vercel ~4.5MB

export function resolveBaseUrl(region: unknown): string {
  if (region === "intl") return REGIONS.intl;
  if (region === "cn") return REGIONS.cn;
  return process.env.DASHSCOPE_REGION === "intl" ? REGIONS.intl : REGIONS.cn;
}

export function checkAppPassword(req: Request): Response | null {
  const required = process.env.APP_ACCESS_PASSWORD;
  if (!required) return null;
  if (req.headers.get("x-app-password") === required) return null;
  return Response.json(
    { error: "Password akses salah.", passwordRequired: true },
    { status: 401 }
  );
}

export function requireApiKey(): Response | null {
  if (process.env.DASHSCOPE_API_KEY) return null;
  return Response.json(
    { error: "DASHSCOPE_API_KEY belum diatur di environment server." },
    { status: 500 }
  );
}

export function parseDashError(text: string): string {
  try {
    const j = JSON.parse(text);
    const msg =
      j?.message ??
      j?.error?.message ??
      j?.code ??
      j?.output?.message;
    const reqId = j?.request_id ? ` (request_id: ${j.request_id})` : "";
    if (msg) {
      const raw = typeof msg === "string" ? msg : JSON.stringify(msg);
      if (/no pipeline for/i.test(raw)) {
        return `${raw}${reqId} — nama model tidak dikenali DashScope. Biarkan kolom Model pada nilai bawaan (${DEFAULT_TTS_MODEL}); nama model lama seperti "qwen-audio-3.0-tts-plus" bukan model kloning yang valid.`;
      }
      return `${raw}${reqId}`;
    }
  } catch {
    // respons bukan JSON
  }
  return text.slice(0, 300) || `HTTP error`;
}

export async function dashscopeJson(
  url: string,
  apiKey: string,
  payload: unknown
): Promise<{ ok: boolean; status: number; body: unknown; text: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // respons biner / non-JSON
  }
  return { ok: res.ok, status: res.status, body, text };
}
