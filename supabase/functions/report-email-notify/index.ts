import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_ORIGIN = "https://simulatore-bollette.vercel.app";
const REPORT_URL = `${APP_ORIGIN}/?tab=report`;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID") ?? "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET") ?? "";
const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

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

      <div style="margin-top:26px;padding-top:16px;border-top:1px solid #e2e8f0;font-family:Arial,sans-serif;max-width:680px">
        <div style="font-size:20px;line-height:1.15;font-weight:800;color:#244f86">
          Alessio Cedroni
        </div>
        <div style="font-size:17px;line-height:1.2;color:#244f86;margin-top:2px">
          Responsabile Commerciale
        </div>
        <div style="font-size:15px;line-height:1.35;color:#244f86;margin-top:3px">
          Tel. <a href="tel:+393470402901" style="color:#1267c9;text-decoration:underline">3470402901</a>
          &nbsp;·&nbsp;
          <a href="mailto:alessio.cedroni@piuenergia.it" style="color:#1267c9;text-decoration:underline">alessio.cedroni@piuenergia.it</a>
        </div>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:16px;width:100%;max-width:680px">
          <tr>
            <td valign="middle" style="width:205px;padding:8px 14px 8px 0;border-right:1px solid #f3d1b8">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
                <tr>
                  <td valign="middle" style="width:64px;padding-right:10px">
                    <img
                      src="https://www.piuenergia.it/images/resource/sec-img.png?1="
                      alt="+energia"
                      width="58"
                      height="58"
                      style="display:block;width:58px;height:58px;border:0"
                    />
                  </td>
                  <td valign="middle">
                    <div style="font-size:29px;line-height:1;font-weight:900;color:#f9781e;letter-spacing:-1px">
                      +energia
                    </div>
                    <div style="font-size:11px;line-height:1.2;font-style:italic;color:#f9781e;margin-top:5px">
                      L'energia positiva!
                    </div>
                  </td>
                </tr>
              </table>
            </td>

            <td valign="top" style="padding:6px 0 4px 14px;color:#111111;font-size:12px;line-height:1.35">
              <div style="margin-bottom:7px">
                <span style="display:inline-block;background:#f9781e;color:#ffffff;font-weight:800;padding:3px 6px">
                  +energia s.p.a.
                </span>
                <span style="color:#f9781e;font-weight:800;margin-left:5px">
                  www.piuenergia.it
                </span>
              </div>
              <div style="font-weight:800">SEDE LEGALE/AMMINISTRATIVA</div>
              <div><strong>Foligno</strong> | Via Fedeli 2/A - 06034 (PG)</div>
              <div>Tel 074220813 - Fax 0742320349</div>
              <div>Email <em>info@piuenergia.it</em> · P.IVA 01244170526</div>
            </td>
          </tr>
        </table>

        <div style="max-width:680px;margin-top:9px;color:#222222;font-size:11px;font-weight:700;line-height:1.3">
          <strong>Sedi commerciali:</strong>
          Foligno - Milano - Roma - Civitanova Marche - Pescara - Bologna - Avellino - San Cesareo
        </div>

        <div style="max-width:680px;margin-top:7px;color:#7fbe2f;font-size:10px;font-weight:700">
          ♻ Rispetta l'ambiente: se non necessario, non stampare questa mail
        </div>
      </div>
    </div>
  </body>
</html>`.trim();

  const mime = [
    `To: ${recipient}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
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
