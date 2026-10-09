import {
  checkAppPassword,
  dashscopeJson,
  DEFAULT_TTS_MODEL,
  isAudioTtsModel,
  MAX_TEXT_LENGTH,
  parseDashError,
  requireApiKey,
  resolveBaseUrl,
  resolveMaasBaseUrl,
} from "@/lib/dashscope";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const denied = checkAppPassword(req);
  if (denied) return denied;
  const noKey = requireApiKey();
  if (noKey) return noKey;

  let body: {
    text?: unknown;
    voice?: unknown;
    model?: unknown;
    language?: unknown;
    region?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body harus berupa JSON." }, { status: 400 });
  }

  const text = String(body.text ?? "").trim();
  const voice = String(body.voice ?? "").trim();
  const model = String(body.model ?? "").trim() || DEFAULT_TTS_MODEL;
  const language = String(body.language ?? "Auto");

  if (!text) {
    return Response.json({ error: "Teks tidak boleh kosong." }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return Response.json(
      { error: `Teks maksimal ${MAX_TEXT_LENGTH} karakter (saat ini ${text.length}).` },
      { status: 400 }
    );
  }
  if (!voice) {
    return Response.json({ error: "Nama voice (suara) wajib diisi." }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  let url: string;

  if (isAudioTtsModel(model)) {
    const maasBase = resolveMaasBaseUrl(body.region);
    if (!maasBase) {
      return Response.json(
        {
          error: `DASHSCOPE_WORKSPACE_ID belum diatur. Model ${model} memakai endpoint maas.aliyuncs.com yang wajib menyertakan Workspace ID (konsol Model Studio → pojok kanan atas → Workspace ID). Tambahkan env tersebut di pengaturan project lalu redeploy, atau gunakan model bawaan ${DEFAULT_TTS_MODEL}.`,
        },
        { status: 500 }
      );
    }
    url = `${maasBase}/api/v1/services/audio/tts/SpeechSynthesizer`;
    payload = {
      model,
      input: { text, voice, format: "wav", sample_rate: 24000 },
    };
  } else {
    const input: Record<string, unknown> = { text, voice };
    if (language && language !== "Auto") {
      input.language_type = language;
    }
    url = `${resolveBaseUrl(body.region)}/api/v1/services/aigc/multimodal-generation/generation`;
    payload = { model, input };
  }

  const { ok, status, body: resBody, text: resText } = await dashscopeJson(
    url,
    process.env.DASHSCOPE_API_KEY as string,
    payload
  );
  if (!ok) {
    return Response.json({ error: parseDashError(resText) }, { status });
  }

  const j = resBody as {
    output?: {
      audio?: { url?: string; data?: string; expires_at?: number };
      finish_reason?: string;
    };
  };
  const audioUrl = j?.output?.audio?.url;
  const audioData = j?.output?.audio?.data;

  if (audioUrl) {
    return Response.json({
      audioUrl,
      expiresAt: j?.output?.audio?.expires_at ?? null,
      model,
      characters: text.length,
    });
  }
  if (audioData) {
    return Response.json({ audioBase64: audioData, contentType: "audio/wav", model, characters: text.length });
  }
  return Response.json(
    { error: `Respons tidak berisi audio: ${resText.slice(0, 300)}` },
    { status: 502 }
  );
}
