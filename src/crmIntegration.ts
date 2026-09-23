import { getAdminSessionToken } from "./adminSecurity";
import { supabaseAnonKey, supabaseUrl } from "./supabase";

const CRM_SYNC_ENDPOINT =
  `${supabaseUrl}/functions/v1/recruiting-crm-sync`;

export type RecruitingCrmStatus = {
  configured: boolean;
  status: string;
  username_hint: string;
  ccodsog: string;
  last_test_at: string | null;
  last_sync_at: string | null;
  last_sync_error: string;
  last_event_count: number;
  automatic_sync_minutes: number;
};

async function callCrm(
  action: string,
  payload: Record<string, unknown> = {}
) {
  const sessionToken = await getAdminSessionToken();

  const response = await fetch(CRM_SYNC_ENDPOINT, {
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
        "Errore durante la comunicazione con il CRM +Energia."
    );
  }

  return data;
}

export async function getRecruitingCrmStatus(): Promise<RecruitingCrmStatus> {
  return (await callCrm("status")) as RecruitingCrmStatus;
}

export async function saveRecruitingCrmCredentials(input: {
  username?: string;
  password?: string;
  ccodsog?: string;
}) {
  return callCrm("save_credentials", input);
}

export async function testRecruitingCrmConnection() {
  return callCrm("test");
}

export async function syncRecruitingCrmNow() {
  return callCrm("sync");
}
