import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_ORIGIN = "https://simulatore-bollette.vercel.app";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const TIME_ZONE = "Europe/Rome";

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
      scope: tokenData.scope || connection.scope || CALENDAR_SCOPE,
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
    APPUNTAMENTO_ZONA: "APPUNTAMENTO IN ZONA",
    APPUNTAMENTO_SEDE: "APPUNTAMENTO IN SEDE",
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
        "id,full_name,phone,email,operational_zone,province_code,region"
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

  const summary = candidateName
    ? `${typeLabel} - ${candidateName}`
    : typeLabel;

  const descriptionParts = [
    event.completed ? "ATTIVITÀ COMPLETATA" : "",
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
  const calendarId = String(event.google_calendar_id || connection.calendar_id || "primary");
  const body = buildGoogleEvent(event, candidate);

  try {
    let response: Response;
    let googleEventId = event.google_event_id
      ? String(event.google_event_id)
      : "";

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
        throw new Error(errorText || "Errore aggiornamento evento Google.");
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
        scope: tokenData.scope || CALENDAR_SCOPE,
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

    const admin = await validateAdmin(sessionToken);

    if (action === "status") {
      const connection = await getConnection(admin.id);
      return json({
        configured: Boolean(
          GOOGLE_CLIENT_ID &&
            GOOGLE_CLIENT_SECRET &&
            GOOGLE_REDIRECT_URI
        ),
        connected: Boolean(connection?.refresh_token),
        expires_at: connection?.expires_at || null,
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
      authUrl.searchParams.set("scope", CALENDAR_SCOPE);
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
      }

      return json({ connected: false });
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
      let errors = 0;

      for (const row of rows || []) {
        try {
          await syncOneEvent(
            admin.id,
            admin.ownerKey,
            String(row.id)
          );
          synced += 1;
        } catch {
          errors += 1;
        }
      }

      return json({
        connected: true,
        synced,
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
