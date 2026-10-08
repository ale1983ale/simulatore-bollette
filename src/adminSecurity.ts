import { supabase } from "./supabase";

export type SecureAdminSession = {
  token: string;
  id: number;
  auth_id?: string;
  nome?: string;
  cognome?: string;
  email?: string;
  username: string;
  role?: string;
  full_access?: boolean;
  dashboard_tabs?: string[] | null;
};

function normalizeRpcData<T>(data: T | null): T | null {
  return data ?? null;
}

export async function adminLogin(username: string, password: string): Promise<SecureAdminSession | null> {
  const { data, error } = await supabase.rpc("admin_login", {
    p_username: username.trim(),
    p_password: password,
  });

  if (error) throw error;

  const session = normalizeRpcData(data as SecureAdminSession | null);
  if (!session?.token) return null;

  const { data: access, error: accessError } = await supabase.rpc("admin_dashboard_access", {
    p_session_token: session.token,
    p_action: "self",
  });
  if (accessError) throw accessError;
  const validated = { ...session, dashboard_tabs: (access as any)?.dashboard_tabs ?? null };
  localStorage.setItem("admin_session", JSON.stringify(validated));
  return validated;
}

export async function ensureAdminSession(): Promise<SecureAdminSession | null> {
  const raw = localStorage.getItem("admin_session");
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as any;

    if (parsed?.token && parsed?.username) {
      const { data, error } = await supabase.rpc("admin_session_profile", {
        p_session_token: parsed.token,
      });

      if (error || !data) {
        localStorage.removeItem("admin_session");
        return null;
      }

      const validated = {
        ...(data as Omit<SecureAdminSession, "token">),
        token: parsed.token,
      } as SecureAdminSession;

      const { data: access, error: accessError } = await supabase.rpc("admin_dashboard_access", {
        p_session_token: parsed.token,
        p_action: "self",
      });
      if (accessError) throw accessError;
      validated.dashboard_tabs = (access as any)?.dashboard_tabs ?? null;
      localStorage.setItem("admin_session", JSON.stringify(validated));
      return validated;
    }

    // Migrazione trasparente delle vecchie sessioni locali:
    // usa una sola volta le vecchie credenziali salvate, poi le sostituisce
    // con un token di sessione senza password.
    if (parsed?.username && parsed?.password) {
      return await adminLogin(String(parsed.username), String(parsed.password));
    }
  } catch (error) {
    console.error("ADMIN SESSION MIGRATION ERROR:", error);
  }

  localStorage.removeItem("admin_session");
  return null;
}

export async function getAdminSessionToken(): Promise<string> {
  const session = await ensureAdminSession();
  if (!session?.token) {
    throw new Error("Sessione admin non valida. Effettua nuovamente l'accesso.");
  }
  return session.token;
}

export async function adminLogout(): Promise<void> {
  const raw = localStorage.getItem("admin_session");

  try {
    if (raw) {
      const parsed = JSON.parse(raw) as SecureAdminSession;
      if (parsed?.token) {
        await supabase.rpc("admin_logout", {
          p_session_token: parsed.token,
        });
      }
    }
  } catch (error) {
    console.error("ADMIN LOGOUT ERROR:", error);
  } finally {
    localStorage.removeItem("admin_session");
  }
}

export async function adminListUsers(): Promise<any[]> {
  const token = await getAdminSessionToken();
  const { data, error } = await supabase.rpc("admin_list_users", {
    p_session_token: token,
  });

  if (error) throw error;
  const { data: access, error: accessError } = await supabase.rpc("admin_dashboard_access", {
    p_session_token: token,
    p_action: "list",
  });
  if (accessError) throw accessError;
  const rights = new Map((Array.isArray(access) ? access : []).map((entry: any) => [
    Number(entry.id),
    entry.dashboard_tabs ?? null,
  ]));
  return Array.isArray(data)
    ? data.map((admin: any) => ({
        ...admin,
        dashboard_tabs: rights.get(Number(admin.id)) ?? null,
      }))
    : [];
}

export async function adminSetDashboardTabs(adminId: number, tabs: string[]) {
  const token = await getAdminSessionToken();
  const { data, error } = await supabase.rpc("admin_dashboard_access", {
    p_session_token: token,
    p_action: "set",
    p_admin_id: adminId,
    p_tabs: tabs,
  });
  if (error) throw error;
  return data;
}

export async function adminCreateUser(input: {
  nome: string;
  cognome: string;
  username: string;
  password: string;
  email?: string;
}) {
  const token = await getAdminSessionToken();
  const { data, error } = await supabase.rpc("admin_create_user", {
    p_session_token: token,
    p_nome: input.nome,
    p_cognome: input.cognome,
    p_username: input.username,
    p_password: input.password,
    p_email: input.email || null,
  });

  if (error) throw error;
  return data;
}

export async function adminUpdateUser(input: {
  id: number;
  nome: string;
  cognome: string;
  username: string;
  password?: string;
  email?: string;
}) {
  const token = await getAdminSessionToken();
  const { data, error } = await supabase.rpc("admin_update_user", {
    p_session_token: token,
    p_admin_id: input.id,
    p_nome: input.nome,
    p_cognome: input.cognome,
    p_username: input.username,
    p_password: input.password || null,
    p_email: input.email || null,
  });

  if (error) throw error;
  return data;
}

export async function adminDeleteUser(adminId: number) {
  const token = await getAdminSessionToken();
  const { data, error } = await supabase.rpc("admin_delete_user", {
    p_session_token: token,
    p_admin_id: adminId,
  });

  if (error) throw error;
  return data;
}

export async function adminSetFullAccess(
  adminId: number,
  fullAccess: boolean
) {
  const token = await getAdminSessionToken();
  const { data, error } = await supabase.rpc(
    "admin_set_full_access",
    {
      p_session_token: token,
      p_admin_id: adminId,
      p_full_access: fullAccess,
    }
  );

  if (error) throw error;
  return data;
}

export async function adminUpsertSettings(
  items: Array<{ key: string; value_json: unknown }>
) {
  const token = await getAdminSessionToken();
  const { data, error } = await supabase.rpc("admin_upsert_settings", {
    p_session_token: token,
    p_items: items,
  });

  if (error) throw error;
  return data;
}


export async function adminGetSetting(key: string) {
  const token = await getAdminSessionToken();
  const { data, error } = await supabase.rpc("admin_get_setting", {
    p_session_token: token,
    p_key: key,
  });

  if (error) throw error;
  return data;
}
