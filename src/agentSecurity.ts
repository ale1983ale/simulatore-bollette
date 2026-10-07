import { supabase, supabaseAnonKey, supabaseUrl } from "./supabase";
import { getAdminSessionToken } from "./adminSecurity";

export type SecureAgentSession = {
  token: string;
  id: number;
  nome: string;
  cognome: string;
  username: string;
  owner_admin_id?: number | null;
  provvigioni_visible?: boolean;
};

export type SafeAgentRecord = {
  id: number;
  nome: string;
  cognome: string;
  username: string;
  password?: string;
  owner_admin_id?: number | null;
  provvigioni_visible?: boolean;
  password_configured?: boolean;
  password_changed_at?: string | null;
};

export async function agentLogin(
  username: string,
  password: string
): Promise<SecureAgentSession | null> {
  const { data, error } = await supabase.rpc("agent_login", {
    p_username: username.trim(),
    p_password: password,
  });

  if (error) throw error;
  const session = (data || null) as SecureAgentSession | null;
  if (!session?.token) return null;

  localStorage.setItem("agent_session", JSON.stringify(session));
  return session;
}

export async function ensureAgentSession(): Promise<SecureAgentSession | null> {
  const raw = localStorage.getItem("agent_session");
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as any;

    if (parsed?.token && parsed?.username) {
      const { data, error } = await supabase.rpc("agent_session_profile", {
        p_session_token: parsed.token,
      });

      if (error || !data) {
        localStorage.removeItem("agent_session");
        return null;
      }

      const validated = {
        ...(data as Omit<SecureAgentSession, "token">),
        token: parsed.token,
      } as SecureAgentSession;

      localStorage.setItem("agent_session", JSON.stringify(validated));
      return validated;
    }

    // Migrazione trasparente delle vecchie sessioni che contenevano
    // username/password in chiaro.
    if (parsed?.username && parsed?.password) {
      return await agentLogin(
        String(parsed.username),
        String(parsed.password)
      );
    }
  } catch (error) {
    console.error("AGENT SESSION MIGRATION ERROR:", error);
  }

  localStorage.removeItem("agent_session");
  return null;
}

export async function agentLogout(): Promise<void> {
  const raw = localStorage.getItem("agent_session");

  try {
    if (raw) {
      const parsed = JSON.parse(raw) as SecureAgentSession;
      if (parsed?.token) {
        await supabase.rpc("agent_logout", {
          p_session_token: parsed.token,
        });
      }
    }
  } catch (error) {
    console.error("AGENT LOGOUT ERROR:", error);
  } finally {
    localStorage.removeItem("agent_session");
  }
}

export async function adminAgentList(
  ownerFilter = "ALL"
): Promise<SafeAgentRecord[]> {
  const token = await getAdminSessionToken();
  const { data, error } = await supabase.rpc("admin_agent_list", {
    p_session_token: token,
    p_owner_filter: ownerFilter,
  });

  if (error) throw error;
  return Array.isArray(data) ? (data as SafeAgentRecord[]) : [];
}

export async function adminAgentCreate(input: {
  nome: string;
  cognome: string;
  username: string;
  password: string;
  ownerAdminId?: number | null;
}) {
  const token = await getAdminSessionToken();
  const { data, error } = await supabase.rpc("admin_agent_create", {
    p_session_token: token,
    p_nome: input.nome,
    p_cognome: input.cognome,
    p_username: input.username,
    p_password: input.password,
    p_owner_admin_id: input.ownerAdminId ?? null,
  });

  if (error) throw error;
  return data;
}

export async function adminAgentUpdate(input: {
  id: number;
  username: string;
  password?: string;
  ownerAdminId?: number | null;
}) {
  const token = await getAdminSessionToken();
  const { data, error } = await supabase.rpc("admin_agent_update", {
    p_session_token: token,
    p_agent_id: input.id,
    p_username: input.username,
    p_password: input.password || null,
    p_owner_admin_id: input.ownerAdminId ?? null,
  });

  if (error) throw error;
  return data;
}

export async function adminAgentDelete(agentId: number) {
  const token = await getAdminSessionToken();
  const { data, error } = await supabase.rpc("admin_agent_delete", {
    p_session_token: token,
    p_agent_id: agentId,
  });

  if (error) throw error;
  return data;
}

export async function adminAgentSetProvvigioniVisibility(
  agentId: number,
  visible: boolean
) {
  const token = await getAdminSessionToken();
  const { data, error } = await supabase.rpc(
    "admin_agent_set_provvigioni_visibility",
    {
      p_session_token: token,
      p_agent_id: agentId,
      p_visible: visible,
    }
  );

  if (error) throw error;
  return data;
}

export async function getAgentPasswordResetProfile(
  resetToken: string
): Promise<{
  id: number;
  nome: string;
  cognome: string;
  username: string;
} | null> {
  const { data, error } = await supabase.rpc(
    "agent_password_reset_profile",
    { p_reset_token: resetToken }
  );

  if (error) throw error;
  return (data || null) as any;
}

export async function completeAgentPasswordReset(
  resetToken: string,
  newPassword: string
) {
  const { data, error } = await supabase.rpc(
    "agent_password_reset_complete",
    {
      p_reset_token: resetToken,
      p_new_password: newPassword,
    }
  );

  if (error) throw error;
  return data;
}


export async function changeAgentPassword(input: {
  username: string;
  currentPassword: string;
  newPassword: string;
}) {
  const response = await fetch(
    `${supabaseUrl}/functions/v1/agent-password-change`,
    {
      method: "POST",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: input.username.trim(),
        current_password: input.currentPassword,
        new_password: input.newPassword,
      }),
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data?.ok === false) {
    throw new Error(
      data?.error || `Errore HTTP ${response.status}`
    );
  }

  return true;
}
