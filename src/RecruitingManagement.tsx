import React, { useEffect, useMemo, useState } from "react";
import { getRecruitingContext, type RecruitingContext } from "./recruitingClient";
import { geocodeItalianZone, ITALIAN_REGIONS, normalizeItalianRegion } from "./recruitingData";

type Macroarea = {
  id: string;
  name: string;
  regions: string[];
};

type ActiveAgent = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  zone: string;
  region: string;
  latitude: number | null;
  longitude: number | null;
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
  padding: "9px 11px",
  fontSize: 14,
  background: "white",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 5,
  fontSize: 12,
  fontWeight: 800,
  color: "#475569",
};

const buttonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: 9,
  padding: "9px 13px",
  fontWeight: 800,
  cursor: "pointer",
};

function rowToAgent(row: any): ActiveAgent {
  return {
    id: String(row.id),
    firstName: String(row.first_name || ""),
    lastName: String(row.last_name || ""),
    phone: String(row.phone || ""),
    zone: String(row.zone || ""),
    region: String(row.region || ""),
    latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
    longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
  };
}

export default function RecruitingManagement() {
  const [ctx, setCtx] = useState<RecruitingContext | null>(null);
  const [macroareas, setMacroareas] = useState<Macroarea[]>([]);
  const [agents, setAgents] = useState<ActiveAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const [macroId, setMacroId] = useState<string | null>(null);
  const [macroName, setMacroName] = useState("");
  const [macroRegions, setMacroRegions] = useState<string[]>([]);
  const [regionSearch, setRegionSearch] = useState("");

  const [agentId, setAgentId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [zone, setZone] = useState("");

  const loadAll = async (context?: RecruitingContext) => {
    const active = context || ctx || (await getRecruitingContext());
    if (!ctx) setCtx(active);

    const [macroResult, regionsResult, agentsResult] = await Promise.all([
      active.client
        .from("recruiting_macroareas")
        .select("id,name")
        .order("name", { ascending: true }),
      active.client
        .from("recruiting_macroarea_regions")
        .select("macroarea_id,region"),
      active.client
        .from("recruiting_active_agents")
        .select("id,first_name,last_name,phone,zone,region,latitude,longitude")
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true }),
    ]);

    if (macroResult.error) throw macroResult.error;
    if (regionsResult.error) throw regionsResult.error;
    if (agentsResult.error) throw agentsResult.error;

    const regionMap = new Map<string, string[]>();
    (regionsResult.data || []).forEach((row: any) => {
      const list = regionMap.get(String(row.macroarea_id)) || [];
      list.push(String(row.region));
      regionMap.set(String(row.macroarea_id), list);
    });

    setMacroareas(
      (macroResult.data || []).map((row: any) => ({
        id: String(row.id),
        name: String(row.name || ""),
        regions: (regionMap.get(String(row.id)) || []).sort((a, b) => a.localeCompare(b, "it")),
      }))
    );
    setAgents((agentsResult.data || []).map(rowToAgent));
  };

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const context = await getRecruitingContext();
        setCtx(context);
        await loadAll(context);
      } catch (error: any) {
        console.error(error);
        setMessage("Errore nel caricamento Gestione Recruiting: " + (error?.message || error));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredRegions = useMemo(() => {
    const needle = regionSearch.trim().toLocaleLowerCase("it");
    if (!needle) return [...ITALIAN_REGIONS];
    return ITALIAN_REGIONS.filter((region) => region.toLocaleLowerCase("it").includes(needle));
  }, [regionSearch]);

  const resetMacroForm = () => {
    setMacroId(null);
    setMacroName("");
    setMacroRegions([]);
    setRegionSearch("");
  };

  const saveMacroarea = async () => {
    if (!ctx) return;
    if (!macroName.trim()) {
      setMessage("Inserisci il nome della macroarea.");
      return;
    }
    if (!macroRegions.length) {
      setMessage("Seleziona almeno una regione per la macroarea.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      let id = macroId;

      if (id) {
        const { error } = await ctx.client
          .from("recruiting_macroareas")
          .update({ name: macroName.trim(), updated_at: new Date().toISOString() })
          .eq("id", id);
        if (error) throw error;

        const { error: deleteError } = await ctx.client
          .from("recruiting_macroarea_regions")
          .delete()
          .eq("macroarea_id", id);
        if (deleteError) throw deleteError;
      } else {
        const { data, error } = await ctx.client
          .from("recruiting_macroareas")
          .insert({
            owner_key: ctx.ownerKey,
            name: macroName.trim(),
          })
          .select("id")
          .single();
        if (error) throw error;
        id = String(data.id);
      }

      const { error: regionsError } = await ctx.client
        .from("recruiting_macroarea_regions")
        .insert(
          macroRegions.map((region) => ({
            owner_key: ctx.ownerKey,
            macroarea_id: id,
            region,
          }))
        );
      if (regionsError) throw regionsError;

      await loadAll(ctx);
      resetMacroForm();
      setMessage("Macroarea salvata.");
    } catch (error: any) {
      console.error(error);
      setMessage("Errore nel salvataggio della macroarea: " + (error?.message || error));
    } finally {
      setBusy(false);
    }
  };

  const editMacroarea = (macro: Macroarea) => {
    setMacroId(macro.id);
    setMacroName(macro.name);
    setMacroRegions([...macro.regions]);
    setRegionSearch("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteMacroarea = async (macro: Macroarea) => {
    if (!ctx || !window.confirm(`Eliminare la macroarea "${macro.name}"?`)) return;
    setBusy(true);
    try {
      const { error } = await ctx.client
        .from("recruiting_macroareas")
        .delete()
        .eq("id", macro.id);
      if (error) throw error;
      await loadAll(ctx);
      if (macroId === macro.id) resetMacroForm();
      setMessage("Macroarea eliminata.");
    } catch (error: any) {
      setMessage("Errore nell'eliminazione: " + (error?.message || error));
    } finally {
      setBusy(false);
    }
  };

  const resetAgentForm = () => {
    setAgentId(null);
    setFirstName("");
    setLastName("");
    setPhone("");
    setZone("");
  };

  const saveAgent = async () => {
    if (!ctx) return;
    if (!firstName.trim() || !lastName.trim()) {
      setMessage("Inserisci nome e cognome dell'agente.");
      return;
    }
    if (!zone.trim()) {
      setMessage("Inserisci la zona dell'agente.");
      return;
    }

    setBusy(true);
    setMessage("Geolocalizzo la zona...");
    try {
      const geo = await geocodeItalianZone(zone.trim());
      const region = normalizeItalianRegion(geo.region || zone.trim());
      const payload = {
        owner_key: ctx.ownerKey,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim(),
        zone: zone.trim(),
        region: ITALIAN_REGIONS.includes(region as any) ? region : "",
        latitude: geo.latitude,
        longitude: geo.longitude,
        updated_at: new Date().toISOString(),
      };

      if (agentId) {
        const { error } = await ctx.client
          .from("recruiting_active_agents")
          .update(payload)
          .eq("id", agentId);
        if (error) throw error;
      } else {
        const { error } = await ctx.client
          .from("recruiting_active_agents")
          .insert(payload);
        if (error) throw error;
      }

      await loadAll(ctx);
      resetAgentForm();

      setMessage(
        geo.latitude !== null && geo.longitude !== null
          ? "Agente attivo salvato e posizionato sulla cartina."
          : "Agente salvato, ma la zona non è stata geolocalizzata. Modifica la zona con una città o località più precisa."
      );
    } catch (error: any) {
      console.error(error);
      setMessage("Errore nel salvataggio dell'agente: " + (error?.message || error));
    } finally {
      setBusy(false);
    }
  };

  const editAgent = (agent: ActiveAgent) => {
    setAgentId(agent.id);
    setFirstName(agent.firstName);
    setLastName(agent.lastName);
    setPhone(agent.phone);
    setZone(agent.zone);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteAgent = async (agent: ActiveAgent) => {
    if (!ctx || !window.confirm(`Eliminare ${agent.firstName} ${agent.lastName} dagli agenti attivi?`)) return;
    setBusy(true);
    try {
      const { error } = await ctx.client
        .from("recruiting_active_agents")
        .delete()
        .eq("id", agent.id);
      if (error) throw error;
      await loadAll(ctx);
      if (agentId === agent.id) resetAgentForm();
      setMessage("Agente attivo eliminato.");
    } catch (error: any) {
      setMessage("Errore nell'eliminazione: " + (error?.message || error));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div style={cardStyle}>Caricamento Gestione Recruiting...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          style={{
            ...buttonStyle,
            background: "#0f172a",
            color: "white",
          }}
        >
          ASSEGNAZIONE ZONE
        </button>
      </div>

      {message && (
        <div
          style={{
            ...cardStyle,
            padding: "10px 12px",
            background: "#eff6ff",
            borderColor: "#bfdbfe",
            color: "#1e3a8a",
            fontWeight: 700,
          }}
        >
          {message}
        </div>
      )}

      <div style={{ ...cardStyle, display: "grid", gridTemplateColumns: "minmax(280px,420px) 1fr", gap: 18 }}>
        <div>
          <h3 style={{ marginTop: 0 }}>{macroId ? "Modifica macroarea" : "Nuova macroarea"}</h3>

          <label style={labelStyle}>Nome macroarea</label>
          <input
            value={macroName}
            onChange={(event) => setMacroName(event.target.value)}
            placeholder="Es. CENTRO ITALIA"
            style={inputStyle}
          />

          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>Regioni comprese</label>
            <input
              type="search"
              value={regionSearch}
              onChange={(event) => setRegionSearch(event.target.value)}
              placeholder="Cerca regione..."
              style={{ ...inputStyle, marginBottom: 8 }}
            />

            <div
              style={{
                maxHeight: 260,
                overflow: "auto",
                border: "1px solid #e2e8f0",
                borderRadius: 9,
                padding: 8,
              }}
            >
              {filteredRegions.map((region) => (
                <label
                  key={region}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 4px",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={macroRegions.includes(region)}
                    onChange={() =>
                      setMacroRegions((current) =>
                        current.includes(region)
                          ? current.filter((item) => item !== region)
                          : [...current, region]
                      )
                    }
                  />
                  {region}
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveMacroarea()}
              style={{ ...buttonStyle, background: "#16a34a", color: "white", opacity: busy ? 0.6 : 1 }}
            >
              {macroId ? "Salva modifiche" : "Crea macroarea"}
            </button>
            {macroId && (
              <button type="button" onClick={resetMacroForm} style={{ ...buttonStyle, background: "#e2e8f0" }}>
                Annulla
              </button>
            )}
          </div>
        </div>

        <div>
          <h3 style={{ marginTop: 0 }}>Macroaree disponibili</h3>
          {!macroareas.length ? (
            <div style={{ color: "#64748b" }}>Nessuna macroarea creata.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {macroareas.map((macro) => (
                <div
                  key={macro.id}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 9,
                    padding: 11,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <div>
                    <strong>{macro.name}</strong>
                    <div style={{ marginTop: 4, fontSize: 13, color: "#64748b" }}>
                      {macro.regions.join(" · ")}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" onClick={() => editMacroarea(macro)} style={{ ...buttonStyle, padding: "7px 10px", background: "#e0f2fe" }}>
                      Modifica
                    </button>
                    <button type="button" onClick={() => void deleteMacroarea(macro)} style={{ ...buttonStyle, padding: "7px 10px", background: "#fee2e2", color: "#991b1b" }}>
                      Elimina
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Agenti attivi da mostrare sulla cartina</h3>
        <div style={{ color: "#64748b", fontSize: 13, marginBottom: 14 }}>
          Inserisci nome, cognome, cellulare e zona. La zona viene trasformata automaticamente in un punto geografico per la mappa RECRUITING.
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
            gap: 10,
            alignItems: "end",
          }}
        >
          <div>
            <label style={labelStyle}>Nome</label>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Cognome</label>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Cellulare</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Zona</label>
            <input
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              placeholder="Es. Perugia"
              style={inputStyle}
            />
          </div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveAgent()}
              style={{ ...buttonStyle, background: "#f97316", color: "white", opacity: busy ? 0.6 : 1 }}
            >
              {agentId ? "Salva agente" : "Aggiungi agente"}
            </button>
            {agentId && (
              <button type="button" onClick={resetAgentForm} style={{ ...buttonStyle, background: "#e2e8f0" }}>
                Annulla
              </button>
            )}
          </div>
        </div>

        <div style={{ overflowX: "auto", marginTop: 16 }}>
          <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Nome", "Cognome", "Cellulare", "Zona", "Regione", "Mappa", "Azioni"].map((head) => (
                  <th key={head} style={{ textAlign: "left", padding: "9px 10px", borderBottom: "1px solid #cbd5e1" }}>
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr key={agent.id}>
                  <td style={{ padding: "9px 10px", borderBottom: "1px solid #f1f5f9" }}>{agent.firstName}</td>
                  <td style={{ padding: "9px 10px", borderBottom: "1px solid #f1f5f9" }}>{agent.lastName}</td>
                  <td style={{ padding: "9px 10px", borderBottom: "1px solid #f1f5f9" }}>{agent.phone || "—"}</td>
                  <td style={{ padding: "9px 10px", borderBottom: "1px solid #f1f5f9" }}>{agent.zone || "—"}</td>
                  <td style={{ padding: "9px 10px", borderBottom: "1px solid #f1f5f9" }}>{agent.region || "—"}</td>
                  <td style={{ padding: "9px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 800 }}>
                    {agent.latitude !== null && agent.longitude !== null ? "✓ Posizionato" : "Da verificare"}
                  </td>
                  <td style={{ padding: "9px 10px", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" }}>
                    <button type="button" onClick={() => editAgent(agent)} style={{ ...buttonStyle, padding: "6px 9px", marginRight: 6, background: "#e0f2fe" }}>
                      Modifica
                    </button>
                    <button type="button" onClick={() => void deleteAgent(agent)} style={{ ...buttonStyle, padding: "6px 9px", background: "#fee2e2", color: "#991b1b" }}>
                      Elimina
                    </button>
                  </td>
                </tr>
              ))}
              {!agents.length && (
                <tr>
                  <td colSpan={7} style={{ padding: 16, textAlign: "center", color: "#64748b" }}>
                    Nessun agente attivo inserito.
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
