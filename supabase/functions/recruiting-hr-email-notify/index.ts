import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID") ?? "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET") ?? "";

const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const APP_URL = "https://simulatore-bollette.vercel.app/";

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hasScope(scope: unknown, required: string) {
  return String(scope || "")
    .split(/\s+/)
    .filter(Boolean)
    .includes(required);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function base64UrlUtf8(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function loadExpectedCronSecret() {
  const { data, error } = await db
    .from("recruiting_hr_email_internal_config")
    .select("cron_secret")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data?.cron_secret) {
    throw new Error("Configurazione notifiche email non disponibile.");
  }

  return String(data.cron_secret);
}

async function getGoogleConnection(adminId: number) {
  const { data, error } = await db
    .from("google_calendar_connections")
    .select("*")
    .eq("admin_id", adminId)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function refreshGoogleToken(adminId: number, connection: any) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("Configurazione Google incompleta.");
  }

  if (!connection?.refresh_token) {
    throw new Error("Account Google non collegato.");
  }

  if (!hasScope(connection.scope, GMAIL_SEND_SCOPE)) {
    const err = new Error(
      "Autorizzazione Gmail mancante: ricollegare Google dalla webapp."
    );
    (err as any).code = "gmail_scope_missing";
    throw err;
  }

  const expiresAt = connection.expires_at
    ? new Date(connection.expires_at).getTime()
    : 0;

  if (
    connection.access_token &&
    expiresAt > Date.now() + 60_000
  ) {
    return String(connection.access_token);
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: String(connection.refresh_token),
      grant_type: "refresh_token",
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload?.access_token) {
    throw new Error(
      payload?.error_description ||
        payload?.error ||
        "Impossibile aggiornare l'accesso Google."
    );
  }

  const nextExpiry = new Date(
    Date.now() + Number(payload.expires_in || 3600) * 1000
  ).toISOString();

  const { error: updateError } = await db
    .from("google_calendar_connections")
    .update({
      access_token: payload.access_token,
      token_type: payload.token_type || "Bearer",
      scope: payload.scope || connection.scope,
      expires_at: nextExpiry,
      updated_at: new Date().toISOString(),
    })
    .eq("admin_id", adminId);

  if (updateError) throw updateError;

  return String(payload.access_token);
}

function buildEmail(recipient: string, candidates: any[]) {
  const count = candidates.length;
  const subject =
    `SALA D'ATTESA - ${count} nominativ${count === 1 ? "o" : "i"} IN ARRIVO da lavorare`;

  const rows = candidates
    .slice(0, 25)
    .map((item) => {
      const received = item.received_at
        ? new Date(item.received_at).toLocaleString("it-IT", {
            timeZone: "Europe/Rome",
            dateStyle: "short",
            timeStyle: "short",
          })
        : "";

      return `<li style="margin:0 0 8px 0"><strong>${escapeHtml(item.full_name || "Senza nome")}</strong>${received ? ` · arrivato ${escapeHtml(received)}` : ""}</li>`;
    })
    .join("");

  const more =
    count > 25
      ? `<p>Altri ${count - 25} elementi non mostrati in questa email.</p>`
      : "";

  const html = `
<!doctype html>
<html>
  <body style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.45">
    <h2 style="margin-bottom:8px">Sala d'attesa · IN ARRIVO</h2>
    <p>Ci sono <strong>${count}</strong> element${count === 1 ? "o" : "i"} IN ARRIVO ancora da lavorare.</p>
    <ul style="padding-left:20px">${rows}</ul>
    ${more}
    <p style="margin-top:20px">
      <a href="${APP_URL}" style="display:inline-block;background:#0f766e;color:white;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:700">
        Apri la Sala d'attesa
      </a>
    </p>
    <p style="color:#64748b;font-size:12px">
      Questa email viene inviata ogni ora soltanto finché restano elementi IN ARRIVO da lavorare.
    </p>
  </body>
</html>`.trim();

  const mime = [
    `To: ${recipient}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
  ].join("\r\n");

  return {
    subject,
    raw: base64UrlUtf8(mime),
  };
}

async function sendGmail(adminId: number, recipient: string, candidates: any[]) {
  const connection = await getGoogleConnection(adminId);
  const accessToken = await refreshGoogleToken(adminId, connection);
  const email = buildEmail(recipient, candidates);

  let response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: email.raw }),
    }
  );

  if (response.status === 401) {
    const latestConnection = await getGoogleConnection(adminId);
    if (!latestConnection?.refresh_token) {
      throw new Error("Account Google non collegato.");
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: String(latestConnection.refresh_token),
        grant_type: "refresh_token",
      }),
    });

    const tokenPayload = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenPayload?.access_token) {
      throw new Error("Impossibile rinnovare l'accesso Gmail.");
    }

    response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${String(tokenPayload.access_token)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: email.raw }),
      }
    );
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ||
        `Invio Gmail non riuscito (HTTP ${response.status}).`
    );
  }

  return {
    gmail_message_id: payload?.id || null,
    subject: email.subject,
  };
}

async function logDelivery(
  adminId: number,
  pendingCount: number,
  status: string,
  error = "",
  sentAt: string | null = null
) {
  const { error: logError } = await db
    .from("recruiting_hr_email_delivery_log")
    .insert({
      admin_id: adminId,
      pending_count: pendingCount,
      status,
      error: error.slice(0, 1500),
      sent_at: sentAt,
    });

  if (logError) {
    console.warn("EMAIL DELIVERY LOG ERROR:", logError.message);
  }
}

async function notifyWaitingRoom() {
  const { data: admins, error: adminsError } = await db
    .from("admin_users")
    .select("id,username,email")
    .not("email", "is", null);

  if (adminsError) throw adminsError;

  const results: any[] = [];

  for (const admin of admins || []) {
    const recipient = String(admin.email || "").trim();
    const username = String(admin.username || "").trim();

    if (!recipient || !username) continue;

    const ownerKey = await sha256Hex(
      `recruiting-v1|${String(admin.id)}|${username.toLocaleLowerCase("it")}`
    );

    const { data: pending, error: pendingError } = await db
      .from("recruiting_hr_incoming_candidates")
      .select("id,full_name,received_at")
      .eq("owner_key", ownerKey)
      .eq("status", "pending")
      .order("received_at", { ascending: true });

    if (pendingError) {
      await logDelivery(
        Number(admin.id),
        0,
        "query_error",
        pendingError.message
      );
      results.push({
        admin_id: Number(admin.id),
        status: "query_error",
      });
      continue;
    }

    const candidates = Array.isArray(pending) ? pending : [];
    const pendingCount = candidates.length;

    if (pendingCount === 0) {
      results.push({
        admin_id: Number(admin.id),
        pending_count: 0,
        status: "nothing_to_do",
      });
      continue;
    }

    try {
      const sent = await sendGmail(
        Number(admin.id),
        recipient,
        candidates
      );

      const sentAt = new Date().toISOString();
      await logDelivery(
        Number(admin.id),
        pendingCount,
        "sent",
        "",
        sentAt
      );

      results.push({
        admin_id: Number(admin.id),
        pending_count: pendingCount,
        status: "sent",
        gmail_message_id: sent.gmail_message_id,
      });
    } catch (error: any) {
      const code = String(error?.code || "");
      const message = error?.message || String(error);
      const status =
        code === "gmail_scope_missing"
          ? "gmail_scope_missing"
          : "send_error";

      await logDelivery(
        Number(admin.id),
        pendingCount,
        status,
        message
      );

      results.push({
        admin_id: Number(admin.id),
        pending_count: pendingCount,
        status,
        error: message,
      });
    }
  }

  return results;
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return json({ error: "Metodo non supportato." }, 405);
    }

    const expected = await loadExpectedCronSecret();
    const provided = String(
      req.headers.get("x-hr-email-cron-secret") || ""
    );

    if (!provided || provided !== expected) {
      return json({ error: "Non autorizzato." }, 401);
    }

    const body = await req.json().catch(() => ({}));
    if (String(body?.action || "") !== "cron_notify") {
      return json({ error: "Azione non riconosciuta." }, 400);
    }

    const results = await notifyWaitingRoom();
    return json({ ok: true, results });
  } catch (error: any) {
    console.error("HR EMAIL NOTIFY ERROR:", error);
    return json(
      {
        ok: false,
        error: error?.message || String(error),
      },
      500
    );
  }
});
