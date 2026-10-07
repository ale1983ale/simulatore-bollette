import React from "react";

type AgentManagementToolbarProps = {
  active?: "login" | "email" | "map";
};

const buttonBase: React.CSSProperties = {
  border: 0,
  borderRadius: 10,
  padding: "11px 16px",
  fontWeight: 950,
  cursor: "pointer",
  fontSize: 14,
  whiteSpace: "nowrap",
};

function isSuperAdmin() {
  try {
    const raw = localStorage.getItem("admin_session");
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return String(parsed?.role || "") === "super_admin";
  } catch {
    return false;
  }
}

export default function AgentManagementToolbar({
  active,
}: AgentManagementToolbarProps) {
  const superAdmin = isSuperAdmin();

  const openNewAgent = () => {
    window.dispatchEvent(
      new CustomEvent("open-unified-agent-create", {
        detail: { source: "login" },
      })
    );
  };

  const openAdmin = () => {
    window.dispatchEvent(
      new CustomEvent("agent-management-nav", {
        detail: { target: "admin" },
      })
    );
  };

  const openMatches = () => {
    window.dispatchEvent(
      new CustomEvent("open-outlook-email", {
        detail: { view: "matches" },
      })
    );
  };

  const openMap = () => {
    window.dispatchEvent(
      new CustomEvent("agent-management-nav", {
        detail: { target: "map" },
      })
    );
  };

  return (
    <div
      className="agent-management-toolbar"
      style={{
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        alignItems: "center",
        padding: 12,
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        boxShadow: "0 4px 14px rgba(15,23,42,.05)",
      }}
    >
      <button
        type="button"
        onClick={openNewAgent}
        style={{
          ...buttonBase,
          background: active === "login" ? "#16a34a" : "#22c55e",
          color: "white",
        }}
      >
        + NUOVO AGENTE
      </button>

      {superAdmin && (
        <button
          type="button"
          onClick={openAdmin}
          style={{
            ...buttonBase,
            background: "#ede9fe",
            color: "#5b21b6",
          }}
        >
          GESTIONE ADMIN
        </button>
      )}

      <button
        type="button"
        onClick={openMatches}
        style={{
          ...buttonBase,
          background: active === "email" ? "#bae6fd" : "#e0f2fe",
          color: "#0f172a",
          outline:
            active === "email"
              ? "2px solid #38bdf8"
              : "none",
        }}
      >
        ABBINAMENTI GLOBALI
      </button>

      <button
        type="button"
        onClick={openMap}
        style={{
          ...buttonBase,
          background: active === "map" ? "#fed7aa" : "#ffedd5",
          color: "#0f172a",
          outline:
            active === "map"
              ? "2px solid #fb923c"
              : "none",
        }}
      >
        MACROAREE / MAPPA
      </button>
    </div>
  );
}
