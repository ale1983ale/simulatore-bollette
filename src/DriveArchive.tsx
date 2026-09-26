import React, { useEffect, useMemo, useState } from "react";
import {
  downloadGoogleDriveFile,
  getGoogleDriveArchiveConfig,
  listGoogleDriveFolder,
  setGoogleDriveArchiveFolder,
  startGoogleDriveConnection,
  type GoogleDriveArchiveConfig,
  type GoogleDriveItem,
} from "./googleDrive";

const GOOGLE_APPS_PREFIX = "application/vnd.google-apps.";

function formatBytes(value: number | null) {
  if (!value || value <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function itemIcon(item: GoogleDriveItem) {
  if (item.is_folder) return "📁";
  const mime = item.mime_type || "";
  if (mime.includes("pdf")) return "📕";
  if (mime.includes("spreadsheet") || mime.includes("excel")) return "📊";
  if (mime.includes("document") || mime.includes("word")) return "📄";
  if (mime.includes("presentation") || mime.includes("powerpoint")) return "📽️";
  if (mime.startsWith("image/")) return "🖼️";
  if (mime.startsWith("video/")) return "🎬";
  if (mime.startsWith("audio/")) return "🎵";
  if (mime.includes("zip") || mime.includes("compressed")) return "🗜️";
  return "📎";
}

function typeLabel(item: GoogleDriveItem) {
  if (item.is_folder) return "CARTELLA";
  const mime = item.mime_type || "";
  if (mime === "application/vnd.google-apps.document") return "GOOGLE DOCS";
  if (mime === "application/vnd.google-apps.spreadsheet") return "GOOGLE SHEETS";
  if (mime === "application/vnd.google-apps.presentation") return "GOOGLE SLIDES";
  if (mime.includes("pdf")) return "PDF";
  if (mime.includes("spreadsheet") || mime.includes("excel")) return "EXCEL";
  if (mime.includes("word")) return "WORD";
  if (mime.startsWith("image/")) return "IMMAGINE";
  if (mime.startsWith("video/")) return "VIDEO";
  return "FILE";
}

const buttonStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  background: "white",
  color: "#0f172a",
  borderRadius: 9,
  padding: "9px 13px",
  fontWeight: 850,
  cursor: "pointer",
};

export default function DriveArchive() {
  const [config, setConfig] = useState<GoogleDriveArchiveConfig | null>(null);
  const [items, setItems] = useState<GoogleDriveItem[]>([]);
  const [folderStack, setFolderStack] = useState<Array<{ id: string; name: string }>>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [browseMode, setBrowseMode] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const currentFolder = folderStack[folderStack.length - 1] || null;

  const loadFolder = async (
    folderId: string,
    folderName?: string,
    resetStack = false
  ) => {
    setBusy(true);
    setError("");
    try {
      const result = await listGoogleDriveFolder(folderId);
      const nextFolder = {
        id: result.folder.id,
        name: folderName || result.folder.name || "Cartella Drive",
      };
      setItems(Array.isArray(result.items) ? result.items : []);
      setFolderStack((current) =>
        resetStack ? [nextFolder] : [...current, nextFolder]
      );
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const refreshConfig = async () => {
    setLoading(true);
    setError("");
    try {
      const next = await getGoogleDriveArchiveConfig();
      setConfig(next);

      if (next.drive_ready && next.folder_id) {
        setBrowseMode(false);
        await loadFolder(
          String(next.folder_id),
          String(next.folder_name || "Archivio Drive"),
          true
        );
      } else if (next.drive_ready && next.can_manage) {
        setBrowseMode(true);
        await loadFolder("root", "Il mio Drive", true);
      } else {
        setBrowseMode(false);
        setItems([]);
        setFolderStack([]);
      }
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshConfig();
  }, []);

  const visibleItems = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("it");
    return items.filter((item) =>
      !q || item.name.toLocaleLowerCase("it").includes(q)
    );
  }, [items, search]);

  const connectGoogle = async () => {
    setBusy(true);
    setError("");
    try {
      const url = await startGoogleDriveConnection();
      window.location.assign(url);
    } catch (err: any) {
      setError(err?.message || String(err));
      setBusy(false);
    }
  };

  const chooseFolder = async () => {
    if (!currentFolder) return;
    setBusy(true);
    setError("");
    try {
      const saved = await setGoogleDriveArchiveFolder(currentFolder.id);
      setConfig((current) => ({
        ...(current || {
          configured: true,
          connected: true,
          drive_ready: true,
        }),
        drive_ready: true,
        folder_id: saved.folder_id,
        folder_name: saved.folder_name,
      }));
      setBrowseMode(false);
      setMessage(`Cartella archivio impostata: ${saved.folder_name}`);
      await loadFolder(saved.folder_id, saved.folder_name, true);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const startChangeFolder = async () => {
    setBrowseMode(true);
    setSearch("");
    setMessage("");
    await loadFolder("root", "Il mio Drive", true);
  };

  const goBack = async () => {
    if (folderStack.length <= 1) return;
    const next = folderStack.slice(0, -1);
    const target = next[next.length - 1];
    setFolderStack(next.slice(0, -1));
    await loadFolder(target.id, target.name, false);
  };

  const openItem = async (item: GoogleDriveItem) => {
    if (item.is_folder) {
      await loadFolder(item.id, item.name, false);
      return;
    }
    if (item.web_view_link) {
      window.open(item.web_view_link, "_blank", "noopener,noreferrer");
    }
  };

  const downloadItem = async (item: GoogleDriveItem) => {
    setBusy(true);
    setError("");
    try {
      await downloadGoogleDriveFile(item.id, item.name);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 24, background: "white", borderRadius: 14, border: "1px solid #e2e8f0" }}>
        Caricamento Archivio Drive…
      </div>
    );
  }

  if (!config?.configured) {
    return (
      <div style={{ padding: 24, background: "white", borderRadius: 14, border: "1px solid #e2e8f0" }}>
        Configurazione Google non disponibile.
      </div>
    );
  }

  if (!config.connected || !config.drive_ready) {
    return (
      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 16,
          padding: 22,
          display: "grid",
          gap: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 20, fontWeight: 950, color: "#173f78" }}>
            ARCHIVIO GOOGLE DRIVE
          </div>
          <div style={{ marginTop: 6, color: "#64748b", lineHeight: 1.5 }}>
            {config.can_manage
              ? config.connected
                ? "Google è già collegato, ma manca l'autorizzazione in sola lettura a Drive."
                : "Collega il tuo account Google per scegliere la cartella da usare come archivio."
              : "L'Archivio Drive deve essere prima autorizzato e configurato dal superadmin."}
          </div>
        </div>
        {config.can_manage && (
          <div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void connectGoogle()}
              style={{ ...buttonStyle, background: "#2563eb", color: "white", borderColor: "#2563eb" }}
            >
              {busy
                ? "COLLEGAMENTO…"
                : config.connected
                ? "AUTORIZZA GOOGLE DRIVE"
                : "COLLEGA GOOGLE"}
            </button>
          </div>
        )}
        {error && <div style={{ color: "#b91c1c", fontWeight: 750 }}>{error}</div>}
      </div>
    );
  }

  if (!config.folder_id && !config.can_manage) {
    return (
      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 16,
          padding: 22,
          color: "#475569",
          fontWeight: 750,
        }}
      >
        Il superadmin non ha ancora scelto la cartella da usare come Archivio Drive.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 16,
          padding: 16,
        }}
      >
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
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>
              {browseMode ? "SCEGLI CARTELLA ARCHIVIO" : "CARTELLA ARCHIVIO"}
            </div>
            <div style={{ marginTop: 3, fontSize: 21, fontWeight: 950, color: "#173f78" }}>
              📁 {currentFolder?.name || config.folder_name || "Google Drive"}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {folderStack.length > 1 && (
              <button type="button" onClick={() => void goBack()} disabled={busy} style={buttonStyle}>
                ← INDIETRO
              </button>
            )}
            {config.can_manage && (
              browseMode ? (
                <button
                  type="button"
                  onClick={() => void chooseFolder()}
                  disabled={busy || !currentFolder}
                  style={{ ...buttonStyle, background: "#16a34a", color: "white", borderColor: "#16a34a" }}
                >
                  USA QUESTA CARTELLA
                </button>
              ) : (
                <button type="button" onClick={() => void startChangeFolder()} disabled={busy} style={buttonStyle}>
                  CAMBIA CARTELLA
                </button>
              )
            )}
            <button
              type="button"
              onClick={() => currentFolder && void loadFolder(currentFolder.id, currentFolder.name, true)}
              disabled={busy || !currentFolder}
              style={buttonStyle}
            >
              ↻ AGGIORNA
            </button>
          </div>
        </div>

        {message && (
          <div style={{ marginTop: 12, color: "#047857", fontWeight: 750 }}>
            {message}
          </div>
        )}
        {error && (
          <div style={{ marginTop: 12, color: "#b91c1c", fontWeight: 750 }}>
            {error}
          </div>
        )}
      </div>

      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: 14, borderBottom: "1px solid #e2e8f0" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca per nome nella cartella…"
            style={{
              width: "min(560px, 100%)",
              padding: "10px 12px",
              border: "1px solid #cbd5e1",
              borderRadius: 9,
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 850 }}>
            <thead>
              <tr style={{ background: "#f8fafc", color: "#475569" }}>
                <th style={{ padding: 11, textAlign: "left" }}>Nome</th>
                <th style={{ padding: 11, textAlign: "left" }}>Tipo</th>
                <th style={{ padding: 11, textAlign: "left" }}>Modificato</th>
                <th style={{ padding: 11, textAlign: "right" }}>Dimensione</th>
                <th style={{ padding: 11, textAlign: "right" }}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item) => {
                const googleNative =
                  item.mime_type.startsWith(GOOGLE_APPS_PREFIX) && !item.is_folder;

                return (
                  <tr key={item.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                    <td style={{ padding: 11 }}>
                      <button
                        type="button"
                        onClick={() => void openItem(item)}
                        style={{
                          border: 0,
                          background: "transparent",
                          padding: 0,
                          color: item.is_folder ? "#1d4ed8" : "#0f172a",
                          fontWeight: 850,
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <span style={{ marginRight: 8 }}>{itemIcon(item)}</span>
                        {item.name}
                      </button>
                    </td>
                    <td style={{ padding: 11, fontSize: 12, fontWeight: 750, color: "#64748b" }}>
                      {typeLabel(item)}
                    </td>
                    <td style={{ padding: 11, fontSize: 12 }}>{formatDate(item.modified_time)}</td>
                    <td style={{ padding: 11, textAlign: "right", fontSize: 12 }}>
                      {item.is_folder ? "—" : formatBytes(item.size)}
                    </td>
                    <td style={{ padding: 11, textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 7, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          onClick={() => void openItem(item)}
                          style={{
                            ...buttonStyle,
                            padding: "6px 9px",
                            fontSize: 11,
                            background: item.is_folder ? "#eff6ff" : "white",
                            color: item.is_folder ? "#1d4ed8" : "#0f172a",
                          }}
                        >
                          {item.is_folder ? "APRI CARTELLA" : "APRI"}
                        </button>
                        {!item.is_folder && !googleNative && item.can_download && (
                          <button
                            type="button"
                            onClick={() => void downloadItem(item)}
                            disabled={busy}
                            style={{ ...buttonStyle, padding: "6px 9px", fontSize: 11 }}
                          >
                            SCARICA
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!visibleItems.length && (
                <tr>
                  <td colSpan={5} style={{ padding: 28, textAlign: "center", color: "#64748b" }}>
                    {busy ? "Caricamento…" : "Nessun file trovato."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
