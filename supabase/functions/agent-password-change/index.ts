import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";

const APP_ORIGIN = "https://simulatore-bollette.vercel.app";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Headers": "content-type, apikey, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "Metodo non supportato." }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const username = String(body?.username || "").trim().toLowerCase();
    const currentPassword = String(body?.current_password || "");
    const newPassword = String(body?.new_password || "");

    if (!username || !currentPassword || !newPassword) {
      return json(
        { ok: false, error: "Compila username, password attuale e nuova password." },
        400
      );
    }

    if (newPassword.length < 8) {
      return json(
        { ok: false, error: "La nuova password deve contenere almeno 8 caratteri." },
        400
      );
    }

    const { data: loginData, error: loginError } = await db.rpc("agent_login", {
      p_username: username,
      p_password: currentPassword,
    });

    if (loginError || !loginData?.id) {
      return json({ ok: false, error: "Credenziali attuali non valide." }, 401);
    }

    const agentId = Number(loginData.id);

    if (loginData?.token) {
      await db.rpc("agent_logout", {
        p_session_token: String(loginData.token),
      });
    }

    let hash = await bcrypt.hash(newPassword, 12);
    hash = hash.replace(/^\$2[aby]\$/, "$2a$");

    const { error: updateError } = await db
      .from("agents")
      .update({ password: hash })
      .eq("id", agentId);

    if (updateError) {
      throw updateError;
    }

    await db.from("agent_sessions").delete().eq("agent_id", agentId);

    return json({ ok: true });
  } catch (error: any) {
    console.error("AGENT PASSWORD CHANGE ERROR:", error);
    return json(
      { ok: false, error: error?.message || String(error) },
      500
    );
  }
});
