import { getAdminSessionToken } from "./adminSecurity";
import { supabaseAnonKey, supabaseUrl } from "./supabase";

const GOOGLE_CALENDAR_ENDPOINT =
  `${supabaseUrl}/functions/v1/google-calendar-oauth`;

export type GoogleCalendarStatus = {
  configured: boolean;
  connected: boolean;
  calendar_management_ready?: boolean;
  email_notifications_ready?: boolean;
  needs_reconnect?: boolean;
  activity_calendars?: string[];
  expires_at?: string | null;
};

export type GoogleCalendarExternalEvent = {
  id: string;
  calendar_id: string;
  calendar_name: string;
  summary: string;
  description: string;
  location: string;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  all_day: boolean;
  date_keys: string[];
  html_link: string;
  background_color: string;
  foreground_color: string;
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

export async function startGoogleCalendarConnection(
  customReturnUrl?: string
) {
  const returnUrl =
    customReturnUrl ||
    (typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}`
      : "");

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

export async function listGoogleCalendarEvents(
  timeMin: string,
  timeMax: string
): Promise<{
  connected: boolean;
  events: GoogleCalendarExternalEvent[];
}> {
  return (await callGoogleCalendar("list_events", {
    time_min: timeMin,
    time_max: timeMax,
  })) as {
    connected: boolean;
    events: GoogleCalendarExternalEvent[];
  };
}
