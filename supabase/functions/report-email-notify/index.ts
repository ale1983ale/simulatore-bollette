import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_ORIGIN = "https://simulatore-bollette.vercel.app";
const REPORT_URL = `${APP_ORIGIN}/?tab=report`;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID") ?? "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET") ?? "";
const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const REPORT_SIGNATURE_BASE64 = "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[... ELLIPSIZATION ...]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";

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
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
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

function isValidEmail(value: unknown) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function normalizePersonName(value: unknown) {
  return String(value || "")
    .trim()
    .toLocaleUpperCase("it")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
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

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64UrlUtf8(value: string) {
  return bytesToBase64(new TextEncoder().encode(value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function encodeHeader(value: string) {
  return `=?UTF-8?B?${bytesToBase64(new TextEncoder().encode(value))}?=`;
}

function wrapMimeBase64(value: string) {
  return value.match(/.{1,76}/g)?.join("\r\n") || "";
}

async function validateAdmin(sessionToken: string) {
  if (!sessionToken) {
    const error = new Error("Sessione admin mancante.");
    (error as any).status = 401;
    throw error;
  }

  const tokenHash = await sha256Hex(sessionToken);
  const { data: session, error: sessionError } = await db
    .from("admin_sessions")
    .select("admin_id,expires_at")
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (sessionError || !session?.admin_id) {
    const error = new Error("Sessione admin non valida o scaduta.");
    (error as any).status = 401;
    throw error;
  }

  const { data: admin, error: adminError } = await db
    .from("admin_users")
    .select("id,username,nome,cognome,email,role,full_access")
    .eq("id", Number(session.admin_id))
    .maybeSingle();

  if (adminError || !admin?.id || !admin?.username) {
    const error = new Error("Profilo admin non disponibile.");
    (error as any).status = 401;
    throw error;
  }

  if (String(admin.role || "") !== "super_admin" && admin.full_access !== true) {
    const error = new Error("Permessi insufficienti per le notifiche Report.");
    (error as any).status = 403;
    throw error;
  }

  await db
    .from("admin_sessions")
    .update({ last_used_at: new Date().toISOString() })
    .eq("token_hash", tokenHash);

  return admin;
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

async function refreshGoogleToken(adminId: number, force = false) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("Configurazione Google incompleta.");
  }

  const connection = await getGoogleConnection(adminId);
  if (!connection?.refresh_token) {
    throw new Error("Account Google non collegato.");
  }

  if (!hasScope(connection.scope, GMAIL_SEND_SCOPE)) {
    const error = new Error(
      "Autorizzazione Gmail mancante: ricollega Google dalla webapp."
    );
    (error as any).code = "gmail_scope_missing";
    throw error;
  }

  const expiresAt = connection.expires_at
    ? new Date(connection.expires_at).getTime()
    : 0;

  if (!force && connection.access_token && expiresAt > Date.now() + 60_000) {
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

function buildEmail(
  recipient: string,
  subject: string,
  body: string,
  credentials?: { username: string; setupUrl: string } | null
) {
  const messageHtml = escapeHtml(body).replace(/\r?\n/g, "<br>");
  const credentialsHtml = credentials
    ? `
      <div style="margin:22px 0;padding:15px;border:1px solid #fed7aa;border-radius:10px;background:#fff7ed">
        <div style="font-weight:900;color:#9a3412;margin-bottom:7px">CREDENZIALI AREA REPORT</div>
        <div>Username: <strong>${escapeHtml(credentials.username)}</strong></div>
        <div style="margin-top:10px">
          <a href="${escapeHtml(credentials.setupUrl)}" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:800">
            IMPOSTA / CAMBIA PASSWORD
          </a>
        </div>
        <div style="margin-top:8px;color:#78716c;font-size:12px">
          Link personale valido 72 ore e utilizzabile una sola volta.
        </div>
      </div>
    `
    : "";

  const html = `
<!doctype html>
<html>
  <body style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5">
    <div style="max-width:680px;margin:0 auto">
      <div style="font-size:22px;font-weight:800;color:#0f2d69;margin-bottom:18px">+ENERGIA · REPORT</div>
      <div style="font-size:15px">${messageHtml}</div>

      <div style="margin:22px 0 10px 0">
        <a href="${REPORT_URL}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:underline;padding:14px 22px;border-radius:9px;font-weight:900;font-size:20px;letter-spacing:.2px">
          COMPILA IL REPORT
        </a>
      </div>

      <p style="margin:0 0 28px 0;color:#64748b;font-size:12px">
        Il pulsante apre direttamente l'area Report. Se non sei già autenticato, effettua l'accesso agente e verrai portato al Report.
      </p>

      <div style="margin-top:30px;padding-top:18px;border-top:1px solid #e2e8f0">
        ${credentialsHtml}
      </div>

      <div style="margin-top:28px">
        <img
          src="cid:report-signature"
          alt="Firma Alessio Cedroni +Energia"
          width="720"
          style="display:block;width:100%;max-width:720px;height:auto;border:0;outline:none;text-decoration:none"
        />
      </div>
    </div>
  </body>
</html>`.trim();

  const relatedBoundary =
    "----=_ReportRelated_" + crypto.randomUUID().replaceAll("-", "");

  const mime = [
    `To: ${recipient}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/related; boundary="${relatedBoundary}"`,
    "",
    `--${relatedBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    "",
    `--${relatedBoundary}`,
    'Content-Type: image/jpeg; name="firma-alessio-cedroni.jpg"',
    "Content-Transfer-Encoding: base64",
    'Content-Disposition: inline; filename="firma-alessio-cedroni.jpg"',
    "Content-ID: <report-signature>",
    "X-Attachment-Id: report-signature",
    "",
    wrapMimeBase64(REPORT_SIGNATURE_BASE64),
    "",
    `--${relatedBoundary}--`,
    "",
  ].join("\r\n");

  return base64UrlUtf8(mime);
}

async function sendOne(
  adminId: number,
  recipient: string,
  subject: string,
  body: string,
  accessToken: string,
  credentials?: { username: string; setupUrl: string } | null
) {
  const raw = buildEmail(
    recipient,
    subject,
    body,
    credentials
  );

  let response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    }
  );

  if (response.status === 401) {
    accessToken = await refreshGoogleToken(adminId, true);
    response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
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
    accessToken,
    gmailMessageId: String(payload?.id || ""),
  };
}

async function getReportRecipients(admin: any) {
  const ownerKey = await sha256Hex(
    `${admin.id}|${String(admin.username).trim().toLowerCase()}|email-recipient-sync-v2`
  );

  const [{ data, error }, agentsResult] = await Promise.all([
    db
      .from("email_recipient_lists")
      .select("recipients")
      .eq("owner_key", ownerKey)
      .maybeSingle(),
    db
      .from("agents")
      .select("id,nome,cognome,username,owner_admin_id")
      .order("nome", { ascending: true }),
  ]);

  if (error) throw error;
  if (agentsResult.error) throw agentsResult.error;

  const agentRows = Array.isArray(agentsResult.data)
    ? agentsResult.data
    : [];
  const agentsById = new Map<number, any>();
  const agentsByName = new Map<string, any>();

  for (const agent of agentRows) {
    const id = Number(agent?.id || 0);
    if (id) agentsById.set(id, agent);

    const key = normalizePersonName(
      `${String(agent?.nome || "")} ${String(agent?.cognome || "")}`
    );
    if (key && !agentsByName.has(key)) {
      agentsByName.set(key, agent);
    }
  }

  const raw = Array.isArray(data?.recipients) ? data.recipients : [];
  const seen = new Set<string>();
  const recipients: Array<{
    agenzia: string;
    email: string;
    agent_id: number | null;
    username: string;
  }> = [];

  for (const item of raw) {
    const email = String(item?.email || "").trim();
    const key = email.toLowerCase();
    if (item?.report_notify !== true || !isValidEmail(email) || seen.has(key)) {
      continue;
    }

    const agenzia = String(item?.agenzia || "").trim();
    const explicitAgentId = Number(item?.agent_id || 0);
    const matchedAgent =
      (explicitAgentId
        ? agentsById.get(explicitAgentId)
        : null) ||
      agentsByName.get(normalizePersonName(agenzia)) ||
      null;

    seen.add(key);
    recipients.push({
      agenzia,
      email,
      agent_id: matchedAgent?.id
        ? Number(matchedAgent.id)
        : null,
      username: String(matchedAgent?.username || ""),
    });
  }

  return recipients;
}

async function createAgentSetupLink(
  adminId: number,
  agentId: number
) {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);

  await db
    .from("agent_password_reset_tokens")
    .delete()
    .eq("agent_id", agentId)
    .is("used_at", null);

  const expiresAt = new Date(
    Date.now() + 72 * 60 * 60 * 1000
  ).toISOString();

  const { error } = await db
    .from("agent_password_reset_tokens")
    .insert({
      token_hash: tokenHash,
      agent_id: agentId,
      created_by_admin_id: adminId,
      expires_at: expiresAt,
    });

  if (error) throw error;

  return {
    tokenHash,
    setupUrl: `${APP_ORIGIN}/?agent-reset=${encodeURIComponent(token)}`,
  };
}

async function listData(admin: any) {
  const adminId = Number(admin.id);
  const [{ data: templates, error: templatesError }, { data: history, error: historyError }, recipients] =
    await Promise.all([
      db
        .from("report_notification_templates")
        .select("id,name,subject,body,created_at,updated_at")
        .eq("admin_id", adminId)
        .order("updated_at", { ascending: false }),
      db
        .from("report_notification_history")
        .select("id,template_id,subject,body,recipients,recipient_count,success_count,failure_count,credentials_included,status,error,sent_at,created_at")
        .eq("admin_id", adminId)
        .order("created_at", { ascending: false })
        .limit(50),
      getReportRecipients(admin),
    ]);

  if (templatesError) throw templatesError;
  if (historyError) throw historyError;

  return {
    templates: templates || [],
    history: history || [],
    recipients: recipients || [],
  };
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
    const admin = await validateAdmin(String(body?.session_token || ""));
    const adminId = Number(admin.id);
    const action = String(body?.action || "");

    if (action === "list") {
      const data = await listData(admin);
      return json({ ok: true, ...data });
    }

    if (action === "save_template") {
      const name = String(body?.name || "").trim();
      const subject = String(body?.subject || "").trim();
      const message = String(body?.body || "").trim();
      const templateId = Number(body?.template_id || 0);

      if (!name || !subject || !message) {
        return json(
          { ok: false, error: "Nome modello, oggetto e messaggio sono obbligatori." },
          400
        );
      }

      let query;
      if (templateId) {
        query = db
          .from("report_notification_templates")
          .update({
            name,
            subject,
            body: message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", templateId)
          .eq("admin_id", adminId)
          .select("id,name,subject,body,created_at,updated_at")
          .maybeSingle();
      } else {
        query = db
          .from("report_notification_templates")
          .insert({
            admin_id: adminId,
            name,
            subject,
            body: message,
          })
          .select("id,name,subject,body,created_at,updated_at")
          .single();
      }

      const { data, error } = await query;
      if (error) {
        if (String((error as any)?.code || "") === "23505") {
          return json(
            { ok: false, error: "Esiste già un modello con questo nome." },
            409
          );
        }
        throw error;
      }
      if (!data) {
        return json({ ok: false, error: "Modello non trovato." }, 404);
      }

      return json({ ok: true, template: data });
    }

    if (action === "delete_template") {
      const templateId = Number(body?.template_id || 0);
      if (!templateId) {
        return json({ ok: false, error: "Modello non valido." }, 400);
      }

      const { error } = await db
        .from("report_notification_templates")
        .delete()
        .eq("id", templateId)
        .eq("admin_id", adminId);

      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "send") {
      const subject = String(body?.subject || "").trim();
      const message = String(body?.body || "").trim();
      const templateId = Number(body?.template_id || 0) || null;
      const includeCredentials = body?.include_credentials === true;
      const requested = Array.isArray(body?.selected_emails)
        ? body.selected_emails.map((value: unknown) => String(value || "").trim().toLowerCase())
        : [];
      const requestedSet = new Set(requested.filter(Boolean));

      if (!subject || !message) {
        return json({ ok: false, error: "Oggetto e messaggio sono obbligatori." }, 400);
      }

      const eligible = await getReportRecipients(admin);
      const recipients = requestedSet.size
        ? eligible.filter((item) => requestedSet.has(item.email.toLowerCase()))
        : eligible;

      if (!recipients.length) {
        return json(
          { ok: false, error: "Nessun agente abilitato alla notifica Report con email valida." },
          400
        );
      }

      if (includeCredentials) {
        const missingAccounts = recipients.filter(
          (item) => !item.agent_id || !item.username
        );

        if (missingAccounts.length) {
          return json(
            {
              ok: false,
              error:
                "Non riesco ad associare un account Report a: " +
                missingAccounts
                  .map((item) => item.agenzia || item.email)
                  .join(", ") +
                ". Verifica che il nome nel Controllo abbinamento email corrisponda al nome e cognome dell'agente.",
            },
            400
          );
        }
      }

      let accessToken = await refreshGoogleToken(adminId);
      const successful: Array<{ agenzia: string; email: string; gmail_message_id: string }> = [];
      const failed: Array<{ agenzia: string; email: string; error: string }> = [];

      for (const recipient of recipients) {
        let resetTokenHash = "";

        try {
          let credentials:
            | { username: string; setupUrl: string }
            | null = null;

          if (
            includeCredentials &&
            recipient.agent_id &&
            recipient.username
          ) {
            const reset = await createAgentSetupLink(
              adminId,
              recipient.agent_id
            );
            resetTokenHash = reset.tokenHash;
            credentials = {
              username: recipient.username,
              setupUrl: reset.setupUrl,
            };
          }

          const sent = await sendOne(
            adminId,
            recipient.email,
            subject,
            message,
            accessToken,
            credentials
          );
          accessToken = sent.accessToken;
          successful.push({
            ...recipient,
            gmail_message_id: sent.gmailMessageId,
          });
        } catch (error: any) {
          if (resetTokenHash) {
            await db
              .from("agent_password_reset_tokens")
              .delete()
              .eq("token_hash", resetTokenHash);
          }

          failed.push({
            ...recipient,
            error: String(error?.message || error).slice(0, 500),
          });
        }
      }

      const status =
        failed.length === 0
          ? "sent"
          : successful.length > 0
            ? "partial"
            : "failed";
      const sentAt = successful.length ? new Date().toISOString() : null;
      const historyRecipients = recipients.map((item) => ({
        agenzia: item.agenzia,
        email: item.email,
      }));

      const { data: history, error: historyError } = await db
        .from("report_notification_history")
        .insert({
          admin_id: adminId,
          template_id: templateId,
          subject,
          body: message,
          recipients: historyRecipients,
          recipient_count: recipients.length,
          success_count: successful.length,
          failure_count: failed.length,
          credentials_included: includeCredentials,
          status,
          error: failed.map((item) => `${item.email}: ${item.error}`).join(" | ").slice(0, 3000),
          sent_at: sentAt,
        })
        .select("id,template_id,subject,body,recipients,recipient_count,success_count,failure_count,credentials_included,status,error,sent_at,created_at")
        .single();

      if (historyError) throw historyError;

      return json({
        ok: successful.length > 0,
        status,
        recipient_count: recipients.length,
        success_count: successful.length,
        failure_count: failed.length,
        credentials_included: includeCredentials,
        successful,
        failed,
        history,
      }, successful.length > 0 ? 200 : 502);
    }

    return json({ ok: false, error: "Azione non riconosciuta." }, 400);
  } catch (error: any) {
    console.error("REPORT EMAIL NOTIFY ERROR:", error);
    return json(
      { ok: false, error: error?.message || String(error) },
      Number(error?.status || 500)
    );
  }
});
