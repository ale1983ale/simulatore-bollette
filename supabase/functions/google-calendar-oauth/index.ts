import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_ORIGIN = "https://simulatore-bollette.vercel.app";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const GOOGLE_AUTH_SCOPE = `${CALENDAR_SCOPE} ${GMAIL_SEND_SCOPE} ${DRIVE_READONLY_SCOPE}`;
const TIME_ZONE = "Europe/Rome";

const ACTIVITY_CALENDARS: Record<
  string,
  { name: string; backgroundColor: string; foregroundColor: string }
> = {
  CHIAMARE: {
    name: "CHIAMARE HR",
    backgroundColor: "#2563eb",
    foregroundColor: "#ffffff",
  },
  APPUNTAMENTO_ZONA: {
    name: "APPUNTAMENTO IN ZONA HR",
    backgroundColor: "#f97316",
    foregroundColor: "#ffffff",
  },
  APPUNTAMENTO_SEDE: {
    name: "APPUNTAMENTO IN SEDE HR",
    backgroundColor: "#7c3aed",
    foregroundColor: "#ffffff",
  },
  VIDEOCALL: {
    name: "VIDEOCALL HR",
    backgroundColor: "#16a34a",
    foregroundColor: "#ffffff",
  },
  ALTRO: {
    name: "ALTRO HR",
    backgroundColor: "#64748b",
    foregroundColor: "#ffffff",
  },
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID") ?? "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET") ?? "";
const GOOGLE_REDIRECT_URI = Deno.env.get("GOOGLE_CALENDAR_REDIRECT_URI") ?? "";

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Headers": "content-type, apikey, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Content-Type": "application/json",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

function randomToken(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
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

function assertGoogleConfig() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error(
      "Configurazione Google Calendar incompleta nei Secrets Supabase."
    );
  }
}

function validateReturnUrl(value: string | null | undefined) {
  const fallback = `${APP_ORIGIN}/`;
  if (!value) return fallback;

  try {
    const url = new URL(value);
    if (url.origin !== APP_ORIGIN) return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

async function validateAdmin(sessionToken: string) {
  if (!sessionToken) throw new Error("Sessione admin mancante.");

  const { data, error } = await db.rpc("admin_session_profile", {
    p_session_token: sessionToken,
  });

  if (error || !data?.id || !data?.username) {
    throw new Error("Sessione admin non valida o scaduta.");
  }

  const ownerKey = await sha256Hex(
    `recruiting-v1|${String(data.id)}|${String(data.username).toLocaleLowerCase("it")}`
  );

  return {
    id: Number(data.id),
    username: String(data.username),
    role: String(data.role || "admin"),
    ownerKey,
  };
}

async function getConnection(adminId: number) {
  const { data, error } = await db
    .from("google_calendar_connections")
    .select("*")
    .eq("admin_id", adminId)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) throw error;
  return data;
}

type DriveViewer = {
  kind: "admin" | "agent";
  id: number;
  role: string;
  username: string;
};

async function validateDriveViewer(body: any): Promise<DriveViewer> {
  const sessionToken = String(body?.session_token || "");

  if (sessionToken) {
    const admin = await validateAdmin(sessionToken);
    return {
      kind: "admin",
      id: admin.id,
      role: admin.role,
      username: admin.username,
    };
  }

  const agentId = Number(body?.agent_id || 0);
  const agentUsername = String(body?.agent_username || "").trim();
  const agentPassword = String(body?.agent_password || "");

  if (!agentId || !agentUsername || !agentPassword) {
    throw new Error("Sessione utente mancante.");
  }

  const { data, error } = await db
    .from("agents")
    .select("id,username,owner_admin_id")
    .eq("id", agentId)
    .ilike("username", agentUsername)
    .eq("password", agentPassword)
    .maybeSingle();

  if (error || !data?.id) {
    throw new Error("Sessione agente non valida.");
  }

  return {
    kind: "agent",
    id: Number(data.id),
    role: "agent",
    username: String(data.username || ""),
  };
}

async function getDriveArchiveOwnerAdminId() {
  const { data, error } = await db
    .from("admin_users")
    .select("id")
    .eq("role", "super_admin")
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) {
    throw new Error("Superadmin non configurato.");
  }

  return Number(data.id);
}

function isDriveManager(viewer: DriveViewer) {
  return viewer.kind === "admin" && viewer.role === "super_admin";
}

function hasCalendarManagementScope(scope: unknown) {
  return String(scope || "")
    .split(/\s+/)
    .filter(Boolean)
    .includes(CALENDAR_SCOPE);
}

function hasGmailSendScope(scope: unknown) {
  return String(scope || "")
    .split(/\s+/)
    .filter(Boolean)
    .includes(GMAIL_SEND_SCOPE);
}

function hasDriveReadonlyScope(scope: unknown) {
  return String(scope || "")
    .split(/\s+/)
    .filter(Boolean)
    .includes(DRIVE_READONLY_SCOPE);
}

async function refreshGoogleToken(adminId: number, force = false) {
  assertGoogleConfig();

  const connection = await getConnection(adminId);
  if (!connection?.refresh_token) {
    throw new Error("Google Calendar non è collegato.");
  }

  const expiresAt = connection.expires_at
    ? new Date(connection.expires_at).getTime()
    : 0;

  if (
    !force &&
    connection.access_token &&
    expiresAt > Date.now() + 60_000
  ) {
    return {
      accessToken: String(connection.access_token),
      connection,
    };
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: String(connection.refresh_token),
      grant_type: "refresh_token",
    }),
  });

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error(
      tokenData.error_description ||
        tokenData.error ||
        "Impossibile aggiornare l'accesso a Google Calendar."
    );
  }

  const nextExpiry = new Date(
    Date.now() + Number(tokenData.expires_in || 3600) * 1000
  ).toISOString();

  const { error: updateError } = await db
    .from("google_calendar_connections")
    .update({
      access_token: tokenData.access_token,
      token_type: tokenData.token_type || "Bearer",
      scope: tokenData.scope || connection.scope || GOOGLE_AUTH_SCOPE,
      expires_at: nextExpiry,
      updated_at: new Date().toISOString(),
    })
    .eq("admin_id", adminId);

  if (updateError) throw updateError;

  return {
    accessToken: String(tokenData.access_token),
    connection: {
      ...connection,
      access_token: tokenData.access_token,
      expires_at: nextExpiry,
    },
  };
}

async function googleRequest(
  adminId: number,
  url: string,
  init: RequestInit = {}
) {
  let { accessToken } = await refreshGoogleToken(adminId);

  const doFetch = (token: string) =>
    fetch(url, {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

  let response = await doFetch(accessToken);

  if (response.status === 401) {
    accessToken = (await refreshGoogleToken(adminId, true)).accessToken;
    response = await doFetch(accessToken);
  }

  return response;
}

const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
const GOOGLE_APPS_MIME_PREFIX = "application/vnd.google-apps.";

async function assertDriveReady(adminId: number) {
  const connection = await getConnection(adminId);
  if (!connection?.refresh_token) {
    throw new Error("Google non è collegato.");
  }
  if (!hasDriveReadonlyScope(connection.scope)) {
    throw new Error(
      "Ricollega Google una volta per autorizzare la lettura dell'Archivio Drive."
    );
  }
  return connection;
}

async function getDriveItem(
  adminId: number,
  fileId: string,
  fields = "id,name,mimeType,parents,modifiedTime,size,webViewLink,webContentLink,iconLink,thumbnailLink,capabilities(canDownload)"
) {
  await assertDriveReady(adminId);

  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId || "root")}`
  );
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("fields", fields);

  const response = await googleRequest(adminId, url.toString(), { method: "GET" });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ||
        "Impossibile leggere l'elemento da Google Drive."
    );
  }

  return payload;
}

async function listDriveFolderItems(adminId: number, folderId: string) {
  await assertDriveReady(adminId);

  const items: any[] = [];
  let pageToken = "";

  for (let page = 0; page < 10; page += 1) {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`);
    url.searchParams.set("pageSize", "1000");
    url.searchParams.set("orderBy", "folder,name_natural");
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    url.searchParams.set(
      "fields",
      "nextPageToken,files(id,name,mimeType,parents,modifiedTime,size,webViewLink,webContentLink,iconLink,thumbnailLink,capabilities(canDownload))"
    );
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await googleRequest(adminId, url.toString(), { method: "GET" });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        payload?.error?.message ||
          "Impossibile leggere i file della cartella Google Drive."
      );
    }

    if (Array.isArray(payload?.files)) items.push(...payload.files);
    pageToken = String(payload?.nextPageToken || "");
    if (!pageToken) break;
  }

  return items.map((item: any) => ({
    id: String(item?.id || ""),
    name: String(item?.name || ""),
    mime_type: String(item?.mimeType || ""),
    is_folder: String(item?.mimeType || "") === DRIVE_FOLDER_MIME,
    modified_time: String(item?.modifiedTime || ""),
    size: item?.size ? Number(item.size) : null,
    web_view_link: String(item?.webViewLink || ""),
    web_content_link: String(item?.webContentLink || ""),
    icon_link: String(item?.iconLink || ""),
    thumbnail_link: String(item?.thumbnailLink || ""),
    can_download: Boolean(item?.capabilities?.canDownload),
    parents: Array.isArray(item?.parents) ? item.parents.map(String) : [],
  }));
}

async function getConfiguredDriveFolder(adminId: number) {
  const connection = await assertDriveReady(adminId);
  const folderId = String(connection?.drive_folder_id || "");
  const folderName = String(connection?.drive_folder_name || "");

  return {
    folder_id: folderId,
    folder_name: folderName,
  };
}

async function setConfiguredDriveFolder(
  adminId: number,
  folderId: string
) {
  const targetId = String(folderId || "root");
  const folder = await getDriveItem(adminId, targetId, "id,name,mimeType,parents");

  if (String(folder?.mimeType || "") !== DRIVE_FOLDER_MIME) {
    throw new Error("L'elemento selezionato non è una cartella Google Drive.");
  }

  const folderName =
    targetId === "root" ? "Il mio Drive" : String(folder?.name || "Cartella Drive");

  const { error } = await db
    .from("google_calendar_connections")
    .update({
      drive_folder_id: String(folder?.id || targetId),
      drive_folder_name: folderName,
      updated_at: new Date().toISOString(),
    })
    .eq("admin_id", adminId);

  if (error) throw error;

  return {
    folder_id: String(folder?.id || targetId),
    folder_name: folderName,
  };
}

async function isDriveItemInsideRoot(
  adminId: number,
  itemId: string,
  rootFolderId: string
) {
  const rootId = String(rootFolderId || "");
  if (!rootId) return false;
  if (rootId === "root" || itemId === rootId) return true;

  const visited = new Set<string>();
  let pending = [String(itemId || "")];

  for (let depth = 0; depth < 30 && pending.length; depth += 1) {
    const currentId = pending.shift() || "";
    if (!currentId || visited.has(currentId)) continue;
    visited.add(currentId);

    const item = await getDriveItem(
      adminId,
      currentId,
      "id,parents"
    );

    const parents = Array.isArray(item?.parents)
      ? item.parents.map(String)
      : [];

    if (parents.includes(rootId)) return true;
    pending.push(
      ...parents.filter((parentId: string) => !visited.has(parentId))
    );
  }

  return false;
}

async function assertDriveItemInsideRoot(
  adminId: number,
  itemId: string,
  rootFolderId: string
) {
  const allowed = await isDriveItemInsideRoot(
    adminId,
    itemId,
    rootFolderId
  );

  if (!allowed) {
    throw new Error(
      "Questo elemento non appartiene alla cartella Archivio Drive autorizzata."
    );
  }
}

async function downloadDriveFile(adminId: number, fileId: string) {
  const file = await getDriveItem(
    adminId,
    fileId,
    "id,name,mimeType,capabilities(canDownload)"
  );

  const mimeType = String(file?.mimeType || "");
  if (!file?.capabilities?.canDownload) {
    throw new Error("Il download di questo file non è consentito da Google Drive.");
  }
  if (mimeType.startsWith(GOOGLE_APPS_MIME_PREFIX)) {
    throw new Error(
      "I documenti Google nativi si aprono direttamente in Drive; usa APRI."
    );
  }

  let { accessToken } = await refreshGoogleToken(adminId);
  const mediaUrl =
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;

  const doFetch = (token: string) =>
    fetch(mediaUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

  let response = await doFetch(accessToken);
  if (response.status === 401) {
    accessToken = (await refreshGoogleToken(adminId, true)).accessToken;
    response = await doFetch(accessToken);
  }

  if (!response.ok || !response.body) {
    const payload = await response.text().catch(() => "");
    throw new Error(payload || "Download Google Drive non riuscito.");
  }

  const safeName = String(file?.name || "download")
    .replace(/[\r\n"]/g, "_")
    .slice(0, 220);

  return new Response(response.body, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

async function patchCalendarColor(
  adminId: number,
  calendarId: string,
  config: { backgroundColor: string; foregroundColor: string }
) {
  const response = await googleRequest(
    adminId,
    `https://www.googleapis.com/calendar/v3/users/me/calendarList/${encodeURIComponent(calendarId)}?colorRgbFormat=true`,
    {
      method: "PATCH",
      body: JSON.stringify({
        backgroundColor: config.backgroundColor,
        foregroundColor: config.foregroundColor,
        selected: true,
      }),
    }
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      payload?.error?.message ||
        "Impossibile impostare il colore del calendario Google."
    );
  }
}

async function ensureActivityCalendar(
  adminId: number,
  eventType: string
) {
  const type = ACTIVITY_CALENDARS[eventType] ? eventType : "ALTRO";
  const config = ACTIVITY_CALENDARS[type];

  const connection = await getConnection(adminId);
  if (!connection) {
    throw new Error("Google Calendar non è collegato.");
  }

  if (!hasCalendarManagementScope(connection.scope)) {
    throw new Error(
      "Google Calendar deve essere ricollegato per autorizzare la creazione dei calendari separati HR."
    );
  }

  const { data: existingRow, error: rowError } = await db
    .from("google_calendar_activity_calendars")
    .select("*")
    .eq("admin_id", adminId)
    .eq("event_type", type)
    .maybeSingle();

  if (rowError) throw rowError;

  let calendarId = existingRow?.calendar_id
    ? String(existingRow.calendar_id)
    : "";

  if (calendarId) {
    const verifyResponse = await googleRequest(
      adminId,
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`,
      { method: "GET" }
    );

    if (verifyResponse.ok) {
      await patchCalendarColor(adminId, calendarId, config);
      return calendarId;
    }

    if (verifyResponse.status !== 404 && verifyResponse.status !== 410) {
      const payload = await verifyResponse.json().catch(() => ({}));
      throw new Error(
        payload?.error?.message ||
          "Impossibile verificare il calendario Google."
      );
    }

    calendarId = "";
  }

  const listResponse = await googleRequest(
    adminId,
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250&showHidden=true",
    { method: "GET" }
  );
  const listData = await listResponse.json().catch(() => ({}));

  if (!listResponse.ok) {
    throw new Error(
      listData?.error?.message ||
        "Impossibile leggere l'elenco dei calendari Google."
    );
  }

  const existingCalendar = Array.isArray(listData?.items)
    ? listData.items.find(
        (item: any) =>
          String(item?.summary || item?.summaryOverride || "").trim() ===
            config.name &&
          String(item?.accessRole || "") === "owner"
      )
    : null;

  if (existingCalendar?.id) {
    calendarId = String(existingCalendar.id);
  } else {
    const createResponse = await googleRequest(
      adminId,
      "https://www.googleapis.com/calendar/v3/calendars",
      {
        method: "POST",
        body: JSON.stringify({
          summary: config.name,
          timeZone: TIME_ZONE,
        }),
      }
    );
    const created = await createResponse.json().catch(() => ({}));

    if (!createResponse.ok || !created?.id) {
      throw new Error(
        created?.error?.message ||
          `Impossibile creare il calendario ${config.name}.`
      );
    }

    calendarId = String(created.id);
  }

  await patchCalendarColor(adminId, calendarId, config);

  const { error: upsertError } = await db
    .from("google_calendar_activity_calendars")
    .upsert(
      {
        admin_id: adminId,
        event_type: type,
        calendar_id: calendarId,
        calendar_name: config.name,
        background_color: config.backgroundColor,
        foreground_color: config.foregroundColor,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "admin_id,event_type" }
    );

  if (upsertError) throw upsertError;

  return calendarId;
}

async function ensureAllActivityCalendars(adminId: number) {
  const created: Record<string, string> = {};
  for (const eventType of Object.keys(ACTIVITY_CALENDARS)) {
    created[eventType] = await ensureActivityCalendar(
      adminId,
      eventType
    );
  }
  return created;
}

function localRomeDateTime(value: string) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const pick = (type: string) =>
    parts.find((part) => part.type === type)?.value || "";

  return {
    date: `${pick("year")}-${pick("month")}-${pick("day")}`,
    time: `${pick("hour")}:${pick("minute")}`,
  };
}

function dateKeysBetween(
  startDate: string,
  endDateExclusive: string
) {
  const keys: string[] = [];
  const current = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDateExclusive}T00:00:00Z`);

  while (current < end && keys.length < 370) {
    keys.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return keys;
}

async function listExternalGoogleEvents(
  adminId: number,
  timeMin: string,
  timeMax: string
) {
  const connection = await getConnection(adminId);
  if (!connection) {
    return { connected: false, events: [] };
  }

  if (!hasCalendarManagementScope(connection.scope)) {
    throw new Error(
      "Google Calendar deve essere ricollegato prima di mostrare il calendario completo."
    );
  }

  const calendarListResponse = await googleRequest(
    adminId,
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250&showHidden=false",
    { method: "GET" }
  );
  const calendarList = await calendarListResponse
    .json()
    .catch(() => ({}));

  if (!calendarListResponse.ok) {
    throw new Error(
      calendarList?.error?.message ||
        "Impossibile leggere i calendari Google."
    );
  }

  const calendars = Array.isArray(calendarList?.items)
    ? calendarList.items.filter(
        (item: any) =>
          item?.deleted !== true &&
          item?.hidden !== true &&
          item?.selected !== false &&
          String(item?.accessRole || "") !== "freeBusyReader"
      )
    : [];

  const externalEvents: any[] = [];

  for (const calendar of calendars) {
    const calendarId = String(calendar?.id || "");
    if (!calendarId) continue;

    let pageToken = "";

    do {
      const url = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
      );
      url.searchParams.set("timeMin", timeMin);
      url.searchParams.set("timeMax", timeMax);
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("orderBy", "startTime");
      url.searchParams.set("showDeleted", "false");
      url.searchParams.set("maxResults", "2500");
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const response = await googleRequest(
        adminId,
        url.toString(),
        { method: "GET" }
      );

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        console.warn(
          "GOOGLE CALENDAR LIST EVENTS SKIPPED:",
          calendarId,
          payload?.error?.message || response.status
        );
        break;
      }

      const items = Array.isArray(payload?.items)
        ? payload.items
        : [];

      for (const event of items) {
        if (
          event?.status === "cancelled" ||
          event?.extendedProperties?.private?.recruiting_event_id ||
          event?.extendedProperties?.private?.crm_event_id ||
          event?.extendedProperties?.private?.source === "crm_piuenergia"
        ) {
          continue;
        }

        const allDay = Boolean(event?.start?.date);
        let startDate = "";
        let startTime = "";
        let endDate = "";
        let endTime = "";
        let dateKeys: string[] = [];

        if (allDay) {
          startDate = String(event?.start?.date || "");
          const endExclusive = String(
            event?.end?.date || addDays(startDate, 1)
          );
          endDate = addDays(endExclusive, -1);
          dateKeys = dateKeysBetween(
            startDate,
            endExclusive
          );
        } else if (event?.start?.dateTime) {
          const start = localRomeDateTime(
            String(event.start.dateTime)
          );
          const end = event?.end?.dateTime
            ? localRomeDateTime(String(event.end.dateTime))
            : start;

          startDate = start.date;
          startTime = start.time;
          endDate = end.date;
          endTime = end.time;

          if (startDate && endDate && startDate !== endDate) {
            const exclusiveEnd =
              endTime === "00:00"
                ? endDate
                : addDays(endDate, 1);
            dateKeys = dateKeysBetween(
              startDate,
              exclusiveEnd
            );
          } else {
            dateKeys = startDate ? [startDate] : [];
          }
        }

        if (!dateKeys.length) continue;

        externalEvents.push({
          id: String(event?.id || ""),
          calendar_id: calendarId,
          calendar_name: String(
            calendar?.summaryOverride ||
              calendar?.summary ||
              "Google Calendar"
          ),
          summary: String(event?.summary || "SENZA TITOLO"),
          description: String(event?.description || ""),
          location: String(event?.location || ""),
          start_date: startDate,
          start_time: startTime,
          end_date: endDate,
          end_time: endTime,
          all_day: allDay,
          date_keys: dateKeys,
          html_link: String(event?.htmlLink || ""),
          background_color: String(
            calendar?.backgroundColor || "#4285f4"
          ),
          foreground_color: String(
            calendar?.foregroundColor || "#ffffff"
          ),
        });
      }

      pageToken = String(payload?.nextPageToken || "");
    } while (pageToken);
  }

  externalEvents.sort((a, b) =>
    `${a.start_date}|${a.start_time}|${a.summary}`.localeCompare(
      `${b.start_date}|${b.start_time}|${b.summary}`
    )
  );

  return {
    connected: true,
    events: externalEvents,
  };
}

function addDays(dateString: string, days: number) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function addMinutesLocal(dateString: string, timeString: string, minutes: number) {
  const [year, month, day] = dateString.split("-").map(Number);
  const [hour, minute] = timeString.slice(0, 5).split(":").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  date.setUTCMinutes(date.getUTCMinutes() + minutes);

  const datePart = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
  const timePart = [
    String(date.getUTCHours()).padStart(2, "0"),
    String(date.getUTCMinutes()).padStart(2, "0"),
  ].join(":");

  return { date: datePart, time: timePart };
}

function eventTypeLabel(event: any) {
  const labels: Record<string, string> = {
    CHIAMARE: "CHIAMARE",
    APPUNTAMENTO_ZONA: "APP. IN ZONA",
    APPUNTAMENTO_SEDE: "APP. IN SEDE",
    VIDEOCALL: "VIDEOCALL",
    ALTRO: "ALTRO",
  };

  if (event.event_type === "ALTRO" && event.custom_type) {
    return String(event.custom_type).toLocaleUpperCase("it");
  }

  return labels[String(event.event_type)] || String(event.event_type || "ATTIVITÀ");
}

async function loadRecruitingEvent(eventId: string, ownerKey: string) {
  const { data: event, error } = await db
    .from("recruiting_events")
    .select("*")
    .eq("id", eventId)
    .eq("owner_key", ownerKey)
    .maybeSingle();

  if (error) throw error;
  if (!event) throw new Error("Attività non trovata.");

  let candidate: any = null;

  if (event.candidate_id) {
    const { data, error: candidateError } = await db
      .from("recruiting_candidates")
      .select(
        "id,contact_scope,full_name,phone,email,operational_zone,province_code,region"
      )
      .eq("id", event.candidate_id)
      .eq("owner_key", ownerKey)
      .maybeSingle();

    if (candidateError) throw candidateError;
    candidate = data;
  }

  return { event, candidate };
}

function buildGoogleEvent(event: any, candidate: any) {
  const typeLabel = eventTypeLabel(event);
  const candidateName = candidate?.full_name
    ? String(candidate.full_name)
    : "";

  const isExternalContact =
    String(candidate?.contact_scope || "internal") === "external";
  const displayName = candidateName
    ? `${isExternalContact ? "[ESTERNO] " : ""}${candidateName}`
    : "";

  const summary = displayName
    ? `${typeLabel} - ${displayName}`
    : typeLabel;

  const descriptionParts = [
    event.completed ? "ATTIVITÀ COMPLETATA" : "",
    isExternalContact ? "Origine: CONTATTI ESTERNI" : "",
    event.notes ? String(event.notes) : "",
    candidate?.phone ? `Telefono: ${candidate.phone}` : "",
    candidate?.email ? `Email: ${candidate.email}` : "",
    "Creato da Simulatore Bollette · Recruiting",
  ].filter(Boolean);

  const body: any = {
    summary,
    description: descriptionParts.join("\n"),
    location: candidate?.operational_zone
      ? String(candidate.operational_zone)
      : undefined,
    extendedProperties: {
      private: {
        recruiting_event_id: String(event.id),
      },
    },
  };

  const date = String(event.event_date);
  const time = event.event_time
    ? String(event.event_time).slice(0, 5)
    : "";

  if (time) {
    const end = addMinutesLocal(date, time, 60);

    body.start = {
      dateTime: `${date}T${time}:00`,
      timeZone: TIME_ZONE,
    };
    body.end = {
      dateTime: `${end.date}T${end.time}:00`,
      timeZone: TIME_ZONE,
    };
  } else {
    body.start = { date };
    body.end = { date: addDays(date, 1) };
  }

  return body;
}

async function markSyncError(eventId: string, message: string) {
  await db
    .from("recruiting_events")
    .update({
      google_sync_status: "error",
      google_sync_error: message.slice(0, 1000),
    })
    .eq("id", eventId);
}

async function syncOneEvent(
  adminId: number,
  ownerKey: string,
  eventId: string
) {
  const connection = await getConnection(adminId);
  if (!connection) {
    return { synced: false, connected: false };
  }

  const { event, candidate } = await loadRecruitingEvent(eventId, ownerKey);

  // Gli eventi importati da un calendario Google esterno restano collegati
  // solo al calendario interno della webapp: non devono essere ricreati,
  // spostati o duplicati nei calendari HR di Google.
  if (String(event.source_type || "") === "GOOGLE") {
    return {
      synced: false,
      connected: true,
      skipped: true,
      reason: "external_google_import",
    };
  }

  const body = buildGoogleEvent(event, candidate);

  try {
    const calendarId = await ensureActivityCalendar(
      adminId,
      String(event.event_type || "ALTRO")
    );

    const previousCalendarId = String(
      event.google_calendar_id || connection.calendar_id || "primary"
    );

    let googleEventId = event.google_event_id
      ? String(event.google_event_id)
      : "";

    if (
      googleEventId &&
      previousCalendarId &&
      previousCalendarId !== calendarId
    ) {
      const deleteOldResponse = await googleRequest(
        adminId,
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(previousCalendarId)}/events/${encodeURIComponent(googleEventId)}`,
        { method: "DELETE" }
      );

      if (
        !deleteOldResponse.ok &&
        deleteOldResponse.status !== 404 &&
        deleteOldResponse.status !== 410
      ) {
        const payload = await deleteOldResponse.json().catch(() => ({}));
        throw new Error(
          payload?.error?.message ||
            "Errore durante lo spostamento dell'evento nel nuovo calendario."
        );
      }

      googleEventId = "";
    }

    let response: Response;

    if (googleEventId) {
      response = await googleRequest(
        adminId,
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(body),
        }
      );

      if (response.status === 404 || response.status === 410) {
        googleEventId = "";
      } else if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          errorText || "Errore aggiornamento evento Google."
        );
      }
    }

    if (!googleEventId) {
      response = await googleRequest(
        adminId,
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      );

      const created = await response.json();

      if (!response.ok || !created?.id) {
        throw new Error(
          created?.error?.message ||
            "Errore creazione evento Google Calendar."
        );
      }

      googleEventId = String(created.id);
    }

    const { error: updateError } = await db
      .from("recruiting_events")
      .update({
        google_event_id: googleEventId,
        google_calendar_id: calendarId,
        google_sync_status: "synced",
        google_sync_error: "",
        google_synced_at: new Date().toISOString(),
      })
      .eq("id", eventId)
      .eq("owner_key", ownerKey);

    if (updateError) throw updateError;

    return {
      synced: true,
      connected: true,
      google_event_id: googleEventId,
      google_calendar_id: calendarId,
    };
  } catch (error: any) {
    const message = error?.message || String(error);
    await markSyncError(eventId, message);
    throw error;
  }
}

async function deleteGoogleEvent(
  adminId: number,
  ownerKey: string,
  eventId: string
) {
  const connection = await getConnection(adminId);
  if (!connection) {
    return { deleted: false, connected: false };
  }

  const { event } = await loadRecruitingEvent(eventId, ownerKey);

  if (!event.google_event_id) {
    return { deleted: true, connected: true };
  }

  const calendarId = String(event.google_calendar_id || connection.calendar_id || "primary");
  const response = await googleRequest(
    adminId,
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(String(event.google_event_id))}`,
    { method: "DELETE" }
  );

  if (
    !response.ok &&
    response.status !== 404 &&
    response.status !== 410
  ) {
    const text = await response.text();
    throw new Error(text || "Errore eliminazione evento Google.");
  }

  return { deleted: true, connected: true };
}

async function handleCallback(req: Request) {
  assertGoogleConfig();

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");

  if (!state) {
    return new Response("Stato OAuth mancante.", { status: 400 });
  }

  const stateHash = await sha256Hex(state);

  const { data: stateRow, error: stateError } = await db
    .from("google_calendar_oauth_states")
    .select("*")
    .eq("state_hash", stateHash)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (stateError || !stateRow) {
    return new Response("Stato OAuth non valido o scaduto.", { status: 400 });
  }

  const returnUrl = new URL(validateReturnUrl(stateRow.return_url));

  if (providerError || !code) {
    await db
      .from("google_calendar_oauth_states")
      .update({ used_at: new Date().toISOString() })
      .eq("state_hash", stateHash);

    returnUrl.searchParams.set("google_calendar", "error");
    returnUrl.searchParams.set(
      "google_calendar_message",
      providerError || "Autorizzazione annullata"
    );

    return Response.redirect(returnUrl.toString(), 302);
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok || !tokenData.access_token) {
    returnUrl.searchParams.set("google_calendar", "error");
    returnUrl.searchParams.set(
      "google_calendar_message",
      tokenData.error_description ||
        tokenData.error ||
        "Errore collegamento Google"
    );

    return Response.redirect(returnUrl.toString(), 302);
  }

  const { data: existing } = await db
    .from("google_calendar_connections")
    .select("refresh_token")
    .eq("admin_id", Number(stateRow.admin_id))
    .maybeSingle();

  const refreshToken = String(
    tokenData.refresh_token || existing?.refresh_token || ""
  );

  if (!refreshToken) {
    returnUrl.searchParams.set("google_calendar", "error");
    returnUrl.searchParams.set(
      "google_calendar_message",
      "Google non ha restituito il refresh token. Riprova il collegamento."
    );

    return Response.redirect(returnUrl.toString(), 302);
  }

  const expiresAt = new Date(
    Date.now() + Number(tokenData.expires_in || 3600) * 1000
  ).toISOString();

  const { error: connectionError } = await db
    .from("google_calendar_connections")
    .upsert(
      {
        admin_id: Number(stateRow.admin_id),
        access_token: tokenData.access_token,
        refresh_token: refreshToken,
        token_type: tokenData.token_type || "Bearer",
        scope: tokenData.scope || GOOGLE_AUTH_SCOPE,
        expires_at: expiresAt,
        calendar_id: "primary",
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        revoked_at: null,
      },
      { onConflict: "admin_id" }
    );

  if (connectionError) {
    return new Response(connectionError.message, { status: 500 });
  }

  await db
    .from("google_calendar_activity_calendars")
    .delete()
    .eq("admin_id", Number(stateRow.admin_id));

  try {
    await ensureAllActivityCalendars(Number(stateRow.admin_id));
  } catch (calendarError: any) {
    returnUrl.searchParams.set("google_calendar", "error");
    returnUrl.searchParams.set(
      "google_calendar_message",
      calendarError?.message ||
        "Errore nella creazione dei calendari attività HR."
    );
    return Response.redirect(returnUrl.toString(), 302);
  }

  await db
    .from("google_calendar_oauth_states")
    .update({ used_at: new Date().toISOString() })
    .eq("state_hash", stateHash);

  returnUrl.searchParams.set("google_calendar", "connected");
  return Response.redirect(returnUrl.toString(), 302);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname.endsWith("/callback")) {
      return await handleCallback(req);
    }

    if (req.method !== "POST") {
      return json({ error: "Metodo non supportato." }, 405);
    }

    const body = await req.json();
    const action = String(body?.action || "");
    const sessionToken = String(body?.session_token || "");

    if (action === "status") {
      const connection = await getConnection(admin.id);
      const connected = Boolean(connection?.refresh_token);
      const calendarManagementReady =
        connected && hasCalendarManagementScope(connection?.scope);
      const gmailSendReady =
        connected && hasGmailSendScope(connection?.scope);
      const driveArchiveReady =
        connected && hasDriveReadonlyScope(connection?.scope);

      return json({
        configured: Boolean(
          GOOGLE_CLIENT_ID &&
            GOOGLE_CLIENT_SECRET &&
            GOOGLE_REDIRECT_URI
        ),
        connected,
        calendar_management_ready: calendarManagementReady,
        email_notifications_ready: gmailSendReady,
        drive_archive_ready: driveArchiveReady,
        drive_folder_id: connection?.drive_folder_id || null,
        drive_folder_name: connection?.drive_folder_name || null,
        needs_reconnect:
          connected && (!calendarManagementReady || !gmailSendReady),
        expires_at: connection?.expires_at || null,
        activity_calendars: Object.values(ACTIVITY_CALENDARS).map(
          (config) => config.name
        ),
      });
    }

    if (action === "start") {
      assertGoogleConfig();

      const returnUrl = validateReturnUrl(body?.return_url);
      const state = randomToken(32);
      const stateHash = await sha256Hex(state);

      await db
        .from("google_calendar_oauth_states")
        .delete()
        .lt("expires_at", new Date().toISOString());

      const { error } = await db
        .from("google_calendar_oauth_states")
        .insert({
          state_hash: stateHash,
          admin_id: admin.id,
          return_url: returnUrl,
        });

      if (error) throw error;

      const authUrl = new URL(
        "https://accounts.google.com/o/oauth2/v2/auth"
      );
      authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", GOOGLE_AUTH_SCOPE);
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
      authUrl.searchParams.set("include_granted_scopes", "true");
      authUrl.searchParams.set("state", state);

      return json({ auth_url: authUrl.toString() });
    }

    if (action === "disconnect") {
      const connection = await getConnection(admin.id);

      if (connection) {
        const token = String(
          connection.refresh_token || connection.access_token || ""
        );

        if (token) {
          try {
            await fetch(
              `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/x-www-form-urlencoded",
                },
              }
            );
          } catch {
            // Revocation best effort. Local credentials are still removed.
          }
        }

        await db
          .from("google_calendar_connections")
          .delete()
          .eq("admin_id", admin.id);

        await db
          .from("google_calendar_activity_calendars")
          .delete()
          .eq("admin_id", admin.id);
      }

      return json({ connected: false });
    }

    if (action.startsWith("drive_")) {
      const viewer = await validateDriveViewer(body);
      const archiveOwnerAdminId =
        await getDriveArchiveOwnerAdminId();
      const manager = isDriveManager(viewer);

      if (action === "drive_config") {
        const connection = await getConnection(
          archiveOwnerAdminId
        );
        const connected = Boolean(connection?.refresh_token);
        const driveReady =
          connected &&
          hasDriveReadonlyScope(connection?.scope);

        return json({
          configured: Boolean(
            GOOGLE_CLIENT_ID &&
              GOOGLE_CLIENT_SECRET &&
              GOOGLE_REDIRECT_URI
          ),
          connected,
          drive_ready: driveReady,
          can_manage: manager,
          folder_id:
            driveReady
              ? connection?.drive_folder_id || null
              : null,
          folder_name:
            driveReady
              ? connection?.drive_folder_name || null
              : null,
        });
      }

      if (action === "drive_list_folder") {
        const connection = await getConnection(
          archiveOwnerAdminId
        );
        if (
          !connection?.refresh_token ||
          !hasDriveReadonlyScope(connection?.scope)
        ) {
          throw new Error(
            "Archivio Drive non ancora autorizzato dal superadmin."
          );
        }

        const config = await getConfiguredDriveFolder(
          archiveOwnerAdminId
        );
        const requestedFolderId = String(
          body?.folder_id || ""
        );

        if (!config.folder_id && !manager) {
          throw new Error(
            "Il superadmin non ha ancora scelto la cartella Archivio Drive."
          );
        }

        const folderId =
          requestedFolderId ||
          config.folder_id ||
          "root";

        if (!manager && config.folder_id) {
          await assertDriveItemInsideRoot(
            archiveOwnerAdminId,
            folderId,
            config.folder_id
          );
        }

        const folder = await getDriveItem(
          archiveOwnerAdminId,
          folderId,
          "id,name,mimeType,parents,webViewLink"
        );

        if (
          String(folder?.mimeType || "") !==
          DRIVE_FOLDER_MIME
        ) {
          throw new Error(
            "La posizione selezionata non è una cartella."
          );
        }

        const items = await listDriveFolderItems(
          archiveOwnerAdminId,
          String(folder?.id || folderId)
        );

        return json({
          folder: {
            id: String(folder?.id || folderId),
            name:
              folderId === "root"
                ? "Il mio Drive"
                : String(
                    folder?.name || "Cartella Drive"
                  ),
            parents: Array.isArray(folder?.parents)
              ? folder.parents.map(String)
              : [],
            web_view_link: String(
              folder?.webViewLink || ""
            ),
          },
          configured_folder: config,
          can_manage: manager,
          items,
        });
      }

      if (action === "drive_set_folder") {
        if (!manager) {
          throw new Error(
            "Solo il superadmin può cambiare la cartella Archivio Drive."
          );
        }

        const folderId = String(
          body?.folder_id || "root"
        );

        return json(
          await setConfiguredDriveFolder(
            archiveOwnerAdminId,
            folderId
          )
        );
      }

      if (action === "drive_download") {
        const fileId = String(body?.file_id || "");
        if (!fileId) {
          throw new Error(
            "ID file Google Drive mancante."
          );
        }

        if (!manager) {
          const config = await getConfiguredDriveFolder(
            archiveOwnerAdminId
          );
          if (!config.folder_id) {
            throw new Error(
              "Cartella Archivio Drive non configurata."
            );
          }

          await assertDriveItemInsideRoot(
            archiveOwnerAdminId,
            fileId,
            config.folder_id
          );
        }

        return await downloadDriveFile(
          archiveOwnerAdminId,
          fileId
        );
      }

      return json(
        { error: "Azione Drive non riconosciuta." },
        400
      );
    }

    const admin = await validateAdmin(sessionToken);

    if (action === "list_events") {
      const timeMin = String(body?.time_min || "");
      const timeMax = String(body?.time_max || "");

      if (
        !timeMin ||
        !timeMax ||
        !Number.isFinite(new Date(timeMin).getTime()) ||
        !Number.isFinite(new Date(timeMax).getTime())
      ) {
        throw new Error("Intervallo calendario non valido.");
      }

      return json(
        await listExternalGoogleEvents(
          admin.id,
          timeMin,
          timeMax
        )
      );
    }

    if (action === "sync_event") {
      const eventId = String(body?.event_id || "");
      if (!eventId) throw new Error("ID attività mancante.");

      return json(
        await syncOneEvent(admin.id, admin.ownerKey, eventId)
      );
    }

    if (action === "delete_event") {
      const eventId = String(body?.event_id || "");
      if (!eventId) throw new Error("ID attività mancante.");

      return json(
        await deleteGoogleEvent(admin.id, admin.ownerKey, eventId)
      );
    }

    if (action === "sync_all") {
      const connection = await getConnection(admin.id);
      if (!connection) {
        return json({
          connected: false,
          synced: 0,
          errors: 0,
        });
      }

      const today = new Date().toISOString().slice(0, 10);

      const { data: rows, error } = await db
        .from("recruiting_events")
        .select("id")
        .eq("owner_key", admin.ownerKey)
        .gte("event_date", today)
        .order("event_date", { ascending: true });

      if (error) throw error;

      let synced = 0;
      let skipped = 0;
      let errors = 0;

      for (const row of rows || []) {
        try {
          const result = await syncOneEvent(
            admin.id,
            admin.ownerKey,
            String(row.id)
          );
          if (result?.skipped) {
            skipped += 1;
          } else if (result?.synced) {
            synced += 1;
          }
        } catch {
          errors += 1;
        }
      }

      return json({
        connected: true,
        synced,
        skipped,
        errors,
      });
    }

    return json({ error: "Azione non riconosciuta." }, 400);
  } catch (error: any) {
    console.error("GOOGLE CALENDAR FUNCTION ERROR:", error);
    return json(
      {
        error:
          error?.message ||
          "Errore imprevisto Google Calendar.",
      },
      400
    );
  }
});
