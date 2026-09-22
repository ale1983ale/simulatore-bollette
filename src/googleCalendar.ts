import { getAdminSessionToken } from "./adminSecurity";
import { supabaseAnonKey, supabaseUrl } from "./supabase";

const GOOGLE_CALENDAR_ENDPOINT =
  `${supabaseUrl}/functions/v1/google-calendar-oauth`;

export type GoogleCalendarStatus = {
  configured: boolean;
  connected: boolean;
  expires_at?: string | null;
};

async function callGoogleCalendar(
  action: string,
  payload: Record<string, unknown> = {}
) {
  const sessionToken = await getAdminSessionToken();

  const response = await fetch(GOOGLE_CALENDAR_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({
      action,
      session_token: sessionToken,
      ...payload,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.error ||
        "Errore durante la comunicazione con Google Calendar."
    );
  }

  return data;
}

export async function getGoogleCalendarStatus(): Promise<GoogleCalendarStatus> {
  return (await callGoogleCalendar("status")) as GoogleCalendarStatus;
}

export async function startGoogleCalendarConnection() {
  const returnUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}`
      : "";

  const data = await callGoogleCalendar("start", {
    return_url: returnUrl,
  });

  if (!data?.auth_url) {
    throw new Error("URL di autorizzazione Google non disponibile.");
  }

  return String(data.auth_url);
}

export async function disconnectGoogleCalendar() {
  return callGoogleCalendar("disconnect");
}

export async function syncGoogleCalendarEvent(eventId: string) {
  return callGoogleCalendar("sync_event", {
    event_id: eventId,
  });
}

export async function deleteGoogleCalendarEvent(eventId: string) {
  return callGoogleCalendar("delete_event", {
    event_id: eventId,
  });
}

export async function syncAllGoogleCalendarEvents() {
  return callGoogleCalendar("sync_all");
}
