import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(JSON.stringify({ error: "Configuración incompleta de Supabase" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { audioUrl, fileName, language } = await req.json();
    if (!audioUrl) {
      return new Response(JSON.stringify({ error: "audioUrl es obligatorio" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsedAudioUrl: URL;
    try {
      parsedAudioUrl = new URL(audioUrl);
    } catch {
      return new Response(JSON.stringify({ error: "audioUrl inválida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseHost = new URL(supabaseUrl).host;
    const allowedPath =
      parsedAudioUrl.pathname.startsWith("/storage/v1/object/public/") ||
      parsedAudioUrl.pathname.startsWith("/storage/v1/object/sign/");
    if (parsedAudioUrl.host !== supabaseHost || !allowedPath) {
      return new Response(JSON.stringify({ error: "Origen de audio no permitido" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: "Falta OPENAI_API_KEY en la Edge Function" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      return new Response(JSON.stringify({ error: `No se pudo descargar el audio (${audioResponse.status})` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contentLength = Number(audioResponse.headers.get("content-length") || "0");
    if (contentLength > MAX_AUDIO_BYTES) {
      return new Response(JSON.stringify({ error: "Audio demasiado grande (máx 25MB)" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contentType = audioResponse.headers.get("content-type") || "audio/webm";
    const ext = contentType.includes("mpeg")
      ? "mp3"
      : contentType.includes("wav")
      ? "wav"
      : contentType.includes("ogg")
      ? "ogg"
      : "webm";
    const finalFileName = fileName || `audio.${ext}`;
    const bytes = await audioResponse.arrayBuffer();
    if (bytes.byteLength > MAX_AUDIO_BYTES) {
      return new Response(JSON.stringify({ error: "Audio demasiado grande (máx 25MB)" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const blob = new Blob([bytes], { type: contentType });

    const form = new FormData();
    form.append("file", blob, finalFileName);
    form.append("model", "whisper-1");
    if (language) {
      form.append("language", language);
    }

    const transcriptionResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
      },
      body: form,
    });

    const raw = await transcriptionResponse.text();
    if (!transcriptionResponse.ok) {
      console.error("Transcription upstream error:", raw.slice(0, 300));
      return new Response(
        JSON.stringify({ error: "Error transcribiendo audio" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { text: "" };
    }

    return new Response(
      JSON.stringify({ text: parsed?.text || "" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: "Error desconocido en transcribe-audio" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
