import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { XMLParser } from "npm:fast-xml-parser@4.5.3";

const APP_ORIGIN = "https://simulatore-bollette.vercel.app";
const CRM_ORIGIN = "https://www.crm.piuenergiaelettrica.it";
const CRM_LOGIN_URL = `${CRM_ORIGIN}/login.php?lang=it`;
const CRM_AGENDA_URL =
  `${CRM_ORIGIN}/0384710897340/data/data01/php/get_agenda.php`;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID") ?? "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET") ?? "";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar";
const GOOGLE_TIME_ZONE = "Europe/Rome";
const CRM_GOOGLE_CALENDAR = {
  name: "CRM +ENERGIA",
  backgroundColor: "#ea580c",
  foregroundColor: "#ffffff",
};

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Headers":
    "content-type, apikey, authorization, x-crm-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders,
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

async function validateAdmin(sessionToken: string) {
  if (!sessionToken) throw new Error("Sessione admin mancante.");

  const { data, error } = await db.rpc("admin_session_profile", {
    p_session_token: sessionToken,
  });

  if (error || !data?.id || !data?.username) {
    throw new Error("Sessione admin non valida o scaduta.");
  }

  if (String(data.role || "") !== "super_admin") {
    throw new Error(
      "La gestione CRM è disponibile solo al super amministratore."
    );
  }

  const ownerKey = await sha256Hex(
    `recruiting-v1|${String(data.id)}|${String(
      data.username
    ).toLocaleLowerCase("it")}`
  );

  return {
    id: Number(data.id),
    username: String(data.username),
    role: String(data.role || ""),
    ownerKey,
  };
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + 0x8000, bytes.length))
    );
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

let credentialKeyPromise: Promise<CryptoKey> | null = null;

async function credentialKey() {
  if (!credentialKeyPromise) {
    credentialKeyPromise = (async () => {
      const material = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          `${SERVICE_ROLE_KEY}|recruiting-crm-credentials-v1`
        )
      );
      return crypto.subtle.importKey(
        "raw",
        material,
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"]
      );
    })();
  }
  return credentialKeyPromise;
}

async function encryptSecret(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await credentialKey(),
    new TextEncoder().encode(value)
  );

  return `${bytesToBase64(iv)}.${bytesToBase64(
    new Uint8Array(encrypted)
  )}`;
}

async function decryptSecret(value: string) {
  const [ivText, encryptedText] = String(value || "").split(".");
  if (!ivText || !encryptedText) {
    throw new Error("Credenziali CRM non leggibili.");
  }

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivText) },
    await credentialKey(),
    base64ToBytes(encryptedText)
  );

  return new TextDecoder().decode(decrypted);
}

function maskUsername(value: string) {
  const text = String(value || "").trim();
  if (!text) return "";

  const at = text.indexOf("@");
  if (at > 0) {
    const local = text.slice(0, at);
    const domain = text.slice(at + 1);
    return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
  }

  if (text.length <= 3) return "***";
  return `${text.slice(0, 2)}***${text.slice(-1)}`;
}

type CookieJar = Map<string, string>;

function cookieHeader(jar: CookieJar) {
  return Array.from(jar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function setCookiesFromResponse(response: Response, jar: CookieJar) {
  const headers: any = response.headers;
  let values: string[] = [];

  if (typeof headers.getSetCookie === "function") {
    values = headers.getSetCookie();
  } else {
    const one = response.headers.get("set-cookie");
    if (one) values = [one];
  }

  for (const line of values) {
    const first = String(line || "").split(";")[0];
    const eq = first.indexOf("=");
    if (eq <= 0) continue;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (name) jar.set(name, value);
  }
}

async function fetchWithJar(
  url: string,
  init: RequestInit,
  jar: CookieJar
) {
  let currentUrl = url;
  let method = String(init.method || "GET").toUpperCase();
  let body = init.body;
  const baseHeaders = new Headers(init.headers || {});

  for (let redirectCount = 0; redirectCount < 6; redirectCount += 1) {
    const headers = new Headers(baseHeaders);
    const cookie = cookieHeader(jar);
    if (cookie) headers.set("Cookie", cookie);

    const response = await fetch(currentUrl, {
      ...init,
      method,
      body,
      headers,
      redirect: "manual",
    });

    setCookiesFromResponse(response, jar);

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) return response;

    currentUrl = new URL(location, currentUrl).toString();

    if (
      response.status === 303 ||
      ((response.status === 301 || response.status === 302) &&
        method === "POST")
    ) {
      method = "GET";
      body = undefined;
      baseHeaders.delete("Content-Type");
    }
  }

  throw new Error("Troppi reindirizzamenti durante il login CRM.");
}

async function crmLoginAndAgenda(
  username: string,
  password: string,
  ccodsog: string
) {
  const jar: CookieJar = new Map();

  const commonHeaders = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153 Safari/537.36",
  };

  const loginResponse = await fetchWithJar(
    CRM_LOGIN_URL,
    {
      method: "POST",
      headers: {
        ...commonHeaders,
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: CRM_ORIGIN,
        Referer: `${CRM_ORIGIN}/login.php`,
      },
      body: new URLSearchParams({
        email: username,
        password,
      }),
    },
    jar
  );

  await loginResponse.text().catch(() => "");

  if (jar.size === 0) {
    throw new Error(
      "Il CRM non ha restituito una sessione. Verifica username e password."
    );
  }

  const agendaUrl = new URL(CRM_AGENDA_URL);
  agendaUrl.searchParams.set("ccodsog", ccodsog || "17");
  agendaUrl.searchParams.set("etc", String(Date.now()));

  const agendaResponse = await fetchWithJar(
    agendaUrl.toString(),
    {
      method: "GET",
      headers: {
        ...commonHeaders,
        Accept: "application/xml,text/xml,text/html;q=0.9,*/*;q=0.8",
        Referer:
          `${CRM_ORIGIN}/0384710897340/data/data01/tbt-agenda-01.php?lang=it&jscd_mobile=false`,
      },
    },
    jar
  );

  const agendaText = await agendaResponse.text();

  if (
    !agendaResponse.ok ||
    /<form[^>]+login|name=["']email["']|name=["']password["']/i.test(
      agendaText
    )
  ) {
    throw new Error(
      "Accesso CRM non riuscito oppure sessione scaduta. Verifica le credenziali."
    );
  }

  if (!/<data[\s>]/i.test(agendaText)) {
    throw new Error(
      "Il CRM ha risposto, ma il formato Agenda non è quello previsto."
    );
  }

  return agendaText;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,
  parseAttributeValue: false,
  processEntities: true,
});

function parseCrmDateTime(value: unknown) {
  const text = String(value || "").trim();
  const match = text.match(
    /^(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2})(?::\d{2})?)?/
  );

  return {
    date: match?.[1] || null,
    time: match?.[2] || null,
  };
}

async function parseAgenda(xml: string) {
  const parsed = xmlParser.parse(xml);
  const raw = parsed?.data?.event;
  const events = raw ? (Array.isArray(raw) ? raw : [raw]) : [];

  const normalized = [];

  for (const item of events) {
    const id = String(item?.id || "").trim();
    if (!id) continue;

    const start = parseCrmDateTime(item?.start_date);
    const end = parseCrmDateTime(item?.end_date);

    const normalizedItem = {
      crm_event_id: id,
      title: String(item?.text || "").trim(),
      notes: String(item?.adeseve || "").trim(),
      client_name: String(item?.aragsoccliente || "").trim(),
      assigned_to: String(item?.aragsocagente || "").trim(),
      crm_color: String(item?.color || "").trim(),
      cause_code: String(item?.ccaueve || "").trim(),
      start_date: start.date,
      start_time: start.time,
      end_date: end.date,
      end_time: end.time,
    };

    normalized.push({
      ...normalizedItem,
      content_hash: await sha256Hex(JSON.stringify(normalizedItem)),
    });
  }

  return normalized;
}

function cleanHtmlText(value: unknown) {
  const raw = String(value || "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(div|p|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code) => {
      const value = Number(code);
      return Number.isFinite(value) ? String.fromCharCode(value) : "";
    });

  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function addDaysKey(dateKey: string, days: number) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}

function addMinutesLocal(dateKey: string, time: string, minutes: number) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  const [hour, minute] = String(time || "00:00").split(":").map(Number);
  const value = new Date(
    Date.UTC(year, month - 1, day, hour, minute + minutes)
  );
  return {
    date: value.toISOString().slice(0, 10),
    time: value.toISOString().slice(11, 16),
  };
}

function hasGoogleCalendarScope(scope: unknown) {
  return String(scope || "")
    .split(/\s+/)
    .filter(Boolean)
    .includes(GOOGLE_SCOPE);
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
    throw new Error("Configurazione Google Calendar non disponibile.");
  }

  const connection = await getGoogleConnection(adminId);
  if (!connection?.refresh_token) {
    throw new Error("Google Calendar non è collegato.");
  }

  if (!hasGoogleCalendarScope(connection.scope)) {
    throw new Error(
      "Google Calendar deve essere ricollegato per gestire il calendario CRM +ENERGIA."
    );
  }

  const expiresAt = connection.expires_at
    ? new Date(connection.expires_at).getTime()
    : 0;

  if (
    !force &&
    connection.access_token &&
    expiresAt > Date.now() + 60_000
  ) {
    return String(connection.access_token);
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: String(connection.refresh_token),
      grant_type: "refresh_token",
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.access_token) {
    throw new Error(
      data?.error_description ||
        data?.error ||
        "Impossibile aggiornare l'accesso Google Calendar."
    );
  }

  const nextExpiry = new Date(
    Date.now() + Number(data.expires_in || 3600) * 1000
  ).toISOString();

  const { error } = await db
    .from("google_calendar_connections")
    .update({
      access_token: data.access_token,
      token_type: data.token_type || "Bearer",
      scope: data.scope || connection.scope || GOOGLE_SCOPE,
      expires_at: nextExpiry,
      updated_at: new Date().toISOString(),
    })
    .eq("admin_id", adminId);

  if (error) throw error;

  return String(data.access_token);
}

async function googleRequest(
  adminId: number,
  url: string,
  init: RequestInit = {}
) {
  let token = await refreshGoogleToken(adminId);

  const run = (accessToken: string) =>
    fetch(url, {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

  let response = await run(token);
  if (response.status === 401) {
    token = await refreshGoogleToken(adminId, true);
    response = await run(token);
  }

  return response;
}

async function patchCrmCalendarColor(
  adminId: number,
  calendarId: string
) {
  const response = await googleRequest(
    adminId,
    `https://www.googleapis.com/calendar/v3/users/me/calendarList/${encodeURIComponent(
      calendarId
    )}?colorRgbFormat=true`,
    {
      method: "PATCH",
      body: JSON.stringify({
        backgroundColor: CRM_GOOGLE_CALENDAR.backgroundColor,
        foregroundColor: CRM_GOOGLE_CALENDAR.foregroundColor,
        selected: true,
      }),
    }
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      payload?.error?.message ||
        "Impossibile impostare il colore del calendario CRM +ENERGIA."
    );
  }
}

async function ensureCrmGoogleCalendar(adminId: number) {
  const connection = await getGoogleConnection(adminId);
  if (!connection?.refresh_token) {
    return "";
  }

  if (!hasGoogleCalendarScope(connection.scope)) {
    return "";
  }

  const { data: mapped, error: mappedError } = await db
    .from("google_calendar_crm_calendars")
    .select("*")
    .eq("admin_id", adminId)
    .maybeSingle();

  if (mappedError) throw mappedError;

  let calendarId = mapped?.calendar_id
    ? String(mapped.calendar_id)
    : "";

  if (calendarId) {
    const verify = await googleRequest(
      adminId,
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        calendarId
      )}`,
      { method: "GET" }
    );

    if (verify.ok) {
      await patchCrmCalendarColor(adminId, calendarId);
      return calendarId;
    }

    if (verify.status !== 404 && verify.status !== 410) {
      const payload = await verify.json().catch(() => ({}));
      throw new Error(
        payload?.error?.message ||
          "Impossibile verificare il calendario CRM +ENERGIA."
      );
    }
  }

  const listResponse = await googleRequest(
    adminId,
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250&showHidden=true",
    { method: "GET" }
  );
  const list = await listResponse.json().catch(() => ({}));

  if (!listResponse.ok) {
    throw new Error(
      list?.error?.message ||
        "Impossibile leggere i calendari Google."
    );
  }

  const existing = Array.isArray(list?.items)
    ? list.items.find(
        (item: any) =>
          String(item?.summary || item?.summaryOverride || "").trim() ===
            CRM_GOOGLE_CALENDAR.name &&
          String(item?.accessRole || "") === "owner"
      )
    : null;

  if (existing?.id) {
    calendarId = String(existing.id);
  } else {
    const createResponse = await googleRequest(
      adminId,
      "https://www.googleapis.com/calendar/v3/calendars",
      {
        method: "POST",
        body: JSON.stringify({
          summary: CRM_GOOGLE_CALENDAR.name,
          timeZone: GOOGLE_TIME_ZONE,
        }),
      }
    );
    const created = await createResponse.json().catch(() => ({}));

    if (!createResponse.ok || !created?.id) {
      throw new Error(
        created?.error?.message ||
          "Impossibile creare il calendario CRM +ENERGIA."
      );
    }

    calendarId = String(created.id);
  }

  await patchCrmCalendarColor(adminId, calendarId);

  const { error: saveError } = await db
    .from("google_calendar_crm_calendars")
    .upsert(
      {
        admin_id: adminId,
        calendar_id: calendarId,
        calendar_name: CRM_GOOGLE_CALENDAR.name,
        background_color: CRM_GOOGLE_CALENDAR.backgroundColor,
        foreground_color: CRM_GOOGLE_CALENDAR.foregroundColor,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "admin_id" }
    );

  if (saveError) throw saveError;

  return calendarId;
}

function buildCrmGoogleEvent(event: any) {
  const title = cleanHtmlText(event.title) || "APPUNTAMENTO";
  const notes = cleanHtmlText(event.notes);
  const assignedTo = cleanHtmlText(event.assigned_to);

  const description = [
    "CRM +ENERGIA",
    `ID CRM: ${String(event.crm_event_id || "")}`,
    assignedTo ? `In carico a: ${assignedTo}` : "",
    notes,
  ]
    .filter(Boolean)
    .join("\n\n");

  const startDate = String(event.start_date || "");
  const startTime = String(event.start_time || "").slice(0, 5);
  const endDate = String(event.end_date || "");
  const endTime = String(event.end_time || "").slice(0, 5);

  const body: any = {
    summary: `CRM +ENERGIA - ${title}`,
    description,
    extendedProperties: {
      private: {
        crm_event_id: String(event.crm_event_id || ""),
        source: "crm_piuenergia",
      },
    },
  };

  if (startDate && startTime) {
    let resolvedEndDate = endDate || startDate;
    let resolvedEndTime = endTime;

    if (!resolvedEndTime) {
      const fallback = addMinutesLocal(startDate, startTime, 30);
      resolvedEndDate = fallback.date;
      resolvedEndTime = fallback.time;
    }

    if (
      `${resolvedEndDate} ${resolvedEndTime}` <=
      `${startDate} ${startTime}`
    ) {
      const fallback = addMinutesLocal(startDate, startTime, 30);
      resolvedEndDate = fallback.date;
      resolvedEndTime = fallback.time;
    }

    body.start = {
      dateTime: `${startDate}T${startTime}:00`,
      timeZone: GOOGLE_TIME_ZONE,
    };
    body.end = {
      dateTime: `${resolvedEndDate}T${resolvedEndTime}:00`,
      timeZone: GOOGLE_TIME_ZONE,
    };
  } else if (startDate) {
    body.start = { date: startDate };
    body.end = { date: addDaysKey(startDate, 1) };
  }

  return body;
}

async function syncCrmEventsToGoogle(
  adminId: number,
  ownerKey: string
) {
  const googleConnection = await getGoogleConnection(adminId);

  if (
    !googleConnection?.refresh_token ||
    !hasGoogleCalendarScope(googleConnection.scope)
  ) {
    return {
      connected: false,
      synced: 0,
      deleted: 0,
      errors: 0,
    };
  }

  const calendarId = await ensureCrmGoogleCalendar(adminId);
  if (!calendarId) {
    return {
      connected: false,
      synced: 0,
      deleted: 0,
      errors: 0,
    };
  }

  const { data: rows, error } = await db
    .from("recruiting_crm_events")
    .select(
      "id,crm_event_id,title,notes,notes_override,assigned_to,start_date,start_time,end_date,end_time,active,content_hash,google_event_id,google_calendar_id,google_synced_hash"
    )
    .eq("owner_key", ownerKey);

  if (error) throw error;

  let synced = 0;
  let deleted = 0;
  let errors = 0;

  for (const event of rows || []) {
    try {
      const existingGoogleId = String(event.google_event_id || "");
      const existingCalendarId = String(event.google_calendar_id || "");

      if (!event.active) {
        if (existingGoogleId) {
          const deleteResponse = await googleRequest(
            adminId,
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
              existingCalendarId || calendarId
            )}/events/${encodeURIComponent(existingGoogleId)}`,
            { method: "DELETE" }
          );

          if (
            !deleteResponse.ok &&
            deleteResponse.status !== 404 &&
            deleteResponse.status !== 410
          ) {
            const payload = await deleteResponse.json().catch(() => ({}));
            throw new Error(
              payload?.error?.message ||
                "Errore durante la cancellazione evento CRM da Google."
            );
          }
        }

        await db
          .from("recruiting_crm_events")
          .update({
            google_event_id: null,
            google_calendar_id: calendarId,
            google_sync_status: "deleted",
            google_sync_error: "",
            google_synced_at: new Date().toISOString(),
            google_synced_hash: "",
          })
          .eq("id", event.id);

        if (existingGoogleId) deleted += 1;
        continue;
      }

      if (!event.start_date) continue;

      if (
        existingGoogleId &&
        existingCalendarId === calendarId &&
        String(event.google_synced_hash || "") ===
          String(event.content_hash || "")
      ) {
        continue;
      }

      if (
        existingGoogleId &&
        existingCalendarId &&
        existingCalendarId !== calendarId
      ) {
        const oldDelete = await googleRequest(
          adminId,
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
            existingCalendarId
          )}/events/${encodeURIComponent(existingGoogleId)}`,
          { method: "DELETE" }
        );

        if (
          !oldDelete.ok &&
          oldDelete.status !== 404 &&
          oldDelete.status !== 410
        ) {
          const payload = await oldDelete.json().catch(() => ({}));
          throw new Error(
            payload?.error?.message ||
              "Errore durante lo spostamento dell'evento CRM."
          );
        }
      }

      const effectiveEvent = {
        ...event,
        notes:
          event.notes_override !== null &&
          event.notes_override !== undefined
            ? String(event.notes_override)
            : String(event.notes || ""),
      };
      const body = buildCrmGoogleEvent(effectiveEvent);
      let googleEventId =
        existingCalendarId === calendarId ? existingGoogleId : "";

      if (googleEventId) {
        const patch = await googleRequest(
          adminId,
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
            calendarId
          )}/events/${encodeURIComponent(googleEventId)}`,
          {
            method: "PATCH",
            body: JSON.stringify(body),
          }
        );

        if (patch.status === 404 || patch.status === 410) {
          googleEventId = "";
        } else if (!patch.ok) {
          const payload = await patch.json().catch(() => ({}));
          throw new Error(
            payload?.error?.message ||
              "Errore aggiornamento evento CRM su Google."
          );
        }
      }

      if (!googleEventId) {
        const create = await googleRequest(
          adminId,
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
            calendarId
          )}/events`,
          {
            method: "POST",
            body: JSON.stringify(body),
          }
        );

        const created = await create.json().catch(() => ({}));
        if (!create.ok || !created?.id) {
          throw new Error(
            created?.error?.message ||
              "Errore creazione evento CRM su Google."
          );
        }

        googleEventId = String(created.id);
      }

      await db
        .from("recruiting_crm_events")
        .update({
          google_event_id: googleEventId,
          google_calendar_id: calendarId,
          google_sync_status: "synced",
          google_sync_error: "",
          google_synced_at: new Date().toISOString(),
          google_synced_hash: String(event.content_hash || ""),
        })
        .eq("id", event.id);

      synced += 1;
    } catch (error: any) {
      errors += 1;
      await db
        .from("recruiting_crm_events")
        .update({
          google_sync_status: "error",
          google_sync_error: error?.message || String(error),
        })
        .eq("id", event.id);
    }
  }

  return {
    connected: true,
    calendar_id: calendarId,
    synced,
    deleted,
    errors,
  };
}

async function getConnection(adminId: number) {
  const { data, error } = await db
    .from("recruiting_crm_connections")
    .select("*")
    .eq("admin_id", adminId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getCredentials(connection: any) {
  if (
    !connection?.crm_username_encrypted ||
    !connection?.crm_password_encrypted
  ) {
    throw new Error("Credenziali CRM non configurate.");
  }

  return {
    username: await decryptSecret(connection.crm_username_encrypted),
    password: await decryptSecret(connection.crm_password_encrypted),
  };
}

async function updateConnectionError(
  adminId: number,
  message: string,
  mode: "test" | "sync"
) {
  await db
    .from("recruiting_crm_connections")
    .update({
      last_sync_status: "error",
      last_sync_error: message,
      ...(mode === "test"
        ? { last_test_at: new Date().toISOString() }
        : { last_sync_at: new Date().toISOString() }),
      updated_at: new Date().toISOString(),
    })
    .eq("admin_id", adminId);
}

async function testConnection(adminId: number) {
  const connection = await getConnection(adminId);
  if (!connection) throw new Error("Connessione CRM non configurata.");

  const credentials = await getCredentials(connection);

  try {
    const xml = await crmLoginAndAgenda(
      credentials.username,
      credentials.password,
      String(connection.ccodsog || "17")
    );
    const events = await parseAgenda(xml);

    await db
      .from("recruiting_crm_connections")
      .update({
        last_test_at: new Date().toISOString(),
        last_sync_status: "connected",
        last_sync_error: "",
        last_event_count: events.length,
        updated_at: new Date().toISOString(),
      })
      .eq("admin_id", adminId);

    return {
      ok: true,
      event_count: events.length,
    };
  } catch (error: any) {
    const message = error?.message || String(error);
    await updateConnectionError(adminId, message, "test");
    throw error;
  }
}

async function syncConnection(connection: any) {
  const adminId = Number(connection.admin_id);
  const ownerKey = String(connection.owner_key || "");
  const credentials = await getCredentials(connection);

  try {
    const xml = await crmLoginAndAgenda(
      credentials.username,
      credentials.password,
      String(connection.ccodsog || "17")
    );

    const events = await parseAgenda(xml);
    const now = new Date().toISOString();

    if (events.length) {
      const rows = events.map((event) => ({
        owner_key: ownerKey,
        ...event,
        active: true,
        missing_count: 0,
        last_seen_at: now,
        updated_at: now,
      }));

      const { error: upsertError } = await db
        .from("recruiting_crm_events")
        .upsert(rows, {
          onConflict: "owner_key,crm_event_id",
        });

      if (upsertError) throw upsertError;

      const dated = events
        .map((event) => event.start_date)
        .filter(Boolean)
        .sort();

      const minDate = dated[0] || null;
      const maxDate = dated[dated.length - 1] || null;

      if (minDate && maxDate) {
        const seen = new Set(events.map((event) => event.crm_event_id));

        const { data: existing, error: existingError } = await db
          .from("recruiting_crm_events")
          .select("id,crm_event_id,missing_count")
          .eq("owner_key", ownerKey)
          .gte("start_date", minDate)
          .lte("start_date", maxDate);

        if (existingError) throw existingError;

        for (const row of existing || []) {
          if (seen.has(String(row.crm_event_id))) continue;

          const nextMissing = Number(row.missing_count || 0) + 1;
          const { error: missingError } = await db
            .from("recruiting_crm_events")
            .update({
              missing_count: nextMissing,
              active: nextMissing < 2,
              updated_at: now,
            })
            .eq("id", row.id);

          if (missingError) throw missingError;
        }
      }
    }

    let googleSync = {
      connected: false,
      synced: 0,
      deleted: 0,
      errors: 0,
    };

    try {
      googleSync = await syncCrmEventsToGoogle(adminId, ownerKey);
    } catch (googleError) {
      console.error("CRM GOOGLE CALENDAR SYNC ERROR:", googleError);
    }

    await db
      .from("recruiting_crm_connections")
      .update({
        last_sync_at: now,
        last_test_at: now,
        last_sync_status: "connected",
        last_sync_error: "",
        last_event_count: events.length,
        updated_at: now,
      })
      .eq("admin_id", adminId);

    return {
      ok: true,
      event_count: events.length,
      google_connected: googleSync.connected,
      google_synced: googleSync.synced,
      google_deleted: googleSync.deleted,
      google_errors: googleSync.errors,
    };
  } catch (error: any) {
    const message = error?.message || String(error);
    await updateConnectionError(adminId, message, "sync");
    throw error;
  }
}

async function saveCredentials(
  admin: { id: number; ownerKey: string },
  payload: any
) {
  const existing = await getConnection(admin.id);

  const newUsername = String(payload?.username || "").trim();
  const newPassword = String(payload?.password || "");

  let usernameEncrypted = existing?.crm_username_encrypted || null;
  let passwordEncrypted = existing?.crm_password_encrypted || null;

  if (!existing && (!newUsername || !newPassword)) {
    throw new Error(
      "Al primo collegamento devi inserire username e password CRM."
    );
  }

  if (newUsername) {
    usernameEncrypted = await encryptSecret(newUsername);
  }

  if (newPassword) {
    passwordEncrypted = await encryptSecret(newPassword);
  }

  if (!usernameEncrypted || !passwordEncrypted) {
    throw new Error("Username e password CRM sono obbligatori.");
  }

  const { error } = await db
    .from("recruiting_crm_connections")
    .upsert(
      {
        admin_id: admin.id,
        owner_key: admin.ownerKey,
        crm_username_encrypted: usernameEncrypted,
        crm_password_encrypted: passwordEncrypted,
        ccodsog: String(payload?.ccodsog || existing?.ccodsog || "17"),
        last_sync_status: "configured",
        last_sync_error: "",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "admin_id" }
    );

  if (error) throw error;

  return { saved: true };
}

async function updateEventNote(
  admin: { id: number; ownerKey: string },
  payload: any
) {
  const crmEventId = String(payload?.crm_event_id || "").trim();
  if (!crmEventId) {
    throw new Error("ID appuntamento CRM mancante.");
  }

  const note = String(payload?.note ?? "");

  const { data, error } = await db
    .from("recruiting_crm_events")
    .update({
      notes_override: note,
      notes_override_updated_at: new Date().toISOString(),
      google_synced_hash: "",
      updated_at: new Date().toISOString(),
    })
    .eq("owner_key", admin.ownerKey)
    .eq("crm_event_id", crmEventId)
    .select("id,crm_event_id,notes,notes_override")
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    throw new Error("Appuntamento CRM non trovato.");
  }

  let googleSync = {
    connected: false,
    synced: 0,
    deleted: 0,
    errors: 0,
  };

  try {
    googleSync = await syncCrmEventsToGoogle(
      admin.id,
      admin.ownerKey
    );
  } catch (googleError) {
    console.error("CRM NOTE GOOGLE SYNC ERROR:", googleError);
  }

  return {
    ok: true,
    crm_event_id: crmEventId,
    note: String(data.notes_override ?? data.notes ?? ""),
    google_connected: googleSync.connected,
    google_synced: googleSync.synced,
    google_errors: googleSync.errors,
  };
}

async function statusForAdmin(adminId: number) {
  const connection = await getConnection(adminId);

  if (!connection) {
    return {
      configured: false,
      status: "not_configured",
      username_hint: "",
      ccodsog: "17",
      last_test_at: null,
      last_sync_at: null,
      last_sync_error: "",
      last_event_count: 0,
      automatic_sync_minutes: 15,
    };
  }

  let usernameHint = "";
  try {
    if (connection.crm_username_encrypted) {
      usernameHint = maskUsername(
        await decryptSecret(connection.crm_username_encrypted)
      );
    }
  } catch {
    usernameHint = "";
  }

  return {
    configured: Boolean(
      connection.crm_username_encrypted &&
        connection.crm_password_encrypted
    ),
    status: String(connection.last_sync_status || "configured"),
    username_hint: usernameHint,
    ccodsog: String(connection.ccodsog || "17"),
    last_test_at: connection.last_test_at || null,
    last_sync_at: connection.last_sync_at || null,
    last_sync_error: String(connection.last_sync_error || ""),
    last_event_count: Number(connection.last_event_count || 0),
    automatic_sync_minutes: 15,
  };
}

async function validateCronSecret(req: Request) {
  const supplied = String(
    req.headers.get("x-crm-cron-secret") || ""
  );

  if (!supplied) return false;

  const { data, error } = await db
    .from("recruiting_crm_internal_config")
    .select("cron_secret")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data?.cron_secret) return false;

  return supplied === String(data.cron_secret);
}

async function cronSyncAll() {
  const { data: connections, error } = await db
    .from("recruiting_crm_connections")
    .select("*");

  if (error) throw error;

  const configuredConnections = (connections || []).filter(
    (connection: any) =>
      Boolean(connection?.crm_username_encrypted) &&
      Boolean(connection?.crm_password_encrypted)
  );

  const results = [];

  for (const connection of configuredConnections) {
    try {
      const result = await syncConnection(connection);
      results.push({
        admin_id: connection.admin_id,
        ok: true,
        event_count: result.event_count,
      });
    } catch (error: any) {
      results.push({
        admin_id: connection.admin_id,
        ok: false,
        error: error?.message || String(error),
      });
    }
  }

  return results;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Metodo non supportato." }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");

    if (action === "cron_sync") {
      if (!(await validateCronSecret(req))) {
        return json({ error: "Cron non autorizzato." }, 401);
      }

      return json({
        ok: true,
        results: await cronSyncAll(),
      });
    }

    const admin = await validateAdmin(
      String(body?.session_token || "")
    );

    if (action === "status") {
      return json(await statusForAdmin(admin.id));
    }

    if (action === "save_credentials") {
      return json(await saveCredentials(admin, body));
    }

    if (action === "test") {
      return json(await testConnection(admin.id));
    }

    if (action === "sync") {
      const connection = await getConnection(admin.id);
      if (!connection) {
        throw new Error("Connessione CRM non configurata.");
      }
      return json(await syncConnection(connection));
    }

    if (action === "update_event_note") {
      return json(await updateEventNote(admin, body));
    }

    return json({ error: "Azione non riconosciuta." }, 400);
  } catch (error: any) {
    console.error("RECRUITING CRM SYNC ERROR:", error);
    return json(
      {
        error:
          error?.message ||
          "Errore durante la comunicazione con il CRM.",
      },
      400
    );
  }
});
