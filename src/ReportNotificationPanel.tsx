import React, { useEffect, useMemo, useState } from "react";
import { supabaseAnonKey, supabaseUrl } from "./supabase";

type ReportAgentRecipient = {
  agenzia: string;
  email: string;
  report_notify?: boolean;
};

type TemplateRow = {
  id: number;
  name: string;
  subject: string;
  body: string;
  created_at?: string;
  updated_at?: string;
};

type HistoryRow = {
  id: number;
  template_id?: number | null;
  subject: string;
  body: string;
  recipients?: Array<{ agenzia?: string; email?: string }>;
  recipient_count: number;
  success_count: number;
  failure_count: number;
  credentials_included?: boolean;
  status: string;
  error?: string;
  sent_at?: string | null;
  created_at?: string;
};

const validEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());

async function callReportApi(action: string, payload: Record<string, unknown> = {}) {
  const raw = localStorage.getItem("admin_session");
  const session = raw ? JSON.parse(raw) : null;
  const sessionToken = String(session?.token || "");

  if (!sessionToken) {
    throw new Error("Sessione Admin non valida. Esci e accedi di nuovo.");
  }

  const response = await fetch(
    `${supabaseUrl}/functions/v1/report-email-notify`,
    {
      method: "POST",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action,
        session_token: sessionToken,
        ...payload,
      }),
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || `Errore HTTP ${response.status}`);
  }
  return data;
}

export default function ReportNotificationPanel({
  agents,
  dirty,
  onOpenMatches,
}: {
  agents: ReportAgentRecipient[];
  dirty: boolean;
  onOpenMatches: () => void;
}) {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [subject, setSubject] = useState("Promemoria compilazione Report");
  const [body, setBody] = useState(
    "Buongiorno,\n\nti ricordo di compilare il Report aggiornato.\n\nGrazie."
  );
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const eligible = useMemo(() => {
    const seen = new Set<string>();
    return agents
      .filter((agent) => agent.report_notify === true && validEmail(agent.email))
      .filter((agent) => {
        const key = agent.email.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [agents]);

  useEffect(() => {
    setSelectedEmails(new Set(eligible.map((agent) => agent.email.trim().toLowerCase())));
  }, [eligible.map((agent) => agent.email.trim().toLowerCase()).join("|")]);

  const loadData = async () => {
    setBusy(true);
    setNotice("");
    try {
      const data = await callReportApi("list");
      setTemplates(Array.isArray(data.templates) ? data.templates : []);
      setHistory(Array.isArray(data.history) ? data.history : []);
    } catch (error: any) {
      setNotice(error?.message || String(error));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const chooseTemplate = (idValue: string) => {
    if (!idValue) {
      setSelectedTemplateId(null);
      setTemplateName("");
      return;
    }
    const id = Number(idValue);
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    setSelectedTemplateId(id);
    setTemplateName(template.name);
    setSubject(template.subject);
    setBody(template.body);
  };

  const saveTemplate = async (asNew: boolean) => {
    if (!templateName.trim() || !subject.trim() || !body.trim()) {
      setNotice("Inserisci nome modello, oggetto e messaggio.");
      return;
    }

    setBusy(true);
    setNotice("");
    try {
      const data = await callReportApi("save_template", {
        template_id: asNew ? null : selectedTemplateId,
        name: templateName.trim(),
        subject: subject.trim(),
        body: body.trim(),
      });
      setNotice(asNew ? "Modello salvato." : "Modello aggiornato.");
      if (data?.template?.id) setSelectedTemplateId(Number(data.template.id));
      await loadData();
    } catch (error: any) {
      setNotice(error?.message || String(error));
      setBusy(false);
    }
  };

  const deleteTemplate = async () => {
    if (!selectedTemplateId) return;
    if (!window.confirm("Vuoi eliminare questo modello?")) return;

    setBusy(true);
    setNotice("");
    try {
      await callReportApi("delete_template", {
        template_id: selectedTemplateId,
      });
      setSelectedTemplateId(null);
      setTemplateName("");
      setNotice("Modello eliminato.");
      await loadData();
    } catch (error: any) {
      setNotice(error?.message || String(error));
      setBusy(false);
    }
  };

  const sendNotification = async () => {
    if (dirty) {
      setNotice(
        "Prima salva online le modifiche del Controllo abbinamento email, così il flag REPORT è aggiornato."
      );
      return;
    }

    const selected = eligible.filter((agent) =>
      selectedEmails.has(agent.email.trim().toLowerCase())
    );

    if (!selected.length) {
      setNotice("Seleziona almeno un agente con email valida.");
      return;
    }

    if (!subject.trim() || !body.trim()) {
      setNotice("Oggetto e messaggio sono obbligatori.");
      return;
    }

    const names = selected
      .map((agent) => agent.agenzia || agent.email)
      .slice(0, 20)
      .join("\n• ");
    const more = selected.length > 20 ? `\n...e altri ${selected.length - 20}` : "";

    const ok = window.confirm(
      `Inviare la notifica Report a ${selected.length} agenti?\n\n• ${names}${more}`
    );
    if (!ok) return;

    setBusy(true);
    setNotice("");
    try {
      const data = await callReportApi("send", {
        template_id: selectedTemplateId,
        subject: subject.trim(),
        body: body.trim(),
        selected_emails: selected.map((agent) => agent.email.trim()),
        include_credentials: true,
      });

      setNotice(
        `Invio completato: ${Number(data.success_count || 0)} riusciti su ${Number(
          data.recipient_count || selected.length
        )}${Number(data.failure_count || 0) ? ` · ${data.failure_count} errori` : ""}.`
      );
      await loadData();
    } catch (error: any) {
      setNotice(error?.message || String(error));
      setBusy(false);
    }
  };

  const card: React.CSSProperties = {
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    padding: 16,
    boxShadow: "0 8px 24px rgba(15,23,42,.06)",
  };

  const field: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #cbd5e1",
    borderRadius: 9,
    padding: "9px 10px",
    background: "white",
    color: "#0f172a",
  };

  const button: React.CSSProperties = {
    border: "1px solid #cbd5e1",
    borderRadius: 9,
    padding: "8px 12px",
    fontWeight: 800,
    cursor: "pointer",
  };

  return (
    <>
      <div
        style={{
          ...card,
          marginBottom: 16,
          background: "#eff6ff",
          borderColor: "#bfdbfe",
        }}
      >
        <strong>🔔 Invio Notifica Report</strong>
        <div style={{ marginTop: 6, color: "#475569", fontSize: 14 }}>
          La mail viene inviata agli agenti con flag REPORT attivo e contiene
          sempre lo <strong>username</strong>, il pulsante
          <strong> IMPOSTA / CAMBIA PASSWORD</strong> e il pulsante
          <strong> COMPILA IL REPORT</strong>.
        </div>
        {dirty && (
          <div style={{ marginTop: 10, color: "#b45309", fontWeight: 800 }}>
            Hai modifiche non salvate nel Controllo abbinamento email.
          </div>
        )}
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div>
            <strong>Destinatari Report</strong>
            <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>
              {eligible.length} agenti abilitati
            </div>
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <button
              type="button"
              onClick={() =>
                setSelectedEmails(
                  new Set(
                    eligible.map((agent) =>
                      agent.email.trim().toLowerCase()
                    )
                  )
                )
              }
              disabled={!eligible.length}
              style={{
                ...button,
                background: "#dcfce7",
                color: "#166534",
                opacity: eligible.length ? 1 : 0.6,
              }}
            >
              SELEZIONA TUTTI
            </button>

            <button
              type="button"
              onClick={() => setSelectedEmails(new Set())}
              disabled={!selectedEmails.size}
              style={{
                ...button,
                background: "#fee2e2",
                color: "#991b1b",
                opacity: selectedEmails.size ? 1 : 0.6,
              }}
            >
              DESELEZIONA TUTTI
            </button>

            <button
              type="button"
              onClick={onOpenMatches}
              style={{
                ...button,
                background: "#ede9fe",
                color: "#5b21b6",
              }}
            >
              Gestisci flag REPORT
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
            gap: 8,
          }}
        >
          {eligible.map((agent) => {
            const key = agent.email.trim().toLowerCase();
            return (
              <label
                key={key}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  padding: 9,
                  border: "1px solid #e2e8f0",
                  borderRadius: 9,
                  background: selectedEmails.has(key) ? "#f0fdf4" : "#f8fafc",
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedEmails.has(key)}
                  onChange={(e) =>
                    setSelectedEmails((current) => {
                      const next = new Set(current);
                      if (e.target.checked) next.add(key);
                      else next.delete(key);
                      return next;
                    })
                  }
                />
                <span style={{ minWidth: 0 }}>
                  <strong>{agent.agenzia || "Senza nome"}</strong>
                  <div
                    style={{
                      color: "#64748b",
                      fontSize: 12,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {agent.email}
                  </div>
                </span>
              </label>
            );
          })}
          {!eligible.length && (
            <div style={{ color: "#64748b" }}>
              Nessun agente con flag REPORT ed email valida.
            </div>
          )}
        </div>
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <strong>Messaggio</strong>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(220px,1fr) minmax(220px,1fr)",
            gap: 10,
            marginTop: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>
              Modello salvato
            </div>
            <select
              value={selectedTemplateId ?? ""}
              onChange={(e) => chooseTemplate(e.target.value)}
              style={field}
            >
              <option value="">NUOVO / NESSUN MODELLO</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>
              Nome modello
            </div>
            <input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              style={field}
              placeholder="Es. Promemoria settimanale"
            />
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>
            Oggetto
          </div>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={field}
          />
        </div>

        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>
            Messaggio
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            style={{ ...field, resize: "vertical" }}
          />
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 12,
          }}
        >
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveTemplate(true)}
            style={{ ...button, background: "#dbeafe", color: "#1d4ed8" }}
          >
            SALVA COME NUOVO
          </button>
          <button
            type="button"
            disabled={busy || !selectedTemplateId}
            onClick={() => void saveTemplate(false)}
            style={{ ...button, background: "#e0f2fe", color: "#0369a1" }}
          >
            AGGIORNA MODELLO
          </button>
          <button
            type="button"
            disabled={busy || !selectedTemplateId}
            onClick={() => void deleteTemplate()}
            style={{ ...button, background: "#fee2e2", color: "#991b1b" }}
          >
            ELIMINA MODELLO
          </button>
          <button
            type="button"
            disabled={busy || !eligible.length}
            onClick={() => void sendNotification()}
            style={{
              ...button,
              marginLeft: "auto",
              background: "#16a34a",
              color: "white",
              borderColor: "#16a34a",
              opacity: busy || !eligible.length ? 0.6 : 1,
            }}
          >
            {busy ? "OPERAZIONE IN CORSO..." : "INVIA NOTIFICA REPORT"}
          </button>
        </div>
      </div>

      {notice && (
        <div
          style={{
            ...card,
            marginBottom: 16,
            background: "#f8fafc",
            fontWeight: 700,
          }}
        >
          {notice}
        </div>
      )}

      <div style={{ ...card, marginBottom: 16 }}>
        <strong>Storico invii</strong>
        <div style={{ marginTop: 10, overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: 760,
              fontSize: 12,
            }}
          >
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #cbd5e1" }}>
                <th style={{ padding: 7 }}>Data</th>
                <th style={{ padding: 7 }}>Oggetto</th>
                <th style={{ padding: 7 }}>Destinatari</th>
                <th style={{ padding: 7 }}>Esito</th>
                <th style={{ padding: 7 }}>Credenziali</th>
                <th style={{ padding: 7 }}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: 7 }}>
                    {new Date(item.sent_at || item.created_at || "").toLocaleString("it-IT")}
                  </td>
                  <td style={{ padding: 7, fontWeight: 700 }}>{item.subject}</td>
                  <td style={{ padding: 7 }}>{item.recipient_count}</td>
                  <td style={{ padding: 7 }}>
                    {item.success_count}/{item.recipient_count} inviati
                    {item.failure_count ? ` · ${item.failure_count} errori` : ""}
                  </td>
                  <td
                    style={{
                      padding: 7,
                      fontWeight: 800,
                      color: item.credentials_included
                        ? "#c2410c"
                        : "#64748b",
                    }}
                  >
                    {item.credentials_included ? "SÌ" : "NO"}
                  </td>
                  <td style={{ padding: 7 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTemplateId(item.template_id || null);
                        setSubject(item.subject || "");
                        setBody(item.body || "");
                        setNotice("Messaggio precedente caricato.");
                      }}
                      style={{
                        ...button,
                        padding: "5px 8px",
                        background: "#e2e8f0",
                      }}
                    >
                      RIUTILIZZA
                    </button>
                  </td>
                </tr>
              ))}
              {!history.length && (
                <tr>
                  <td colSpan={6} style={{ padding: 14, color: "#64748b" }}>
                    Nessun invio registrato.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
