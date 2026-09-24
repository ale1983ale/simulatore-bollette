import { getAdminSessionToken } from "./adminSecurity";
import { supabaseAnonKey, supabaseUrl } from "./supabase";

const PERFORMA_SYNC_ENDPOINT =
  `${supabaseUrl}/functions/v1/recruiting-performa-sync`;

export type RecruitingPerformaStatus = {
  configured: boolean;
  connected: boolean;
  needs_reconnect: boolean;
  auth_mode: string;
  username_hint: string;
  baseline_initialized: boolean;
  baseline_count: number;
  baseline_at?: string | null;
  last_sync_at: string | null;
  last_sync_error: string;
  last_candidate_count: number;
  last_new_count: number;
  automatic_sync_minutes: number;
};

async function callPerforma(
  action: string,
  payload: Record<string, unknown> = {}
) {
  const sessionToken = await getAdminSessionToken();

  const response = await fetch(PERFORMA_SYNC_ENDPOINT, {
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
        "Errore durante la comunicazione con Performa Recruit."
    );
  }

  return data;
}

export async function getRecruitingPerformaStatus(): Promise<RecruitingPerformaStatus> {
  return (await callPerforma(
    "status"
  )) as RecruitingPerformaStatus;
}

export async function saveRecruitingPerformaPassword(input: {
  username: string;
  password: string;
}) {
  return callPerforma("save_password", input);
}

export async function saveRecruitingPerformaTokens(
  tokenPayload: string
) {
  return callPerforma("save_tokens", {
    token_payload: tokenPayload,
  });
}

export async function syncRecruitingPerformaNow() {
  return callPerforma("sync");
}

export async function disconnectRecruitingPerforma() {
  return callPerforma("disconnect");
}
