import {
  checkAppPassword,
  dashscopeJson,
  DEFAULT_TTS_MODEL,
  ENROLL_MODEL,
  isAudioTtsModel,
  MAX_AUDIO_BYTES,
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

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Body harus berupa multipart form-data." }, { status: 400 });
  }

  const file = form.get("audio");
  const audioUrl = String(form.get("audioUrl") ?? "").trim();
  const preferredName =
    String(form.get("preferredName") ?? "").trim().replace(/[^A-Za-z0-9_]/g, "_") || "suara_saya";
  const targetModel = String(form.get("targetModel") ?? "").trim() || DEFAULT_TTS_MODEL;
  const region = form.get("region");

  let audioData: string;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_AUDIO_BYTES) {
      return Response.json(
        { error: "Ukuran audio maksimal 4 MB saat deploy di Vercel (batas payload serverless). Gunakan mode URL untuk file yang lebih besar." },
        { status: 413 }
      );
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const mime = file.type && file.type.startsWith("audio/") ? file.type : "audio/mpeg";
    audioData = `data:${mime};base64,${buf.toString("base64")}`;
  } else if (/^https?:\/\/\S+$/.test(audioUrl)) {
    audioData = audioUrl;
  } else {
    return Response.json(
      { error: "Unggah file audio atau masukkan URL audio publik yang valid." },
      { status: 400 }
    );
  }

  let payload: Record<string, unknown>;
  let url: string;
  let languageHints = "";

  if (isAudioTtsModel(targetModel)) {
    const maasBase = resolveMaasBaseUrl(region);
    if (!maasBase) {
      return Response.json(
        {
          error: `DASHSCOPE_WORKSPACE_ID belum diatur. Model ${targetModel} memakai endpoint maas.aliyuncs.com yang wajib menyertakan Workspace ID (konsol Model Studio → pojok kanan atas → Workspace ID). Tambahkan env tersebut di pengaturan project lalu redeploy, atau gunakan model bawaan ${DEFAULT_TTS_MODEL}.`,
        },
        { status: 500 }
      );
    }
    // prefix maas: hanya huruf & angka, maksimal 10 karakter
    const prefix = preferredName.replace(/[^A-Za-z0-9]/g, "").slice(0, 10) || "myvoice";
    languageHints = String(form.get("languageHints") ?? "id").trim() || "id";
    payload = {
      model: "voice-enrollment",
      input: {
        action: "create_voice",
        target_model: targetModel,
        prefix,
        url: audioData,
        language_hints: [languageHints],
      },
    };
    url = `${maasBase}/api/v1/services/audio/tts/customization`;
  } else {
    payload = {
      model: ENROLL_MODEL,
      input: {
        action: "create",
        target_model: targetModel,
        preferred_name: preferredName,
        audio: { data: audioData },
      },
    };
    url = `${resolveBaseUrl(region)}/api/v1/services/audio/tts/customization`;
  }

  const { ok, status, body, text } = await dashscopeJson(
    url,
    process.env.DASHSCOPE_API_KEY as string,
    payload
  );
  if (!ok) {
    return Response.json({ error: parseDashError(text) }, { status });
  }

  const voice =
    (body as { output?: { voice?: string; voice_id?: string } })?.output?.voice ??
    (body as { output?: { voice_id?: string } })?.output?.voice_id ??
    "";
  if (!voice) {
    return Response.json(
      { error: `Respons tidak terduga dari DashScope: ${text.slice(0, 300)}` },
      { status: 502 }
    );
  }
  return Response.json({ voice, targetModel, languageHints: languageHints || undefined });
}
