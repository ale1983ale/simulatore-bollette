import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "./supabase";

export type RecruitingContext = {
  client: SupabaseClient;
  ownerKey: string;
};

let cachedContextPromise: Promise<RecruitingContext> | null = null;

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function buildRecruitingContext(): Promise<RecruitingContext> {
  const raw = localStorage.getItem("admin_session");
  if (!raw) {
    throw new Error("Sessione amministratore non trovata.");
  }

  let admin: any = null;
  try {
    admin = JSON.parse(raw);
  } catch {
    throw new Error("Sessione amministratore non valida.");
  }

  if (!admin?.id || !admin?.username) {
    throw new Error("Sessione amministratore incompleta.");
  }

  const ownerKey = await sha256(
    `recruiting-v1|${String(admin.id)}|${String(admin.username).toLocaleLowerCase("it")}`
  );

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        "x-recruiting-owner": ownerKey,
      },
    },
  });

  return { client, ownerKey };
}

export function getRecruitingContext() {
  if (!cachedContextPromise) cachedContextPromise = buildRecruitingContext();
  return cachedContextPromise;
}
