import React, { useEffect, useMemo, useState } from "react";
import {
  adminAgentCreate,
  adminAgentDelete,
  adminAgentList,
  adminAgentSetProvvigioniVisibility,
  adminAgentUpdate,
  type SafeAgentRecord,
} from "./agentSecurity";
import { adminListUsers } from "./adminSecurity";
import { supabaseAnonKey, supabaseUrl } from "./supabase";
import { getRecruitingContext, type RecruitingContext } from "./recruitingClient";
import AgentManagementToolbar from "./AgentManagementToolbar";
import {
  geocodeItalianZone,
  ITALIAN_REGIONS,
  normalizeItalianRegion,
} from "./recruitingData";

type AdminProfile = {
  id?: number;
  username?: string;
  role?: string;
  nome?: string;
  cognome?: string;
};

type EmailRecipient = {
  agenzia: string;
  email: string;
  allegato: string;
  dm: string;
  report_notify: boolean;
  agent_id: number | null;
};

type RecruitingAgent = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  zone: string;
  region: string;
  dm_reference: string;
  latitude: number | null;
  longitude: number | null;
};

type Macroarea = {
  id: string;
  name: string;
  regions: string[];
};

type EditDraft = {
  username: string;
  password: string;
  ownerAdminId: number | "";
  email: string;
  reportNotify: boolean;
  provvigioniVisible: boolean;
  phone: string;
  zone: string;
  dm: string;
  showOnMap: boolean;
};

type CreateSource = "login" | "email" | "map";

type CreateDraft = EditDraft & {
  nome: string;
  cognome: string;
  emailAttachment: string;
  insertLogin: boolean;
  insertEmailMatching: boolean;
  insertActiveAgent: boolean;
};

const EMPTY_CREATE_DRAFT: CreateDraft = {
  nome: "",
  cognome: "",
  username: "",
  password: "",
  ownerAdminId: "",
  email: "",
  reportNotify: false,
  provvigioniVisible: false,
  phone: "",
  zone: "",
  dm: "",
  showOnMap: false,
  emailAttachment: "",
  insertLogin: true,
  insertEmailMatching: false,
  insertActiveAgent: false,
};

const cardStyle: React.CSSProperties = {
  background: "white",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 16,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cbd5e1",
  borderRadius: 9,
  padding: "9px 10px",
  background: "white",
};

const buttonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: 9,
  padding: "9px 12px",
  fontWeight: 900,
  cursor: "pointer",
};

const normalizeName = (value: string) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");

function readAdminSession(): AdminProfile | null {
  try {
    const raw = localStorage.getItem("admin_session");
    return raw ? (JSON.parse(raw) as AdminProfile) : null;
  } catch {
    return null;
  }
}

async function getOwnerKey() {
  const admin = readAdminSession();
  if (!admin?.id || !admin?.username) {
    throw new Error("Sessione amministratore non valida.");
  }

  const seed = `${admin.id}|${String(admin.username)
    .trim()
    .toLowerCase()}|email-recipient-sync-v2`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(seed)
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function syncHeaders(ownerKey: string, includeJson = false) {
  return {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
    "x-client-info": `email-recipient-sync-${ownerKey}`,
    ...(includeJson ? { "Content-Type": "application/json" } : {}),
  };
}

async function loadEmailRecipients() {
  const ownerKey = await getOwnerKey();
  const response = await fetch(
    `${supabaseUrl}/rest/v1/email_recipient_lists?owner_key=eq.${ownerKey}&select=recipients&limit=1`,
    { headers: syncHeaders(ownerKey) }
  );
  if (!response.ok) throw new Error(await response.text());

  const rows = (await response.json()) as Array<{ recipients?: unknown }>;
  const saved = Array.isArray(rows[0]?.recipients)
    ? (rows[0]?.recipients as any[])
    : [];

  return saved
    .map((item: any): EmailRecipient => ({
      agenzia: String(item?.agenzia || ""),
      email: String(item?.email || ""),
      allegato: String(item?.allegato || ""),
      dm: String(item?.dm || ""),
      report_notify: item?.report_notify === true,
      agent_id: item?.agent_id ? Number(item.agent_id) : null,
    }))
    .filter(
      (item) =>
        item.agenzia || item.email || item.allegato || item.dm
    );
}

async function saveEmailRecipients(recipients: EmailRecipient[]) {
  const ownerKey = await getOwnerKey();
  const response = await fetch(
    `${supabaseUrl}/rest/v1/email_recipient_lists?on_conflict=owner_key`,
    {
      method: "POST",
      headers: {
        ...syncHeaders(ownerKey, true),
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        owner_key: ownerKey,
        recipients,
        updated_at: new Date().toISOString(),
      }),
    }
  );
  if (!response.ok) throw new Error(await response.text());
}

export default function UnifiedAgentManagement({
  adminProfile,
  onOpenEmailMatches,
  onOpenZones,
  onOpenAdminManagement,
}: {
  adminProfile: AdminProfile | null;
  onOpenEmailMatches: (targetAgency?: string) => void;
  onOpenZones: () => void;
  onOpenAdminManagement: () => void;
}) {
  const [loginAgents, setLoginAgents] = useState<SafeAgentRecord[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);
  const [recipients, setRecipients] = useState<EmailRecipient[]>([]);
  const [recruitingAgents, setRecruitingAgents] = useState<RecruitingAgent[]>([]);
  const [macroareas, setMacroareas] = useState<Macroarea[]>([]);
  const [ctx, setCtx] = useState<RecruitingContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [archivedDiscrepancyKeys, setArchivedDiscrepancyKeys] =
    useState<Set<string>>(() => new Set());
  const [archivedAlertsOpen, setArchivedAlertsOpen] =
    useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createSource, setCreateSource] =
    useState<CreateSource>("login");
  const [createDraft, setCreateDraft] = useState<CreateDraft>({
    ...EMPTY_CREATE_DRAFT,
  });
  const [createDmCustomOpen, setCreateDmCustomOpen] =
    useState(false);
  const [editDmCustomOpen, setEditDmCustomOpen] =
    useState(false);

  const loadArchivedDiscrepancies = async (
    context?: RecruitingContext
  ) => {
    const active =
      context || ctx || (await getRecruitingContext());

    const { data, error } = await active.client
      .from("recruiting_agent_discrepancy_archives")
      .select("alert_key")
      .eq("owner_key", active.ownerKey);

    if (error) throw error;

    setArchivedDiscrepancyKeys(
      new Set(
        (data || [])
          .map((row: any) => String(row.alert_key || ""))
          .filter(Boolean)
      )
    );
  };

  const loadAll = async () => {
    setLoading(true);
    setNotice("");

    try {
      const context = await getRecruitingContext();
      setCtx(context);

      const [
        loginRows,
        emailRows,
        recruitingResult,
        adminRows,
        macroResult,
        macroRegionsResult,
        archivedResult,
      ] = await Promise.all([
        adminAgentList("ALL"),
        loadEmailRecipients(),
        context.client
          .from("recruiting_active_agents")
          .select(
            "id,first_name,last_name,phone,zone,region,dm_reference,dm1,dm2,latitude,longitude"
          )
          .order("last_name", { ascending: true })
          .order("first_name", { ascending: true }),
        adminProfile?.role === "super_admin"
          ? adminListUsers()
          : Promise.resolve([]),
        context.client
          .from("recruiting_macroareas")
          .select("id,name")
          .order("name", { ascending: true }),
        context.client
          .from("recruiting_macroarea_regions")
          .select("macroarea_id,region"),
        context.client
          .from("recruiting_agent_discrepancy_archives")
          .select("alert_key")
          .eq("owner_key", context.ownerKey),
      ]);

      if (recruitingResult.error) throw recruitingResult.error;
      if (macroResult.error) throw macroResult.error;
      if (macroRegionsResult.error) throw macroRegionsResult.error;
      if (archivedResult.error) throw archivedResult.error;

      const macroRegionMap = new Map<string, string[]>();
      (macroRegionsResult.data || []).forEach((row: any) => {
        const macroId = String(row.macroarea_id);
        const list = macroRegionMap.get(macroId) || [];
        list.push(String(row.region || ""));
        macroRegionMap.set(macroId, list);
      });

      setMacroareas(
        (macroResult.data || []).map((row: any) => ({
          id: String(row.id),
          name: String(row.name || ""),
          regions: macroRegionMap.get(String(row.id)) || [],
        }))
      );
      setLoginAgents(loginRows || []);
      setRecipients(emailRows || []);
      setAdmins(adminRows || []);
      setArchivedDiscrepancyKeys(
        new Set(
          (archivedResult.data || [])
            .map((row: any) => String(row.alert_key || ""))
            .filter(Boolean)
        )
      );
      setRecruitingAgents(
        (recruitingResult.data || []).map((row: any) => ({
          id: String(row.id),
          first_name: String(row.first_name || ""),
          last_name: String(row.last_name || ""),
          phone: String(row.phone || ""),
          zone: String(row.zone || ""),
          region: String(row.region || ""),
          dm_reference: String(
            row.dm_reference || row.dm1 || row.dm2 || ""
          ),
          latitude:
            row.latitude === null || row.latitude === undefined
              ? null
              : Number(row.latitude),
          longitude:
            row.longitude === null || row.longitude === undefined
              ? null
              : Number(row.longitude),
        }))
      );
    } catch (error: any) {
      console.error(error);
      setNotice(
        "Errore nel caricamento Gestione Agenti: " +
          (error?.message || error)
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, [adminProfile?.id, adminProfile?.role]);

  useEffect(() => {
    if (!adminProfile?.id) return;

    const refreshArchives = () => {
      void loadArchivedDiscrepancies().catch((error) => {
        console.warn(
          "ARCHIVED AGENT ALERTS SYNC ERROR:",
          error
        );
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshArchives();
      }
    };

    window.addEventListener("focus", refreshArchives);
    document.addEventListener(
      "visibilitychange",
      onVisibility
    );

    const timer = window.setInterval(
      refreshArchives,
      30000
    );

    return () => {
      window.removeEventListener("focus", refreshArchives);
      document.removeEventListener(
        "visibilitychange",
        onVisibility
      );
      window.clearInterval(timer);
    };
  }, [adminProfile?.id, ctx]);

  const applyCreatePrefill = (prefill: {
    source?: CreateSource;
    fullName?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    emailAttachment?: string;
    dm?: string;
    zone?: string;
    region?: string;
    provinceCode?: string;
    showOnMap?: boolean;
    reportNotify?: boolean;
    insertLogin?: boolean;
    insertEmailMatching?: boolean;
    insertActiveAgent?: boolean;
  }) => {
    const rawFullName = String(
      prefill.fullName ||
        `${prefill.firstName || ""} ${prefill.lastName || ""}`
    )
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleUpperCase("it");

    const parts = rawFullName.split(" ").filter(Boolean);
    const nome = parts.shift() || "";
    const cognome = parts.join(" ");
    const source: CreateSource =
      prefill.source === "email" || prefill.source === "map"
        ? prefill.source
        : "login";

    setExpandedId(null);
    setDraft(null);
    setCreateOpen(true);
    setCreateSource(source);
    setCreateDmCustomOpen(false);
    setCreateDraft({
      ...EMPTY_CREATE_DRAFT,
      nome,
      cognome,
      email: String(prefill.email || "").trim(),
      emailAttachment: String(
        prefill.emailAttachment || ""
      ).trim(),
      phone: String(prefill.phone || "").trim(),
      zone: String(
        prefill.zone ||
          prefill.region ||
          ""
      )
        .trim()
        .toLocaleUpperCase("it"),
      dm: String(prefill.dm || "")
        .trim()
        .toLocaleUpperCase("it"),
      reportNotify: prefill.reportNotify === true,
      showOnMap: prefill.showOnMap === true,
      insertLogin:
        prefill.insertLogin === undefined
          ? source === "login"
          : prefill.insertLogin,
      insertEmailMatching:
        prefill.insertEmailMatching === undefined
          ? source === "email" ||
            Boolean(String(prefill.email || "").trim())
          : prefill.insertEmailMatching,
      insertActiveAgent:
        prefill.insertActiveAgent === undefined
          ? source === "map" ||
            Boolean(
              String(prefill.phone || "").trim() ||
                String(prefill.zone || "").trim() ||
                String(prefill.region || "").trim()
            )
          : prefill.insertActiveAgent,
      ownerAdminId: adminProfile?.id || "",
    });

    setNotice(
      rawFullName
        ? `${rawFullName}: nuova scheda agente aperta da ${source === "login" ? "LOGIN" : source === "email" ? "ABBINAMENTO EMAIL" : "MAPPE / AGENTI ATTIVI"}.`
        : `Nuova scheda agente aperta da ${source === "login" ? "LOGIN" : source === "email" ? "ABBINAMENTO EMAIL" : "MAPPE / AGENTI ATTIVI"}.`
    );

    window.setTimeout(() => {
      document
        .getElementById("uam-new-agent-form")
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    }, 120);
  };

  useEffect(() => {
    let raw = "";
    try {
      raw =
        sessionStorage.getItem(
          "unified_agent_create_prefill"
        ) || "";
    } catch {
      raw = "";
    }

    if (!raw) return;

    try {
      applyCreatePrefill(JSON.parse(raw));
    } finally {
      try {
        sessionStorage.removeItem(
          "unified_agent_create_prefill"
        );
      } catch {
        // Nessuna azione necessaria.
      }
    }
  }, [adminProfile?.id]);

  useEffect(() => {
    const onOpenUnifiedAgentCreate = (event: Event) => {
      const detail = (
        event as CustomEvent<Record<string, unknown>>
      ).detail;

      if (!detail) return;
      applyCreatePrefill(detail as any);

      try {
        sessionStorage.removeItem(
          "unified_agent_create_prefill"
        );
      } catch {
        // Nessuna azione necessaria.
      }
    };

    window.addEventListener(
      "open-unified-agent-create",
      onOpenUnifiedAgentCreate as EventListener
    );

    return () => {
      window.removeEventListener(
        "open-unified-agent-create",
        onOpenUnifiedAgentCreate as EventListener
      );
    };
  }, [adminProfile?.id]);

  useEffect(() => {
    const onRecipientListUpdated = () => {
      void loadAll();
    };

    window.addEventListener(
      "email-recipient-list-updated",
      onRecipientListUpdated
    );

    return () => {
      window.removeEventListener(
        "email-recipient-list-updated",
        onRecipientListUpdated
      );
    };
  }, [adminProfile?.id, adminProfile?.role]);

  const emailByAgentId = useMemo(() => {
    const map = new Map<number, EmailRecipient>();
    recipients.forEach((item) => {
      if (item.agent_id) map.set(Number(item.agent_id), item);
    });
    return map;
  }, [recipients]);

  const emailByName = useMemo(() => {
    const map = new Map<string, EmailRecipient>();
    recipients.forEach((item) => {
      const key = normalizeName(item.agenzia);
      if (key && !map.has(key)) map.set(key, item);
    });
    return map;
  }, [recipients]);

  const recruitingByName = useMemo(() => {
    const map = new Map<string, RecruitingAgent>();
    recruitingAgents.forEach((item) => {
      const key = normalizeName(
        `${item.first_name} ${item.last_name}`
      );
      if (key && !map.has(key)) map.set(key, item);
    });
    return map;
  }, [recruitingAgents]);

  const dmSuggestions = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...recruitingAgents.map((item) => item.dm_reference),
            ...recipients.map((item) => item.dm),
          ]
            .map((value) => String(value || "").trim())
            .filter(Boolean)
        )
      ).sort((a, b) =>
        a.localeCompare(b, "it", { sensitivity: "base" })
      ),
    [recruitingAgents, recipients]
  );

  const macroareaByRegion = useMemo(() => {
    const map = new Map<string, string>();
    macroareas.forEach((macro) => {
      macro.regions.forEach((region) => {
        const normalized = normalizeItalianRegion(region);
        if (normalized && !map.has(normalized)) {
          map.set(normalized, macro.name);
        }
      });
    });
    return map;
  }, [macroareas]);

  const rows = useMemo(
    () =>
      loginAgents
        .map((agent) => {
          const fullName = `${agent.nome || ""} ${agent.cognome || ""}`.trim();
          const nameKey = normalizeName(fullName);
          const email =
            emailByAgentId.get(Number(agent.id)) ||
            emailByName.get(nameKey) ||
            null;
          const recruiting =
            recruitingByName.get(nameKey) ||
            (email?.agenzia
              ? recruitingByName.get(normalizeName(email.agenzia)) || null
              : null);

          return { agent, fullName, email, recruiting };
        })
        .filter((row) => {
          const needle = search.trim().toLocaleLowerCase("it");
          if (!needle) return true;
          return [
            row.fullName,
            row.agent.username,
            row.email?.email,
            row.recruiting?.phone,
            row.recruiting?.zone,
            row.email?.dm,
            row.recruiting?.dm_reference,
          ]
            .filter(Boolean)
            .some((value) =>
              String(value)
                .toLocaleLowerCase("it")
                .includes(needle)
            );
        })
        .sort((a, b) =>
          a.fullName.localeCompare(b.fullName, "it", {
            sensitivity: "base",
          })
        ),
    [
      loginAgents,
      emailByAgentId,
      emailByName,
      recruitingByName,
      search,
    ]
  );

  useEffect(() => {
    if (loading) return;

    let raw = "";
    try {
      raw =
        sessionStorage.getItem(
          "agent_management_open_target"
        ) || "";
    } catch {
      raw = "";
    }

    if (!raw) return;

    let target: any = null;
    try {
      target = JSON.parse(raw);
    } catch {
      target = null;
    }

    if (!target) return;

    const targetId = String(
      target.recruitingAgentId || ""
    );
    const targetName = normalizeName(
      String(target.fullName || "")
    );

    const recruiting =
      recruitingAgents.find(
        (agent) => String(agent.id) === targetId
      ) ||
      recruitingAgents.find(
        (agent) =>
          normalizeName(
            `${agent.first_name} ${agent.last_name}`
          ) === targetName
      ) ||
      null;

    const resolvedName = recruiting
      ? normalizeName(
          `${recruiting.first_name} ${recruiting.last_name}`
        )
      : targetName;

    const login =
      loginAgents.find(
        (agent) =>
          normalizeName(
            `${agent.nome || ""} ${agent.cognome || ""}`
          ) === resolvedName
      ) || null;

    if (login) {
      const agentId = Number(login.id);
      const email =
        emailByAgentId.get(agentId) ||
        emailByName.get(resolvedName) ||
        null;

      setSearch("");
      setCreateOpen(false);
      setExpandedId(agentId);
      setEditDmCustomOpen(false);
      setDraft({
        username: login.username || "",
        password: login.password || "",
        ownerAdminId: login.owner_admin_id || "",
        email: email?.email || "",
        reportNotify: email?.report_notify === true,
        provvigioniVisible:
          login.provvigioni_visible === true,
        phone: recruiting?.phone || "",
        zone: recruiting?.zone || "",
        dm:
          recruiting?.dm_reference ||
          email?.dm ||
          "",
        showOnMap:
          recruiting?.latitude !== null &&
          recruiting?.latitude !== undefined &&
          recruiting?.longitude !== null &&
          recruiting?.longitude !== undefined,
      });

      window.setTimeout(() => {
        document
          .querySelector(
            `[data-uam-agent-row="${agentId}"]`
          )
          ?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
      }, 180);
    } else if (recruiting || targetName) {
      const displayName = recruiting
        ? `${recruiting.first_name} ${recruiting.last_name}`
        : String(target.fullName || "");

      applyCreatePrefill({
        source: "map",
        fullName: displayName,
        phone:
          recruiting?.phone ||
          String(target.phone || ""),
        zone:
          recruiting?.zone ||
          String(target.zone || ""),
        region:
          recruiting?.region ||
          String(target.region || ""),
        dm:
          recruiting?.dm_reference ||
          String(target.dm || ""),
        showOnMap:
          recruiting
            ? recruiting.latitude !== null &&
              recruiting.longitude !== null
            : target.showOnMap === true,
        insertLogin: true,
        insertActiveAgent: true,
      });
    }

    try {
      sessionStorage.removeItem(
        "agent_management_open_target"
      );
    } catch {
      // Nessuna azione necessaria.
    }
  }, [
    loading,
    loginAgents,
    recruitingAgents,
    emailByAgentId,
    emailByName,
  ]);

  const branchDiscrepancies = useMemo(() => {
    type BranchRecord = {
      key: string;
      fullName: string;
      login: SafeAgentRecord | null;
      email: EmailRecipient | null;
      recruiting: RecruitingAgent | null;
      missing: Array<"login" | "email" | "map">;
    };

    const records = new Map<string, BranchRecord>();
    const loginKeyById = new Map<number, string>();
    const loginKeyByName = new Map<string, string>();

    loginAgents.forEach((agent) => {
      const id = Number(agent.id || 0);
      const fullName = `${agent.nome || ""} ${agent.cognome || ""}`
        .trim()
        .toLocaleUpperCase("it");
      const nameKey = normalizeName(fullName);
      const key = id > 0 ? `login:${id}` : `name:${nameKey}`;

      records.set(key, {
        key,
        fullName,
        login: agent,
        email: null,
        recruiting: null,
        missing: [],
      });

      if (id > 0) loginKeyById.set(id, key);
      if (nameKey) loginKeyByName.set(nameKey, key);
    });

    recipients.forEach((recipient) => {
      const nameKey = normalizeName(recipient.agenzia);
      const linkedById =
        recipient.agent_id &&
        loginKeyById.get(Number(recipient.agent_id));
      const linkedByName = loginKeyByName.get(nameKey);
      const key =
        linkedById ||
        linkedByName ||
        (nameKey ? `name:${nameKey}` : "");

      if (!key) return;

      const existing = records.get(key);
      if (existing) {
        existing.email = recipient;
        if (!existing.fullName) {
          existing.fullName = String(recipient.agenzia || "")
            .trim()
            .toLocaleUpperCase("it");
        }
        return;
      }

      // Una riga email senza Login e senza Agente Attivo non viene
      // considerata automaticamente un agente: può essere un semplice
      // destinatario email.
    });

    recruitingAgents.forEach((agent) => {
      const fullName = `${agent.first_name || ""} ${agent.last_name || ""}`
        .trim()
        .toLocaleUpperCase("it");
      const nameKey = normalizeName(fullName);

      let key = loginKeyByName.get(nameKey) || "";

      if (!key) {
        const recipient = emailByName.get(nameKey);
        if (recipient?.agent_id) {
          key =
            loginKeyById.get(Number(recipient.agent_id)) || "";
        }
      }

      if (!key) key = `name:${nameKey}`;

      const existing = records.get(key);
      if (existing) {
        existing.recruiting = agent;
        if (!existing.email) {
          existing.email = emailByName.get(nameKey) || null;
        }
        if (!existing.fullName) existing.fullName = fullName;
        return;
      }

      records.set(key, {
        key,
        fullName,
        login: null,
        email: emailByName.get(nameKey) || null,
        recruiting: agent,
        missing: [],
      });
    });

    return Array.from(records.values())
      .map((record) => {
        const missing: Array<"login" | "email" | "map"> = [];
        if (!record.login) missing.push("login");
        if (!record.email) missing.push("email");
        if (!record.recruiting) missing.push("map");
        return { ...record, missing };
      })
      .filter((record) => record.missing.length > 0)
      .sort((a, b) =>
        a.fullName.localeCompare(b.fullName, "it", {
          sensitivity: "base",
        })
      );
  }, [
    loginAgents,
    recipients,
    recruitingAgents,
    emailByName,
  ]);

  const discrepancyArchiveKey = (
    item: (typeof branchDiscrepancies)[number]
  ) =>
    `${item.key}|${[...item.missing].sort().join(",")}`;

  const activeDiscrepancies = useMemo(
    () =>
      branchDiscrepancies.filter(
        (item) =>
          !archivedDiscrepancyKeys.has(
            discrepancyArchiveKey(item)
          )
      ),
    [branchDiscrepancies, archivedDiscrepancyKeys]
  );

  const archivedDiscrepancies = useMemo(
    () =>
      branchDiscrepancies.filter((item) =>
        archivedDiscrepancyKeys.has(
          discrepancyArchiveKey(item)
        )
      ),
    [branchDiscrepancies, archivedDiscrepancyKeys]
  );

  useEffect(() => {
    if (loading || !ctx) return;

    const currentKeys = new Set(
      branchDiscrepancies.map((item) =>
        discrepancyArchiveKey(item)
      )
    );
    const staleKeys = Array.from(
      archivedDiscrepancyKeys
    ).filter((key) => !currentKeys.has(key));

    if (!staleKeys.length) return;

    const next = new Set(archivedDiscrepancyKeys);
    staleKeys.forEach((key) => next.delete(key));
    setArchivedDiscrepancyKeys(next);

    void ctx.client
      .from("recruiting_agent_discrepancy_archives")
      .delete()
      .eq("owner_key", ctx.ownerKey)
      .in("alert_key", staleKeys)
      .then(({ error }) => {
        if (error) {
          console.warn(
            "ARCHIVED AGENT ALERT CLEANUP ERROR:",
            error
          );
        }
      });
  }, [
    loading,
    ctx,
    branchDiscrepancies,
    archivedDiscrepancyKeys,
  ]);

  const archiveDiscrepancy = async (
    item: (typeof branchDiscrepancies)[number]
  ) => {
    const active =
      ctx || (await getRecruitingContext());
    const key = discrepancyArchiveKey(item);

    const next = new Set(archivedDiscrepancyKeys);
    next.add(key);
    setArchivedDiscrepancyKeys(next);

    const { error } = await active.client
      .from("recruiting_agent_discrepancy_archives")
      .upsert(
        {
          owner_key: active.ownerKey,
          alert_key: key,
          archived_at: new Date().toISOString(),
        },
        {
          onConflict: "owner_key,alert_key",
        }
      );

    if (error) {
      const rollback = new Set(next);
      rollback.delete(key);
      setArchivedDiscrepancyKeys(rollback);
      throw error;
    }
  };

  const restoreDiscrepancy = async (
    item: (typeof branchDiscrepancies)[number]
  ) => {
    const active =
      ctx || (await getRecruitingContext());
    const key = discrepancyArchiveKey(item);

    const next = new Set(archivedDiscrepancyKeys);
    next.delete(key);
    setArchivedDiscrepancyKeys(next);

    const { error } = await active.client
      .from("recruiting_agent_discrepancy_archives")
      .delete()
      .eq("owner_key", active.ownerKey)
      .eq("alert_key", key);

    if (error) {
      const rollback = new Set(next);
      rollback.add(key);
      setArchivedDiscrepancyKeys(rollback);
      throw error;
    }
  };

  const discrepancyByLoginId = useMemo(() => {
    const map = new Map<number, (typeof branchDiscrepancies)[number]>();
    activeDiscrepancies.forEach((item) => {
      const id = Number(item.login?.id || 0);
      if (id > 0) map.set(id, item);
    });
    return map;
  }, [activeDiscrepancies]);

  const openDiscrepancy = (
    item: (typeof branchDiscrepancies)[number],
    preferred?: "login" | "email" | "map"
  ) => {
    const target = preferred || item.missing[0];

    if (item.login) {
      const id = Number(item.login.id);
      setSearch("");
      setCreateOpen(false);
      setExpandedId(id);
      setEditDmCustomOpen(false);
      setDraft({
        username: item.login.username || "",
        password: item.login.password || "",
        ownerAdminId: item.login.owner_admin_id || "",
        email: item.email?.email || "",
        reportNotify: item.email?.report_notify === true,
        provvigioniVisible:
          item.login.provvigioni_visible === true,
        phone: item.recruiting?.phone || "",
        zone: item.recruiting?.zone || "",
        dm:
          item.recruiting?.dm_reference ||
          item.email?.dm ||
          "",
        showOnMap:
          item.recruiting?.latitude !== null &&
          item.recruiting?.latitude !== undefined &&
          item.recruiting?.longitude !== null &&
          item.recruiting?.longitude !== undefined,
      });

      window.setTimeout(() => {
        const section = document.querySelector(
          `[data-uam-agent-section="${target}"][data-uam-agent-id="${id}"]`
        ) as HTMLElement | null;

        const rowElement = document.querySelector(
          `[data-uam-agent-row="${id}"]`
        ) as HTMLElement | null;

        (section || rowElement)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 180);

      return;
    }

    const source: CreateSource = item.email ? "email" : "map";

    applyCreatePrefill({
      source,
      fullName: item.fullName,
      email: item.email?.email || "",
      emailAttachment: item.email?.allegato || "",
      dm:
        item.recruiting?.dm_reference ||
        item.email?.dm ||
        "",
      phone: item.recruiting?.phone || "",
      zone: item.recruiting?.zone || "",
      region: item.recruiting?.region || "",
      reportNotify: item.email?.report_notify === true,
      showOnMap:
        item.recruiting?.latitude !== null &&
        item.recruiting?.latitude !== undefined &&
        item.recruiting?.longitude !== null &&
        item.recruiting?.longitude !== undefined,
      insertLogin: true,
      insertEmailMatching: Boolean(item.email),
      insertActiveAgent: Boolean(item.recruiting),
    });
  };

  const openRow = (row: (typeof rows)[number]) => {
    const id = Number(row.agent.id);
    if (!id) return;

    if (expandedId === id) {
      setExpandedId(null);
      setDraft(null);
      return;
    }

    setExpandedId(id);
    setEditDmCustomOpen(false);
    setDraft({
      username: row.agent.username || "",
      password: row.agent.password || "",
      ownerAdminId: row.agent.owner_admin_id || "",
      email: row.email?.email || "",
      reportNotify: row.email?.report_notify === true,
      provvigioniVisible: row.agent.provvigioni_visible === true,
      phone: row.recruiting?.phone || "",
      zone: row.recruiting?.zone || "",
      dm:
        row.recruiting?.dm_reference ||
        row.email?.dm ||
        "",
      showOnMap:
        row.recruiting?.latitude !== null &&
        row.recruiting?.latitude !== undefined &&
        row.recruiting?.longitude !== null &&
        row.recruiting?.longitude !== undefined,
    });
  };

  const toggleMapVisibility = async (
    row: (typeof rows)[number],
    enabled: boolean
  ) => {
    if (busy || !ctx) return;
    if (!row.recruiting?.id || (enabled && !row.recruiting.zone.trim())) {
      setNotice(
        `${row.fullName.toUpperCase()}: apri la scheda e inserisci una zona prima di attivare MAPPA.`
      );
      if (enabled) openRow(row);
      return;
    }

    setBusy(true);
    setNotice("");
    try {
      let latitude: number | null = null;
      let longitude: number | null = null;
      if (enabled) {
        const geo = await geocodeItalianZone(row.recruiting.zone.trim());
        if (
          geo.latitude === null ||
          geo.longitude === null ||
          !Number.isFinite(geo.latitude) ||
          !Number.isFinite(geo.longitude)
        ) {
          throw new Error("Impossibile individuare la zona sulla mappa. Verifica la città nella scheda agente.");
        }
        latitude = geo.latitude;
        longitude = geo.longitude;
      }
      const { data: updatedMapRecord, error } = await ctx.client
        .from("recruiting_active_agents")
        .update({
          latitude,
          longitude,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.recruiting.id)
        .eq("owner_key", ctx.ownerKey)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!updatedMapRecord) {
        throw new Error("Agente non aggiornato sulla mappa. Ricarica i dati e riprova.");
      }
      setRecruitingAgents((current) =>
        current.map((item) =>
          item.id === row.recruiting?.id
            ? { ...item, latitude, longitude }
            : item
        )
      );
      if (expandedId === Number(row.agent.id)) {
        setDraft((current) => current ? { ...current, showOnMap: enabled } : current);
      }
      setNotice(
        `${row.fullName.toUpperCase()}: ${enabled ? "VISIBILE" : "NON VISIBILE"} SULLA MAPPA. Modifica salvata.`
      );
    } catch (error: any) {
      setNotice("Errore MAPPA: " + (error?.message || error));
    } finally {
      setBusy(false);
    }
  };

  const saveRow = async (row: (typeof rows)[number]) => {
    if (!draft || !row.agent.id) return;

    setBusy(true);
    setNotice("");

    try {
      const agentId = Number(row.agent.id);
      const canonicalName = row.fullName.trim();

      await adminAgentUpdate({
        id: agentId,
        username: draft.username.trim(),
        password:
          draft.password.trim() &&
          draft.password.trim() !== String(row.agent.password || "").trim()
            ? draft.password.trim()
            : undefined,
        ownerAdminId:
          draft.ownerAdminId === ""
            ? null
            : Number(draft.ownerAdminId),
      });

      if (
        draft.provvigioniVisible !==
        Boolean(row.agent.provvigioni_visible)
      ) {
        await adminAgentSetProvvigioniVisibility(
          agentId,
          draft.provvigioniVisible
        );
      }

      const nextRecipients = recipients.map((item) => ({ ...item }));
      let recipientIndex = nextRecipients.findIndex(
        (item) => Number(item.agent_id || 0) === agentId
      );
      if (recipientIndex < 0) {
        recipientIndex = nextRecipients.findIndex(
          (item) =>
            normalizeName(item.agenzia) ===
            normalizeName(canonicalName)
        );
      }

      const previousRecipient =
        recipientIndex >= 0
          ? nextRecipients[recipientIndex]
          : null;

      const nextRecipient: EmailRecipient = {
        agenzia: canonicalName,
        email: draft.email.trim(),
        allegato: previousRecipient?.allegato || "",
        dm: draft.dm.trim(),
        report_notify: draft.reportNotify,
        agent_id: agentId,
      };

      if (recipientIndex >= 0) {
        nextRecipients[recipientIndex] = nextRecipient;
      } else if (
        nextRecipient.email ||
        nextRecipient.dm ||
        nextRecipient.report_notify
      ) {
        nextRecipients.push(nextRecipient);
      }

      await saveEmailRecipients(nextRecipients);

      if (ctx) {
        const currentRecruiting = row.recruiting;
        const needsRecruiting =
          Boolean(currentRecruiting) ||
          Boolean(draft.phone.trim()) ||
          Boolean(draft.zone.trim()) ||
          Boolean(draft.dm.trim()) ||
          draft.showOnMap;

        if (needsRecruiting) {
          let latitude = draft.showOnMap
            ? currentRecruiting?.latitude ?? null
            : null;
          let longitude = draft.showOnMap
            ? currentRecruiting?.longitude ?? null
            : null;
          let region = currentRecruiting?.region || "";

          if (draft.showOnMap && !draft.zone.trim()) {
            throw new Error(
              "Per mostrare l'agente sulla mappa devi indicare una zona."
            );
          }

          const zoneChanged =
            draft.zone.trim() !==
            String(currentRecruiting?.zone || "").trim();

          const needsGeocode =
            Boolean(draft.zone.trim()) &&
            (zoneChanged ||
              (draft.showOnMap &&
                (latitude === null || longitude === null)));

          if (needsGeocode) {
            const geo = await geocodeItalianZone(draft.zone.trim());
            const normalizedRegion = normalizeItalianRegion(
              geo.region || draft.zone.trim()
            );
            region = ITALIAN_REGIONS.includes(
              normalizedRegion as any
            )
              ? normalizedRegion
              : region;

            if (draft.showOnMap) {
              if (
                geo.latitude === null ||
                geo.longitude === null ||
                !Number.isFinite(geo.latitude) ||
                !Number.isFinite(geo.longitude)
              ) {
                throw new Error(
                  "Non riesco a posizionare l'agente sulla mappa. Indica una città o località più precisa."
                );
              }
              latitude = geo.latitude;
              longitude = geo.longitude;
            }
          }

          if (!draft.showOnMap) {
            latitude = null;
            longitude = null;
          }

          const payload = {
            owner_key: ctx.ownerKey,
            first_name: String(row.agent.nome || "").trim(),
            last_name: String(row.agent.cognome || "").trim(),
            phone: draft.phone.trim(),
            zone: draft.zone.trim(),
            region,
            dm_reference: draft.dm.trim(),
            latitude,
            longitude,
            updated_at: new Date().toISOString(),
          };

          if (currentRecruiting?.id) {
            const { error } = await ctx.client
              .from("recruiting_active_agents")
              .update(payload)
              .eq("id", currentRecruiting.id)
              .eq("owner_key", ctx.ownerKey);
            if (error) throw error;
          } else {
            const { error } = await ctx.client
              .from("recruiting_active_agents")
              .insert(payload);
            if (error) throw error;
          }
        }
      }

      setNotice(
        `${canonicalName}: impostazioni aggiornate in un'unica operazione.`
      );
      setExpandedId(null);
      setDraft(null);
      await loadAll();
    } catch (error: any) {
      console.error(error);
      setNotice(
        "Errore nel salvataggio: " + (error?.message || error)
      );
    } finally {
      setBusy(false);
    }
  };

  const createAgent = async () => {
    const nome = createDraft.nome.trim().toLocaleUpperCase("it");
    const cognome = createDraft.cognome.trim().toLocaleUpperCase("it");
    const username = createDraft.username.trim();
    const password = createDraft.password.trim();
    const email = createDraft.email.trim();
    const canonicalName = `${nome} ${cognome}`.trim();

    if (!nome || !cognome) {
      setNotice("Per creare un agente servono nome e cognome.");
      return;
    }

    if (
      createDraft.insertLogin &&
      (!username || !password)
    ) {
      setNotice(
        "Per creare il Login devi inserire username e password."
      );
      return;
    }

    if (
      createDraft.insertEmailMatching &&
      createDraft.reportNotify &&
      !email
    ) {
      setNotice(
        "Per attivare REPORT nell'Abbinamento Email devi inserire anche l'email dell'agente."
      );
      return;
    }

    if (
      createDraft.insertActiveAgent &&
      createDraft.showOnMap &&
      !createDraft.zone.trim()
    ) {
      setNotice(
        "Per MOSTRA IN MAPPA devi indicare la zona dell'agente."
      );
      return;
    }

    let ownerAdminId: number | null = null;

    if (createDraft.insertLogin) {
      ownerAdminId =
        adminProfile?.role === "super_admin"
          ? createDraft.ownerAdminId === ""
            ? null
            : Number(createDraft.ownerAdminId)
          : adminProfile?.id
            ? Number(adminProfile.id)
            : null;

      if (!ownerAdminId) {
        setNotice("Seleziona l'admin associato all'agente.");
        return;
      }
    }

    setBusy(true);
    setNotice("");

    try {
      let agentId = 0;

      if (createDraft.insertLogin) {
        const created = await adminAgentCreate({
          nome,
          cognome,
          username,
          password,
          ownerAdminId: Number(ownerAdminId),
        });

        agentId = Number(
          (created as any)?.id ||
            (created as any)?.agent_id ||
            (created as any)?.agentId ||
            0
        );

        if (!agentId) {
          const refreshedAgents = await adminAgentList("ALL");
          const createdAgent = (refreshedAgents || []).find(
            (item) =>
              String(item.username || "")
                .trim()
                .toLocaleLowerCase("it") ===
              username.toLocaleLowerCase("it")
          );
          agentId = Number(createdAgent?.id || 0);
        }

        if (!agentId) {
          throw new Error(
            "Account Login creato, ma non è stato possibile recuperare il suo ID."
          );
        }

        if (
          adminProfile?.role === "super_admin" &&
          createDraft.provvigioniVisible
        ) {
          await adminAgentSetProvvigioniVisibility(agentId, true);
        }
      }

      if (createDraft.insertEmailMatching) {
        const nextRecipients = recipients.map((item) => ({ ...item }));
        const recipientIndex = nextRecipients.findIndex(
          (item) =>
            (agentId > 0 &&
              Number(item.agent_id || 0) === agentId) ||
            normalizeName(item.agenzia) ===
              normalizeName(canonicalName)
        );

        const nextRecipient: EmailRecipient = {
          agenzia: canonicalName,
          email,
          allegato: createDraft.emailAttachment.trim(),
          dm: createDraft.dm.trim(),
          report_notify: createDraft.reportNotify,
          agent_id: agentId > 0 ? agentId : null,
        };

        if (recipientIndex >= 0) {
          nextRecipients[recipientIndex] = nextRecipient;
        } else {
          nextRecipients.push(nextRecipient);
        }

        await saveEmailRecipients(nextRecipients);
        window.dispatchEvent(
          new Event("email-recipient-list-updated")
        );
      }

      if (createDraft.insertActiveAgent) {
        if (!ctx) {
          throw new Error(
            "La gestione Agenti attivi / Mappe non è disponibile in questo momento."
          );
        }

        const existingRecruiting =
          recruitingByName.get(normalizeName(canonicalName)) || null;

        let latitude = existingRecruiting?.latitude ?? null;
        let longitude = existingRecruiting?.longitude ?? null;
        let region = existingRecruiting?.region || "";

        if (createDraft.zone.trim()) {
          const geo = await geocodeItalianZone(
            createDraft.zone.trim()
          );
          const normalizedRegion = normalizeItalianRegion(
            geo.region || createDraft.zone.trim()
          );

          if (ITALIAN_REGIONS.includes(normalizedRegion as any)) {
            region = normalizedRegion;
          }

          if (createDraft.showOnMap) {
            if (
              geo.latitude === null ||
              geo.longitude === null ||
              !Number.isFinite(geo.latitude) ||
              !Number.isFinite(geo.longitude)
            ) {
              throw new Error(
                "Non riesco a posizionare il nuovo agente sulla mappa. Indica una città o località più precisa."
              );
            }
            latitude = geo.latitude;
            longitude = geo.longitude;
          } else {
            latitude = null;
            longitude = null;
          }
        } else {
          region = "";
          latitude = null;
          longitude = null;
        }

        const payload = {
          owner_key: ctx.ownerKey,
          first_name: nome,
          last_name: cognome,
          phone: createDraft.phone.trim(),
          zone: createDraft.zone.trim(),
          region,
          dm_reference: createDraft.dm.trim(),
          latitude,
          longitude,
          updated_at: new Date().toISOString(),
        };

        if (existingRecruiting?.id) {
          const { error } = await ctx.client
            .from("recruiting_active_agents")
            .update(payload)
            .eq("id", existingRecruiting.id)
            .eq("owner_key", ctx.ownerKey);
          if (error) throw error;
        } else {
          const { error } = await ctx.client
            .from("recruiting_active_agents")
            .insert(payload);
          if (error) throw error;
        }
      }

      const createdParts: string[] = [];
      if (createDraft.insertLogin) createdParts.push("LOGIN");
      if (createDraft.insertEmailMatching) {
        createdParts.push("ABBINAMENTO EMAIL");
      }
      if (createDraft.insertActiveAgent) {
        createdParts.push("AGENTI ATTIVI / MAPPE");
      }

      setCreateDraft({ ...EMPTY_CREATE_DRAFT });
      setCreateSource("login");
      setCreateDmCustomOpen(false);
      setCreateOpen(false);
      setNotice(
        `${canonicalName}: creato ${createdParts.join(" + ")}.`
      );
      await loadAll();
    } catch (error: any) {
      console.error(error);
      setNotice(
        "Errore nella creazione dell'agente: " +
          (error?.message || error)
      );
      await loadAll();
    } finally {
      setBusy(false);
    }
  };

  const renderCreateIdentityFields = () => (
    <>
      <div>
        <div style={{ fontSize: 11, fontWeight: 900, marginBottom: 4 }}>
          NOME *
        </div>
        <input
          value={createDraft.nome}
          onChange={(e) =>
            setCreateDraft({
              ...createDraft,
              nome: e.target.value.toLocaleUpperCase("it"),
            })
          }
          style={inputStyle}
        />
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 900, marginBottom: 4 }}>
          COGNOME *
        </div>
        <input
          value={createDraft.cognome}
          onChange={(e) =>
            setCreateDraft({
              ...createDraft,
              cognome: e.target.value.toLocaleUpperCase("it"),
            })
          }
          style={inputStyle}
        />
      </div>
    </>
  );

  const renderCreateLoginSection = (primary = false) => (
    <section
      style={{
        background: primary ? "#f0fdf4" : "white",
        border: primary
          ? "3px solid #22c55e"
          : "2px solid #bbf7d0",
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div
        style={{
          fontWeight: 950,
          color: "#166534",
          marginBottom: 10,
        }}
      >
        🔐 LOGIN{primary ? " · SCHEDA PRINCIPALE" : ""}
      </div>

      <div
        className="uam-responsive-grid"
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit,minmax(190px,1fr))",
          gap: 10,
        }}
      >
        {primary && renderCreateIdentityFields()}

        <div>
          <div style={{ fontSize: 11, fontWeight: 900, marginBottom: 4 }}>
            USERNAME *
          </div>
          <input
            value={createDraft.username}
            onChange={(e) =>
              setCreateDraft({
                ...createDraft,
                username: e.target.value,
              })
            }
            style={inputStyle}
          />
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 900, marginBottom: 4 }}>
            PASSWORD *
          </div>
          <input
            type="text"
            value={createDraft.password}
            onChange={(e) =>
              setCreateDraft({
                ...createDraft,
                password: e.target.value,
              })
            }
            style={inputStyle}
          />
        </div>

        {adminProfile?.role === "super_admin" && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, marginBottom: 4 }}>
              ADMIN ASSOCIATO *
            </div>
            <select
              value={createDraft.ownerAdminId}
              onChange={(e) =>
                setCreateDraft({
                  ...createDraft,
                  ownerAdminId: e.target.value
                    ? Number(e.target.value)
                    : "",
                })
              }
              style={inputStyle}
            >
              <option value="">Seleziona...</option>
              {admins.map((item) => (
                <option key={item.id} value={item.id}>
                  {String(
                    `${item.nome || ""} ${item.cognome || ""}`
                  ).trim() || item.username}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {adminProfile?.role === "super_admin" && (
        <label
          style={{
            display: "inline-flex",
            gap: 7,
            alignItems: "center",
            fontWeight: 900,
            marginTop: 12,
          }}
        >
          <input
            type="checkbox"
            checked={createDraft.provvigioniVisible}
            onChange={(e) =>
              setCreateDraft({
                ...createDraft,
                provvigioniVisible: e.target.checked,
              })
            }
          />
          ACCESSO PROVVIGIONI
        </label>
      )}
    </section>
  );

  const renderCreateDmField = (label: string) => (
    <div>
      <div style={{ fontSize: 11, fontWeight: 900, marginBottom: 4 }}>
        {label}
      </div>
      <select
        value={
          createDmCustomOpen
            ? "__NEW_DM__"
            : createDraft.dm
        }
        onChange={(e) => {
          const value = e.target.value;
          if (value === "__NEW_DM__") {
            setCreateDmCustomOpen(true);
            setCreateDraft({
              ...createDraft,
              dm: "",
            });
            return;
          }
          setCreateDmCustomOpen(false);
          setCreateDraft({
            ...createDraft,
            dm: value,
          });
        }}
        style={inputStyle}
      >
        <option value="">SELEZIONA DM...</option>
        {dmSuggestions.map((dm) => (
          <option key={dm} value={dm}>
            {dm.toLocaleUpperCase("it")}
          </option>
        ))}
        <option value="__NEW_DM__">ALTRO / NUOVO DM</option>
      </select>

      {createDmCustomOpen && (
        <input
          autoFocus
          value={createDraft.dm}
          onChange={(e) =>
            setCreateDraft({
              ...createDraft,
              dm: e.target.value.toLocaleUpperCase("it"),
            })
          }
          placeholder="INSERISCI NUOVO DM"
          style={{ ...inputStyle, marginTop: 7 }}
        />
      )}
    </div>
  );

  const renderCreateEmailSection = (primary = false) => (
    <section
      style={{
        background: "#f0f9ff",
        border: primary
          ? "3px solid #0ea5e9"
          : "2px solid #7dd3fc",
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div
        style={{
          fontWeight: 950,
          color: "#0369a1",
          marginBottom: 10,
        }}
      >
        ✉️ ABBINAMENTO EMAIL{primary ? " · SCHEDA PRINCIPALE" : ""}
      </div>

      <div
        className="uam-responsive-grid"
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit,minmax(210px,1fr))",
          gap: 10,
        }}
      >
        {primary && renderCreateIdentityFields()}

        <div>
          <div style={{ fontSize: 11, fontWeight: 900, marginBottom: 4 }}>
            AGENZIA
          </div>
          <div
            style={{
              ...inputStyle,
              minHeight: 38,
              background: "#f8fafc",
              fontWeight: 900,
            }}
          >
            {`${createDraft.nome} ${createDraft.cognome}`.trim() ||
              "NOME AGENTE"}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 900, marginBottom: 4 }}>
            EMAIL
          </div>
          <input
            type="email"
            value={createDraft.email}
            onChange={(e) =>
              setCreateDraft({
                ...createDraft,
                email: e.target.value,
              })
            }
            style={inputStyle}
          />
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 900, marginBottom: 4 }}>
            ALLEGATO PREVISTO
          </div>
          <input
            value={createDraft.emailAttachment}
            onChange={(e) =>
              setCreateDraft({
                ...createDraft,
                emailAttachment: e.target.value,
              })
            }
            placeholder="Es. NOMEFILE.xlsx"
            style={inputStyle}
          />
        </div>

        {renderCreateDmField("DM")}

        <div>
          <div style={{ fontSize: 11, fontWeight: 900, marginBottom: 4 }}>
            LOGIN DI RIFERIMENTO
          </div>
          <div
            style={{
              ...inputStyle,
              minHeight: 38,
              background: createDraft.insertLogin
                ? "#ecfdf5"
                : "#f8fafc",
              color: createDraft.insertLogin
                ? "#166534"
                : "#64748b",
              fontWeight: 900,
            }}
          >
            {createDraft.insertLogin
              ? createDraft.username
                ? `${createDraft.nome} ${createDraft.cognome}`.trim() +
                  " · " +
                  createDraft.username
                : "VERRÀ COLLEGATO AL NUOVO LOGIN"
              : "NON ASSOCIATO · ATTIVA INSERISCI LOGIN"}
          </div>
        </div>
      </div>

      <label
        style={{
          display: "inline-flex",
          gap: 7,
          alignItems: "center",
          fontWeight: 900,
          marginTop: 12,
        }}
      >
        <input
          type="checkbox"
          checked={createDraft.reportNotify}
          onChange={(e) =>
            setCreateDraft({
              ...createDraft,
              reportNotify: e.target.checked,
            })
          }
        />
        REPORT ATTIVO
      </label>
    </section>
  );

  const renderCreateMapSection = (primary = false) => (
    <section
      style={{
        background: "#fff7ed",
        border: primary
          ? "3px solid #f97316"
          : "2px solid #fdba74",
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div
        style={{
          fontWeight: 950,
          color: "#c2410c",
          marginBottom: 10,
        }}
      >
        📍 MAPPE / AGENTI ATTIVI{primary ? " · SCHEDA PRINCIPALE" : ""}
      </div>

      <div
        className="uam-responsive-grid"
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit,minmax(210px,1fr))",
          gap: 10,
        }}
      >
        {primary && renderCreateIdentityFields()}

        <div>
          <div style={{ fontSize: 11, fontWeight: 900, marginBottom: 4 }}>
            CELLULARE
          </div>
          <input
            value={createDraft.phone}
            onChange={(e) =>
              setCreateDraft({
                ...createDraft,
                phone: e.target.value,
              })
            }
            style={inputStyle}
          />
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 900, marginBottom: 4 }}>
            ZONA
          </div>
          <input
            value={createDraft.zone}
            onChange={(e) =>
              setCreateDraft({
                ...createDraft,
                zone: e.target.value.toLocaleUpperCase("it"),
              })
            }
            placeholder="Es. PERUGIA"
            style={inputStyle}
          />
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 900, marginBottom: 4 }}>
            REGIONE
          </div>
          <div
            style={{
              ...inputStyle,
              minHeight: 38,
              background: "#f8fafc",
              color: "#64748b",
            }}
          >
            AUTOMATICA DALLA ZONA
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 900, marginBottom: 4 }}>
            MACROAREA
          </div>
          <div
            style={{
              ...inputStyle,
              minHeight: 38,
              background: "#fffaf0",
              color: "#9a3412",
              fontWeight: 800,
            }}
          >
            AUTOMATICA DALLA REGIONE
          </div>
        </div>

        {renderCreateDmField("DM DI RIFERIMENTO")}
      </div>

      <label
        style={{
          display: "inline-flex",
          gap: 8,
          alignItems: "center",
          fontWeight: 900,
          marginTop: 12,
        }}
      >
        <input
          type="checkbox"
          checked={createDraft.showOnMap}
          onChange={(e) =>
            setCreateDraft({
              ...createDraft,
              showOnMap: e.target.checked,
            })
          }
        />
        {createDraft.showOnMap
          ? "MOSTRA IN MAPPA"
          : "NON MOSTRARE IN MAPPA"}
      </label>
    </section>
  );

  const removeFromZones = async (row: (typeof rows)[number]) => {
    if (!ctx || !row.recruiting?.id) return;

    const ok = window.confirm(
      `Rimuovere ${row.fullName} da Agenti attivi / Macroaree / Mappa? L'account login rimarrà attivo.`
    );
    if (!ok) return;

    setBusy(true);
    setNotice("");
    try {
      const { error } = await ctx.client
        .from("recruiting_active_agents")
        .delete()
        .eq("id", row.recruiting.id)
        .eq("owner_key", ctx.ownerKey);

      if (error) throw error;

      setNotice(
        `${row.fullName}: rimosso da Agenti attivi / Macroaree / Mappa.`
      );
      setExpandedId(null);
      setDraft(null);
      await loadAll();
    } catch (error: any) {
      setNotice(
        "Errore nella rimozione da Macroaree / Mappa: " +
          (error?.message || error)
      );
    } finally {
      setBusy(false);
    }
  };

  const deleteLoginAccount = async (row: (typeof rows)[number]) => {
    const agentId = Number(row.agent.id);
    if (!agentId) return;

    const ok = window.confirm(
      `Eliminare l'account login di ${row.fullName}? I dati di Macroaree / Mappa non vengono eliminati automaticamente.`
    );
    if (!ok) return;

    setBusy(true);
    setNotice("");
    try {
      await adminAgentDelete(agentId);
      setNotice(`${row.fullName}: account login eliminato.`);
      setExpandedId(null);
      setDraft(null);
      await loadAll();
    } catch (error: any) {
      setNotice(
        "Errore nell'eliminazione dell'account: " +
          (error?.message || error)
      );
    } finally {
      setBusy(false);
    }
  };

  const renderAgentEditor = (row: (typeof rows)[number]) => {
    if (!draft || expandedId !== Number(row.agent.id)) return null;

    const region = row.recruiting?.region || "";
    const macroarea = region
      ? macroareaByRegion.get(normalizeItalianRegion(region)) || ""
      : "";
    const mapActive =
      row.recruiting?.latitude !== null &&
      row.recruiting?.latitude !== undefined &&
      row.recruiting?.longitude !== null &&
      row.recruiting?.longitude !== undefined;

    return (
      <div
        className="uam-agent-open-card"
        style={{
          border: "3px solid #2563eb",
          borderRadius: 16,
          background: "#f8fbff",
          padding: 16,
          boxShadow: "0 8px 24px rgba(37,99,235,.10)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
            paddingBottom: 12,
            borderBottom: "2px solid #bfdbfe",
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 950, color: "#0f2d69" }}>
              {row.fullName.toUpperCase()}
            </div>
            <div style={{ marginTop: 3, fontSize: 12, color: "#64748b" }}>
              Login, abbinamenti, Macroaree e Mappa
            </div>
          </div>
          <button
            type="button"
            onClick={() => openRow(row)}
            style={{ ...buttonStyle, background: "#dbeafe", color: "#1d4ed8" }}
          >
            CHIUDI
          </button>
        </div>

        <section
          data-uam-agent-section="login"
          data-uam-agent-id={row.agent.id}
          style={{ padding: "14px 0", borderBottom: "1px solid #cbd5e1" }}
        >
          <div style={{ fontWeight: 950, color: "#0f2d69", marginBottom: 10 }}>
            🔐 LOGIN
          </div>
          <div
            className="uam-responsive-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
              gap: 10,
            }}
          >
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, marginBottom: 4 }}>USERNAME</div>
              <input
                value={draft.username}
                onChange={(e) => setDraft({ ...draft, username: e.target.value })}
                style={inputStyle}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, marginBottom: 4 }}>PASSWORD</div>
              <input
                type="text"
                value={draft.password}
                onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                placeholder={
                  row.agent.password_configured !== false
                    ? "DA RIPRISTINARE"
                    : "—"
                }
                style={inputStyle}
              />
            </div>
            {adminProfile?.role === "super_admin" && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 900, marginBottom: 4 }}>ADMIN ASSOCIATO</div>
                <select
                  value={draft.ownerAdminId}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      ownerAdminId: e.target.value ? Number(e.target.value) : "",
                    })
                  }
                  style={inputStyle}
                >
                  <option value="">Nessuno</option>
                  {admins.map((item) => (
                    <option key={item.id} value={item.id}>
                      {String(`${item.nome || ""} ${item.cognome || ""}`).trim() || item.username}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
            {adminProfile?.role === "super_admin" && (
              <label style={{ display: "inline-flex", gap: 7, alignItems: "center", fontWeight: 900 }}>
                <input
                  type="checkbox"
                  checked={draft.provvigioniVisible}
                  onChange={(e) => setDraft({ ...draft, provvigioniVisible: e.target.checked })}
                />
                ACCESSO PROVVIGIONI
              </label>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => void deleteLoginAccount(row)}
              style={{
                ...buttonStyle,
                marginLeft: "auto",
                background: "#fee2e2",
                color: "#991b1b",
                border: "1px solid #fecaca",
              }}
            >
              ELIMINA ACCOUNT LOGIN
            </button>
          </div>
        </section>

        <section
          data-uam-agent-section="email"
          data-uam-agent-id={row.agent.id}
          style={{ padding: "14px 0", borderBottom: "1px solid #cbd5e1" }}
        >
          <div style={{ fontWeight: 950, color: "#0369a1", marginBottom: 10 }}>✉️ ABBINAMENTI</div>
          <div
            className="uam-responsive-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
              gap: 10,
            }}
          >
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, marginBottom: 4 }}>EMAIL</div>
              <input
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                style={inputStyle}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, marginBottom: 4 }}>DM DI RIFERIMENTO</div>
              <select
                value={editDmCustomOpen ? "__NEW_DM__" : draft.dm}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "__NEW_DM__") {
                    setEditDmCustomOpen(true);
                    setDraft({ ...draft, dm: "" });
                    return;
                  }
                  setEditDmCustomOpen(false);
                  setDraft({ ...draft, dm: value });
                }}
                style={inputStyle}
              >
                <option value="">SELEZIONA DM...</option>
                {dmSuggestions.map((dm) => (
                  <option key={dm} value={dm}>
                    {dm.toLocaleUpperCase("it")}
                  </option>
                ))}
                <option value="__NEW_DM__">ALTRO / NUOVO DM</option>
              </select>
              {editDmCustomOpen && (
                <input
                  autoFocus
                  value={draft.dm}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      dm: e.target.value.toLocaleUpperCase("it"),
                    })
                  }
                  placeholder="INSERISCI NUOVO DM"
                  style={{ ...inputStyle, marginTop: 7 }}
                />
              )}
            </div>
          </div>
          <label style={{ display: "inline-flex", gap: 7, alignItems: "center", fontWeight: 900, marginTop: 12 }}>
            <input
              type="checkbox"
              checked={draft.reportNotify}
              onChange={(e) => setDraft({ ...draft, reportNotify: e.target.checked })}
            />
            REPORT ATTIVO
          </label>
        </section>

        <section
          data-uam-agent-section="map"
          data-uam-agent-id={row.agent.id}
          style={{ padding: "14px 0" }}
        >
          <div style={{ fontWeight: 950, color: "#c2410c", marginBottom: 10 }}>📍 MACROAREE / MAPPA</div>
          <div
            className="uam-responsive-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
              gap: 10,
            }}
          >
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, marginBottom: 4 }}>CELLULARE</div>
              <input
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                style={inputStyle}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, marginBottom: 4 }}>ZONA</div>
              <input
                value={draft.zone}
                onChange={(e) => setDraft({ ...draft, zone: e.target.value })}
                placeholder="Es. Perugia"
                style={inputStyle}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, marginBottom: 4 }}>REGIONE</div>
              <div style={{ ...inputStyle, minHeight: 38, background: "#f8fafc" }}>
                {region || "Automatica dalla zona"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, marginBottom: 4 }}>MACROAREA</div>
              <div style={{ ...inputStyle, minHeight: 38, background: "#fff7ed", color: "#9a3412", fontWeight: 800 }}>
                {macroarea || (region ? "Nessuna macroarea associata" : "Automatica dalla regione")}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 900 }}>
              <input
                type="checkbox"
                checked={draft.showOnMap}
                onChange={(e) => setDraft({ ...draft, showOnMap: e.target.checked })}
                style={{ width: 18, height: 18 }}
              />
              {draft.showOnMap ? "MOSTRA IN MAPPA" : "NON MOSTRARE IN MAPPA"}
            </label>
            <span
              style={{
                fontSize: 12,
                color: draft.showOnMap ? "#166534" : "#991b1b",
                fontWeight: 800,
              }}
            >
              {draft.showOnMap
                ? "L'agente sarà mostrato sulla mappa"
                : "L'agente non sarà mostrato sulla mappa"}
            </span>
            {row.recruiting && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void removeFromZones(row)}
                style={{
                  ...buttonStyle,
                  marginLeft: "auto",
                  background: "#fff7ed",
                  color: "#9a3412",
                  border: "1px solid #fed7aa",
                }}
              >
                RIMUOVI DA AGENTI ATTIVI / MAPPA
              </button>
            )}
          </div>

          {row.recruiting &&
            row.recruiting.latitude !== null &&
            row.recruiting.longitude !== null && (
              <div style={{ marginTop: 8, fontSize: 11, color: "#64748b" }}>
                Coordinate: {row.recruiting.latitude}, {row.recruiting.longitude}
              </div>
            )}
        </section>

        <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 14, borderTop: "2px solid #bfdbfe" }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveRow(row)}
            style={{
              ...buttonStyle,
              width: "min(260px,100%)",
              background: busy ? "#94a3b8" : "#16a34a",
              color: "white",
              fontSize: 15,
            }}
          >
            {busy ? "SALVATAGGIO..." : "SALVA TUTTO"}
          </button>
        </div>
      </div>
    );
  };

  if (loading) {
    return <div style={cardStyle}>Caricamento Gestione Agenti...</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <style>{`
        .uam-mobile-list { display: none; }
        .uam-desktop-table { display: block; }
        @media (max-width: 800px) {
          .uam-desktop-table { display: none !important; }
          .uam-mobile-list {
            display: flex !important;
            flex-direction: column;
            gap: 10px;
          }
          .uam-top-grid,
          .uam-responsive-grid {
            grid-template-columns: 1fr !important;
          }
          .uam-agent-open-card {
            padding: 12px !important;
          }
          .uam-mobile-list .uam-agent-open-card {
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: transparent !important;
            padding: 4px 2px 10px !important;
          }
          .ge-admin-responsive-grid {
            grid-template-columns: 1fr !important;
          }
          .ge-admin-password-table {
            display: block !important;
            min-width: 0 !important;
            width: 100% !important;
          }
          .ge-admin-password-table thead {
            display: none !important;
          }
          .ge-admin-password-table tbody,
          .ge-admin-password-table tr,
          .ge-admin-password-table td {
            display: block !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          .ge-admin-password-table tr {
            border: 1px solid #cbd5e1 !important;
            border-radius: 10px !important;
            margin-bottom: 10px !important;
            padding: 8px !important;
          }
          #ge-admin-users-manager .ge-table-shell {
            overflow: visible !important;
          }
          #ge-admin-users-manager .ge-list-table {
            display: block !important;
            min-width: 0 !important;
            width: 100% !important;
          }
          #ge-admin-users-manager .ge-list-table thead {
            display: none !important;
          }
          #ge-admin-users-manager .ge-list-table tbody,
          #ge-admin-users-manager .ge-list-table tr,
          #ge-admin-users-manager .ge-list-table td {
            display: block !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          #ge-admin-users-manager .ge-list-table tr {
            border: 2px solid #ddd6fe !important;
            border-radius: 12px !important;
            margin-bottom: 10px !important;
            padding: 8px !important;
            background: white !important;
          }
          #ge-admin-users-manager .ge-list-table td {
            border-bottom: 1px solid #f1f5f9 !important;
            padding: 9px 8px !important;
          }
        }
      `}</style>

      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>Gestione Agenti</h2>
            <div
              style={{
                marginTop: 5,
                color: "#64748b",
                fontSize: 13,
              }}
            >
              Clicca un agente per aprire tutte le sue impostazioni. Nuovi
              agenti e modifiche si gestiscono interamente da questa pagina.
            </div>
          </div>

          <div style={{ flex: "1 1 100%" }}>
            <AgentManagementToolbar active="login" />
          </div>
        </div>

        <div
          className="uam-top-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(220px, 420px) auto",
            gap: 10,
            marginTop: 14,
            alignItems: "center",
          }}
        >
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca agente, email, telefono, zona o DM..."
            style={inputStyle}
          />
          <button
            type="button"
            onClick={() => void loadAll()}
            style={{
              ...buttonStyle,
              background: "#0f172a",
              color: "white",
            }}
          >
            AGGIORNA
          </button>
        </div>

        {activeDiscrepancies.length > 0 && (
          <div
            style={{
              marginTop: 10,
              padding: "11px 12px",
              borderRadius: 10,
              background: "#fff7ed",
              border: "2px solid #fb923c",
              color: "#9a3412",
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 950 }}>
              ⚠️ {activeDiscrepancies.length} AGENTI NON SONO
              ALLINEATI IN TUTTI E 3 I RAMI
            </div>
            <div style={{ marginTop: 4, color: "#7c2d12" }}>
              LOGIN · ABBINAMENTO EMAIL · MAPPE / AGENTI ATTIVI
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 7,
                marginTop: 10,
              }}
            >
              {activeDiscrepancies.map((item) => (
                <div
                  key={discrepancyArchiveKey(item)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    flexWrap: "wrap",
                    background: "white",
                    border: "1px solid #fed7aa",
                    borderRadius: 9,
                    padding: "7px 8px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => openDiscrepancy(item)}
                    style={{
                      ...buttonStyle,
                      padding: "5px 8px",
                      background: "#fff7ed",
                      color: "#9a3412",
                      textDecoration: "underline",
                    }}
                    title="Apri direttamente la prima scheda mancante"
                  >
                    {item.fullName || "AGENTE SENZA NOME"} →
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                        void archiveDiscrepancy(item).catch((error) => {
                          console.error(error);
                          setNotice(
                            "Errore nell'archiviazione dell'avviso: " +
                              (error?.message || error)
                          );
                        })
                      }
                    style={{
                      ...buttonStyle,
                      padding: "4px 7px",
                      fontSize: 10,
                      background: "#f1f5f9",
                      color: "#475569",
                      border: "1px solid #cbd5e1",
                    }}
                  >
                    ARCHIVIA AVVISO
                  </button>

                  {item.missing.map((branch) => (
                    <button
                      key={branch}
                      type="button"
                      onClick={() => openDiscrepancy(item, branch)}
                      style={{
                        ...buttonStyle,
                        padding: "4px 7px",
                        fontSize: 10,
                        background:
                          branch === "login"
                            ? "#dcfce7"
                            : branch === "email"
                              ? "#e0f2fe"
                              : "#ffedd5",
                        color:
                          branch === "login"
                            ? "#166534"
                            : branch === "email"
                              ? "#075985"
                              : "#9a3412",
                        border:
                          branch === "login"
                            ? "1px solid #86efac"
                            : branch === "email"
                              ? "1px solid #7dd3fc"
                              : "1px solid #fdba74",
                      }}
                    >
                      MANCA{" "}
                      {branch === "login"
                        ? "LOGIN"
                        : branch === "email"
                          ? "ABBINAMENTO EMAIL"
                          : "MAPPE / AGENTI ATTIVI"}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            <div style={{ marginTop: 8, fontWeight: 700 }}>
              Clicca il nome oppure direttamente il ramo mancante
              per aprire la scheda da compilare.
            </div>
          </div>
        )}

        {archivedDiscrepancies.length > 0 && (
          <div
            style={{
              marginTop: 10,
              border: "1px solid #cbd5e1",
              borderRadius: 10,
              overflow: "hidden",
              background: "#f8fafc",
            }}
          >
            <button
              type="button"
              onClick={() =>
                setArchivedAlertsOpen((current) => !current)
              }
              style={{
                width: "100%",
                border: 0,
                background: "#e2e8f0",
                color: "#334155",
                padding: "9px 11px",
                textAlign: "left",
                fontWeight: 950,
                cursor: "pointer",
              }}
            >
              {archivedAlertsOpen ? "▼" : "▶"} AVVISI ARCHIVIATI (
              {archivedDiscrepancies.length})
            </button>

            {archivedAlertsOpen && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 7,
                  padding: 10,
                }}
              >
                {archivedDiscrepancies.map((item) => (
                  <div
                    key={discrepancyArchiveKey(item)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      flexWrap: "wrap",
                      background: "white",
                      border: "1px solid #e2e8f0",
                      borderRadius: 9,
                      padding: "7px 8px",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => openDiscrepancy(item)}
                      style={{
                        ...buttonStyle,
                        padding: "5px 8px",
                        background: "#f8fafc",
                        color: "#475569",
                        textDecoration: "underline",
                      }}
                    >
                      {item.fullName || "AGENTE SENZA NOME"} →
                    </button>

                    {item.missing.map((branch) => (
                      <span
                        key={branch}
                        style={{
                          padding: "4px 7px",
                          borderRadius: 7,
                          fontSize: 10,
                          fontWeight: 900,
                          background:
                            branch === "login"
                              ? "#dcfce7"
                              : branch === "email"
                                ? "#e0f2fe"
                                : "#ffedd5",
                          color:
                            branch === "login"
                              ? "#166534"
                              : branch === "email"
                                ? "#075985"
                                : "#9a3412",
                        }}
                      >
                        MANCA{" "}
                        {branch === "login"
                          ? "LOGIN"
                          : branch === "email"
                            ? "ABBINAMENTO EMAIL"
                            : "MAPPE / AGENTI ATTIVI"}
                      </span>
                    ))}

                    <button
                      type="button"
                      onClick={() =>
                        void restoreDiscrepancy(item).catch((error) => {
                          console.error(error);
                          setNotice(
                            "Errore nel ripristino dell'avviso: " +
                              (error?.message || error)
                          );
                        })
                      }
                      style={{
                        ...buttonStyle,
                        marginLeft: "auto",
                        padding: "4px 7px",
                        fontSize: 10,
                        background: "#dbeafe",
                        color: "#1d4ed8",
                        border: "1px solid #93c5fd",
                      }}
                    >
                      RIPRISTINA AVVISO
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {notice && (
          <div
            style={{
              marginTop: 10,
              padding: "9px 11px",
              borderRadius: 9,
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              color: "#1e3a8a",
              fontWeight: 800,
            }}
          >
            {notice}
          </div>
        )}
      </div>

      {createOpen && (
        <div
          id="uam-new-agent-form"
          style={{
            ...cardStyle,
            border:
              createSource === "login"
                ? "3px solid #16a34a"
                : createSource === "email"
                  ? "3px solid #0ea5e9"
                  : "3px solid #f97316",
            background:
              createSource === "login"
                ? "#f8fff9"
                : createSource === "email"
                  ? "#f8fcff"
                  : "#fffaf5",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h3
                style={{
                  margin: 0,
                  color:
                    createSource === "login"
                      ? "#166534"
                      : createSource === "email"
                        ? "#0369a1"
                        : "#c2410c",
                }}
              >
                NUOVO AGENTE
              </h3>
              <div style={{ marginTop: 4, color: "#64748b", fontSize: 13 }}>
                {createSource === "login"
                  ? "Stai creando l'agente dalla scheda Login."
                  : createSource === "email"
                    ? "Stai creando l'agente da Abbinamento Email."
                    : "Stai creando l'agente da Mappe / Agenti Attivi."}
                {" "}La scheda di partenza resta principale; sotto puoi aggiungere le altre due.
              </div>
            </div>
          </div>

          {createSource === "login" &&
            renderCreateLoginSection(true)}
          {createSource === "email" &&
            renderCreateEmailSection(true)}
          {createSource === "map" &&
            renderCreateMapSection(true)}

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit,minmax(min(100%,320px),1fr))",
              gap: 10,
            }}
          >
            {createSource !== "login" && (
              <button
                type="button"
                onClick={() =>
                  setCreateDraft({
                    ...createDraft,
                    insertLogin: !createDraft.insertLogin,
                  })
                }
                style={{
                  ...buttonStyle,
                  textAlign: "left",
                  padding: "13px 15px",
                  background: createDraft.insertLogin
                    ? "#dcfce7"
                    : "white",
                  color: "#166534",
                  border: createDraft.insertLogin
                    ? "2px solid #22c55e"
                    : "2px solid #bbf7d0",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <input
                    type="checkbox"
                    readOnly
                    checked={createDraft.insertLogin}
                  />
                  <span>INSERISCI LOGIN</span>
                </div>
              </button>
            )}

            {createSource !== "email" && (
              <button
                type="button"
                onClick={() =>
                  setCreateDraft({
                    ...createDraft,
                    insertEmailMatching:
                      !createDraft.insertEmailMatching,
                  })
                }
                style={{
                  ...buttonStyle,
                  textAlign: "left",
                  padding: "13px 15px",
                  background: createDraft.insertEmailMatching
                    ? "#e0f2fe"
                    : "white",
                  color: "#075985",
                  border: createDraft.insertEmailMatching
                    ? "2px solid #38bdf8"
                    : "2px solid #bae6fd",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <input
                    type="checkbox"
                    readOnly
                    checked={createDraft.insertEmailMatching}
                  />
                  <span>INSERISCI ABBINAMENTO EMAIL</span>
                </div>
              </button>
            )}

            {createSource !== "map" && (
              <button
                type="button"
                onClick={() =>
                  setCreateDraft({
                    ...createDraft,
                    insertActiveAgent:
                      !createDraft.insertActiveAgent,
                  })
                }
                style={{
                  ...buttonStyle,
                  textAlign: "left",
                  padding: "13px 15px",
                  background: createDraft.insertActiveAgent
                    ? "#fff7ed"
                    : "white",
                  color: "#9a3412",
                  border: createDraft.insertActiveAgent
                    ? "2px solid #fb923c"
                    : "2px solid #fed7aa",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <input
                    type="checkbox"
                    readOnly
                    checked={createDraft.insertActiveAgent}
                  />
                  <span>INSERISCI IN MAPPE / AGENTI ATTIVI</span>
                </div>
              </button>
            )}
          </div>

          {createSource !== "login" &&
            createDraft.insertLogin &&
            renderCreateLoginSection(false)}

          {createSource !== "email" &&
            createDraft.insertEmailMatching &&
            renderCreateEmailSection(false)}

          {createSource !== "map" &&
            createDraft.insertActiveAgent &&
            renderCreateMapSection(false)}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              paddingTop: 4,
            }}
          >
            <button
              type="button"
              disabled={busy}
              onClick={() => void createAgent()}
              style={{
                ...buttonStyle,
                width: "min(300px,100%)",
                background: busy ? "#94a3b8" : "#16a34a",
                color: "white",
                fontSize: 15,
              }}
            >
              {busy ? "SALVATAGGIO..." : "CREA E SALVA AGENTE"}
            </button>
          </div>
        </div>
      )}

      <div className="uam-desktop-table" style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: 1220,
            }}
          >
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {[
                  "AGENTE",
                  "LOGIN",
                  "PASSWORD",
                  "ADMIN",
                  "EMAIL",
                  "REPORT",
                  "CELLULARE",
                  "ZONA",
                  "DM",
                  "PROVV.",
                  "MAPPA",
                  "STATO",
                  "",
                ].map((label) => (
                  <th
                    key={label}
                    style={{
                      padding: "10px 9px",
                      borderBottom: "1px solid #e2e8f0",
                      textAlign: "left",
                      fontSize: 11,
                      color: "#475569",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => {
                const id = Number(row.agent.id);
                const isOpen = expandedId === id;
                const admin = admins.find(
                  (item) =>
                    Number(item.id) ===
                    Number(row.agent.owner_admin_id || 0)
                );
                const dm =
                  row.recruiting?.dm_reference ||
                  row.email?.dm ||
                  "";
                const discrepancy =
                  discrepancyByLoginId.get(id) || null;

                return (
                  <React.Fragment key={id}>
                    <tr
                      data-uam-agent-row={id}
                      onClick={() => openRow(row)}
                      style={{
                        background: isOpen
                          ? "#f8fbff"
                          : discrepancy
                            ? "#fff7ed"
                            : "white",
                        cursor: "pointer",
                        outline: discrepancy
                          ? "2px solid #fdba74"
                          : "none",
                        outlineOffset: "-2px",
                      }}
                      title="Clicca per aprire tutte le impostazioni dell'agente"
                    >
                      <td
                        style={{
                          padding: "10px 9px",
                          borderBottom: "1px solid #f1f5f9",
                          fontWeight: 900,
                          color: "#0f2d69",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.fullName.toUpperCase()}
                        {discrepancy && (
                          <div
                            style={{
                              marginTop: 4,
                              display: "flex",
                              gap: 4,
                              flexWrap: "wrap",
                            }}
                          >
                            {discrepancy.missing.map((branch) => (
                              <span
                                key={branch}
                                style={{
                                  fontSize: 9,
                                  padding: "2px 4px",
                                  borderRadius: 5,
                                  background: "#ffedd5",
                                  color: "#9a3412",
                                  fontWeight: 950,
                                }}
                              >
                                MANCA{" "}
                                {branch === "login"
                                  ? "LOGIN"
                                  : branch === "email"
                                    ? "EMAIL"
                                    : "MAPPA"}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "10px 9px", borderBottom: "1px solid #f1f5f9" }}>
                        {row.agent.username || "-"}
                      </td>
                      <td
                        style={{
                          padding: "10px 9px",
                          borderBottom: "1px solid #f1f5f9",
                          color: "#166534",
                          fontWeight: 800,
                        }}
                      >
                        {row.agent.password ||
                          (row.agent.password_configured !== false
                            ? "DA RIPRISTINARE"
                            : "—")}
                      </td>
                      <td style={{ padding: "10px 9px", borderBottom: "1px solid #f1f5f9" }}>
                        {admin
                          ? String(
                              `${admin.nome || ""} ${admin.cognome || ""}`
                            ).trim() || admin.username
                          : row.agent.owner_admin_id
                            ? `ID ${row.agent.owner_admin_id}`
                            : "-"}
                      </td>
                      <td style={{ padding: "10px 9px", borderBottom: "1px solid #f1f5f9" }}>
                        {row.email?.email || "-"}
                      </td>
                      <td style={{ padding: "10px 9px", borderBottom: "1px solid #f1f5f9", textAlign: "center" }}>
                        {row.email?.report_notify ? "✅" : "—"}
                      </td>
                      <td style={{ padding: "10px 9px", borderBottom: "1px solid #f1f5f9" }}>
                        {row.recruiting?.phone || "-"}
                      </td>
                      <td style={{ padding: "10px 9px", borderBottom: "1px solid #f1f5f9" }}>
                        {row.recruiting?.zone || "-"}
                      </td>
                      <td style={{ padding: "10px 9px", borderBottom: "1px solid #f1f5f9" }}>
                        {dm || "-"}
                      </td>
                      <td style={{ padding: "10px 9px", borderBottom: "1px solid #f1f5f9", textAlign: "center" }}>
                        {row.agent.provvigioni_visible ? "✅" : "—"}
                      </td>
                      <td
                        style={{
                          padding: "10px 9px",
                          borderBottom: "1px solid #f1f5f9",
                          textAlign: "center",
                        }}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Mostra ${row.fullName.toUpperCase()} sulla mappa`}
                          title={row.recruiting?.id && row.recruiting?.zone
                            ? "Selezionato: visibile sulla mappa. Modifica e salvataggio immediati."
                            : "Configura prima la zona nella scheda agente"}
                          checked={
                            row.recruiting?.latitude != null &&
                            row.recruiting?.longitude != null
                          }
                          disabled={busy || !ctx || !row.recruiting?.id || (row.recruiting?.latitude == null && !row.recruiting?.zone)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => {
                            event.stopPropagation();
                            void toggleMapVisibility(row, event.target.checked);
                          }}
                          style={{ width: 17, height: 17, cursor: "pointer", accentColor: "#16a34a" }}
                        />
                      </td>
                      <td style={{ padding: "10px 9px", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" }}>
                        <span
                          title="Accesso"
                          style={{ marginRight: 4 }}
                        >
                          🔐
                        </span>
                        <span
                          title={
                            row.email
                              ? "Abbinamento email presente"
                              : "Email non abbinata"
                          }
                          style={{ marginRight: 4, opacity: row.email ? 1 : 0.25 }}
                        >
                          ✉️
                        </span>

                      </td>
                      <td style={{ padding: "7px 9px", borderBottom: "1px solid #f1f5f9" }}>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openRow(row);
                          }}
                          style={{
                            ...buttonStyle,
                            padding: "7px 10px",
                            background: isOpen
                              ? "#dbeafe"
                              : "#e2e8f0",
                            color: "#0f172a",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {isOpen ? "CHIUDI" : "APRI"}
                        </button>
                      </td>
                    </tr>

                    {isOpen && draft && (
                      <tr>
                        <td
                          colSpan={12}
                          style={{
                            padding: 14,
                            background: "#eef6ff",
                            borderBottom: "2px solid #93c5fd",
                          }}
                        >
                          {renderAgentEditor(row)}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {!rows.length && (
                <tr>
                  <td
                    colSpan={12}
                    style={{
                      padding: 20,
                      textAlign: "center",
                      color: "#64748b",
                      fontWeight: 800,
                    }}
                  >
                    Nessun agente trovato.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="uam-mobile-list">
        {rows.map((row) => {
          const id = Number(row.agent.id);
          const isOpen = expandedId === id;
          const admin = admins.find(
            (item) =>
              Number(item.id) === Number(row.agent.owner_admin_id || 0)
          );
          const dm =
            row.recruiting?.dm_reference ||
            row.email?.dm ||
            "";
          const discrepancy =
            discrepancyByLoginId.get(id) || null;

          return (
            <div
              key={id}
              data-uam-agent-row={id}
              style={{
                border: isOpen
                  ? "3px solid #2563eb"
                  : discrepancy
                    ? "3px solid #fb923c"
                    : "1px solid #cbd5e1",
                borderRadius: 14,
                background: discrepancy ? "#fff7ed" : "white",
                overflow: "hidden",
                maxWidth: "100%",
              }}
            >
              <button
                type="button"
                onClick={() => openRow(row)}
                style={{
                  width: "100%",
                  border: 0,
                  background: isOpen ? "#eff6ff" : "white",
                  padding: 13,
                  textAlign: "left",
                  cursor: "pointer",
                  boxSizing: "border-box",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <div>
                    <strong style={{ color: "#0f2d69", fontSize: 16 }}>
                      {row.fullName.toUpperCase()}
                    </strong>
                    {discrepancy && (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 4,
                          marginTop: 4,
                        }}
                      >
                        {discrepancy.missing.map((branch) => (
                          <span
                            key={branch}
                            style={{
                              fontSize: 9,
                              padding: "2px 4px",
                              borderRadius: 5,
                              background: "#ffedd5",
                              color: "#9a3412",
                              fontWeight: 950,
                            }}
                          >
                            MANCA{" "}
                            {branch === "login"
                              ? "LOGIN"
                              : branch === "email"
                                ? "EMAIL"
                                : "MAPPA"}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span style={{ background: isOpen ? "#dbeafe" : "#e2e8f0", borderRadius: 9, padding: "6px 9px", fontWeight: 900 }}>
                    {isOpen ? "CHIUDI" : "APRI"}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 5, marginTop: 10, fontSize: 13, color: "#334155", overflowWrap: "anywhere" }}>
                  <div><strong>Login:</strong> {row.agent.username || "—"}</div>
                  <div>
                    <strong>Password:</strong>{" "}
                    <span style={{ color: "#166534", fontWeight: 800 }}>
                      {row.agent.password ||
                        (row.agent.password_configured !== false
                          ? "DA RIPRISTINARE"
                          : "—")}
                    </span>
                  </div>
                  <div>
                    <strong>Admin:</strong>{" "}
                    {admin
                      ? String(`${admin.nome || ""} ${admin.cognome || ""}`).trim() || admin.username
                      : "—"}
                  </div>
                  <div><strong>Email:</strong> {row.email?.email || "—"}</div>
                  <div><strong>Cellulare:</strong> {row.recruiting?.phone || "—"}</div>
                  <div><strong>Zona:</strong> {row.recruiting?.zone || "—"}</div>
                  <div><strong>DM:</strong> {dm || "—"}</div>
                  <div><strong>Report:</strong> {row.email?.report_notify ? "ATTIVO" : "NON ATTIVO"}</div>

                </div>
              </button>
              <div style={{ padding: "8px 13px 10px", borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}>
                  <label
                    style={{ display: "flex", alignItems: "center", gap: 9, fontWeight: 800 }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <strong>MAPPA:</strong>
                    <input
                      type="checkbox"
                      checked={row.recruiting?.latitude != null && row.recruiting?.longitude != null}
                      disabled={busy || !ctx || !row.recruiting?.id || (row.recruiting?.latitude == null && !row.recruiting?.zone)}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => {
                        event.stopPropagation();
                        void toggleMapVisibility(row, event.target.checked);
                      }}
                      aria-label={`Mostra ${row.fullName.toUpperCase()} sulla mappa`}
                      style={{ width: 18, height: 18, accentColor: "#16a34a" }}
                    />
                    {row.recruiting?.latitude != null && row.recruiting?.longitude != null
                      ? "VISIBILE"
                      : "NON VISIBILE"}
                  </label>
              </div>

              {isOpen && draft && (
                <div style={{ padding: 10, maxWidth: "100%", boxSizing: "border-box" }}>
                  {renderAgentEditor(row)}
                </div>
              )}
            </div>
          );
        })}

        {!rows.length && (
          <div style={{ ...cardStyle, textAlign: "center", color: "#64748b", fontWeight: 800 }}>
            Nessun agente trovato.
          </div>
        )}
      </div>
    </div>
  );
}
