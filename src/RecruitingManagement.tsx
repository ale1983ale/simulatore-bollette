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
  dmReference: string;
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
    dmReference: String(
      row.dm_reference || row.dm1 || row.dm2 || ""
    ),
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
  const [agentDm, setAgentDm] = useState("");
  const [agentShowOnMap, setAgentShowOnMap] = useState(false);
  const [dmReferenceFilter, setDmReferenceFilter] = useState("");
  const [customDmEditor, setCustomDmEditor] = useState<{
    agentId: string;
    value: string;
  } | null>(null);
  const [dmDirtyAgentIds, setDmDirtyAgentIds] =
    useState<Set<string>>(new Set());

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
        .select("id,first_name,last_name,phone,zone,region,dm_reference,dm1,dm2,latitude,longitude")
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

  const dmSuggestions = useMemo(
    () =>
      Array.from(
        new Set(
          agents
            .map((agent) => agent.dmReference.trim())
            .filter(Boolean)
        )
      ).sort((a, b) =>
        a.localeCompare(b, "it", { sensitivity: "base" })
      ),
    [agents]
  );

  const filteredAgents = useMemo(() => {
    const dmNeedle = dmReferenceFilter
      .trim()
      .toLocaleLowerCase("it");

    return agents.filter((agent) => {
      if (
        dmNeedle &&
        !agent.dmReference
          .toLocaleLowerCase("it")
          .includes(dmNeedle)
      ) {
        return false;
      }

      return true;
    });
  }, [agents, dmReferenceFilter]);

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

  const stageAgentDm = (
    agent: ActiveAgent,
    value: string
  ) => {
    const clean = value.trim();

    setAgents((current) =>
      current.map((item) =>
        item.id === agent.id
          ? { ...item, dmReference: clean }
          : item
      )
    );
    setDmDirtyAgentIds((current) => {
      const next = new Set(current);
      next.add(agent.id);
      return next;
    });
    setCustomDmEditor(null);
    setMessage(
      "DM di Riferimento modificato. Premi SALVA MODIFICHE per confermare."
    );
  };

  const saveDmChanges = async () => {
    if (!ctx || dmDirtyAgentIds.size === 0) return;

    const rowsToSave = agents.filter((agent) =>
      dmDirtyAgentIds.has(agent.id)
    );

    setBusy(true);
    setMessage("");

    try {
      for (const agent of rowsToSave) {
        const { error } = await ctx.client
          .from("recruiting_active_agents")
          .update({
            dm_reference: agent.dmReference.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", agent.id)
          .eq("owner_key", ctx.ownerKey);

        if (error) throw error;
      }

      setDmDirtyAgentIds(new Set());
      setCustomDmEditor(null);
      setMessage(
        `DM di Riferimento salvato per ${rowsToSave.length} ${rowsToSave.length === 1 ? "agente" : "agenti"}.`
      );
    } catch (error: any) {
      setMessage(
        "Errore nel salvataggio DM di Riferimento: " +
          (error?.message || error)
      );
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
    setAgentDm("");
    setAgentShowOnMap(false);
  };

  const saveAgent = async () => {
    if (!ctx) return;
    if (!firstName.trim() || !lastName.trim()) {
      setMessage("Inserisci nome e cognome dell'agente.");
      return;
    }
    if (agentShowOnMap && !zone.trim()) {
      setMessage(
        "Per attivare MOSTRA IN MAPPA devi prima inserire la zona dell'agente."
      );
      return;
    }

    setBusy(true);
    setMessage(
      zone.trim()
        ? "Aggiorno zona e dati agente..."
        : "Aggiorno dati agente..."
    );

    try {
      const currentAgent = agentId
        ? agents.find((item) => item.id === agentId) || null
        : null;

      let region = currentAgent?.region || "";
      let latitude = agentShowOnMap
        ? currentAgent?.latitude ?? null
        : null;
      let longitude = agentShowOnMap
        ? currentAgent?.longitude ?? null
        : null;

      const zoneChanged =
        zone.trim() !== String(currentAgent?.zone || "").trim();

      if (zone.trim() && (zoneChanged || agentShowOnMap)) {
        const geo = await geocodeItalianZone(zone.trim());
        const normalizedRegion = normalizeItalianRegion(
          geo.region || zone.trim()
        );

        region = ITALIAN_REGIONS.includes(normalizedRegion as any)
          ? normalizedRegion
          : region;

        if (agentShowOnMap) {
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
        } else {
          latitude = null;
          longitude = null;
        }
      } else if (!zone.trim()) {
        region = "";
        latitude = null;
        longitude = null;
      }

      const payload = {
        owner_key: ctx.ownerKey,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim(),
        zone: zone.trim(),
        region,
        dm_reference: agentDm.trim(),
        latitude,
        longitude,
        updated_at: new Date().toISOString(),
      };

      if (agentId) {
        const { error } = await ctx.client
          .from("recruiting_active_agents")
          .update(payload)
          .eq("id", agentId)
          .eq("owner_key", ctx.ownerKey);
        if (error) throw error;
      } else {
        const { error } = await ctx.client
          .from("recruiting_active_agents")
          .insert(payload);
        if (error) throw error;
      }

      await loadAll(ctx);
      const savedName = `${firstName.trim()} ${lastName.trim()}`.trim();
      resetAgentForm();

      setMessage(
        agentShowOnMap
          ? `${savedName}: modifiche salvate e agente visibile sulla mappa.`
          : `${savedName}: modifiche salvate. Agente non mostrato sulla mappa.`
      );
    } catch (error: any) {
      console.error(error);
      setMessage(
        "Errore nel salvataggio dell'agente: " +
          (error?.message || error)
      );
    } finally {
      setBusy(false);
    }
  };

  const editAgent = (agent: ActiveAgent) => {
    if (agentId === agent.id) {
      resetAgentForm();
      return;
    }

    setAgentId(agent.id);
    setFirstName(agent.firstName);
    setLastName(agent.lastName);
    setPhone(agent.phone);
    setZone(agent.zone);
    setAgentDm(agent.dmReference);
    setAgentShowOnMap(
      agent.latitude !== null &&
        agent.longitude !== null
    );
    setMessage("");
  };

  const toggleAgentOnMap = async (
    agent: ActiveAgent,
    showOnMap: boolean
  ) => {
    if (!ctx) return;

    setBusy(true);
    try {
      if (!showOnMap) {
        const { error } = await ctx.client
          .from("recruiting_active_agents")
          .update({
            latitude: null,
            longitude: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", agent.id)
          .eq("owner_key", ctx.ownerKey);

        if (error) throw error;

        setAgents((current) =>
          current.map((item) =>
            item.id === agent.id
              ? { ...item, latitude: null, longitude: null }
              : item
          )
        );
        setMessage(
          `${agent.firstName} ${agent.lastName} non viene più mostrato sulla mappa.`
        );
        return;
      }

      if (!agent.zone.trim()) {
        setMessage(
          "Per mostrare l'agente sulla mappa devi prima indicare una zona."
        );
        return;
      }

      setMessage("Geolocalizzo la zona dell'agente...");
      const geo = await geocodeItalianZone(agent.zone.trim());

      if (
        geo.latitude === null ||
        geo.longitude === null ||
        !Number.isFinite(geo.latitude) ||
        !Number.isFinite(geo.longitude)
      ) {
        setMessage(
          "Non riesco a posizionare l'agente. Modifica la zona indicando una città o località più precisa."
        );
        return;
      }

      const region = normalizeItalianRegion(
        geo.region || agent.zone.trim()
      );

      const { error } = await ctx.client
        .from("recruiting_active_agents")
        .update({
          region: ITALIAN_REGIONS.includes(region as any)
            ? region
            : agent.region,
          latitude: geo.latitude,
          longitude: geo.longitude,
          updated_at: new Date().toISOString(),
        })
        .eq("id", agent.id)
        .eq("owner_key", ctx.ownerKey);

      if (error) throw error;

      setAgents((current) =>
        current.map((item) =>
          item.id === agent.id
            ? {
                ...item,
                region: ITALIAN_REGIONS.includes(region as any)
                  ? region
                  : item.region,
                latitude: geo.latitude,
                longitude: geo.longitude,
              }
            : item
        )
      );
      setMessage(
        `${agent.firstName} ${agent.lastName} è stato aggiunto alla mappa.`
      );
    } catch (error: any) {
      console.error(error);
      setMessage(
        "Errore nell'aggiornamento della mappa agente: " +
          (error?.message || error)
      );
    } finally {
      setBusy(false);
    }
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
      <style>{`
        .rm-mobile-agents { display: none; }
        .rm-desktop-agents { display: block; }
        @media (max-width: 800px) {
          .rm-desktop-agents { display: none !important; }
          .rm-mobile-agents {
            display: flex !important;
            flex-direction: column;
            gap: 10px;
          }
          .rm-inline-edit-grid,
          .rm-agent-top-grid,
          .rm-macro-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
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

      <div className="rm-macro-grid" style={{ ...cardStyle, display: "grid", gridTemplateColumns: "minmax(280px,420px) 1fr", gap: 18 }}>
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
          className="rm-agent-top-grid"
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
          <div>
            <label style={labelStyle}>DM di Riferimento</label>
            <input
              list="recruiting-dm-suggestions"
              value={agentDm}
              onChange={(e) => setAgentDm(e.target.value)}
              placeholder="Seleziona o scrivi un DM"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Mappa</label>
            <label
              style={{
                minHeight: 40,
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontWeight: 800,
              }}
            >
              <input
                type="checkbox"
                checked={agentShowOnMap}
                onChange={(e) => setAgentShowOnMap(e.target.checked)}
              />
              MOSTRA IN MAPPA
            </label>
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

        <datalist id="recruiting-dm-suggestions">
          {dmSuggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit,minmax(190px,1fr))",
            gap: 10,
            alignItems: "end",
            marginTop: 16,
            padding: 12,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
          }}
        >
          <div>
            <label style={labelStyle}>Filtro DM di Riferimento</label>
            <input
              type="search"
              list="recruiting-dm-suggestions"
              value={dmReferenceFilter}
              onChange={(event) =>
                setDmReferenceFilter(event.target.value)
              }
              placeholder="Cerca DM di Riferimento..."
              style={inputStyle}
            />
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={busy || dmDirtyAgentIds.size === 0}
              onClick={() => void saveDmChanges()}
              style={{
                ...buttonStyle,
                background:
                  busy || dmDirtyAgentIds.size === 0
                    ? "#cbd5e1"
                    : "#16a34a",
                color: "white",
                cursor:
                  busy || dmDirtyAgentIds.size === 0
                    ? "not-allowed"
                    : "pointer",
                opacity:
                  busy || dmDirtyAgentIds.size === 0 ? 0.7 : 1,
              }}
            >
              {busy
                ? "SALVATAGGIO..."
                : dmDirtyAgentIds.size
                  ? `SALVA MODIFICHE (${dmDirtyAgentIds.size})`
                  : "SALVA MODIFICHE"}
            </button>

            <button
              type="button"
              onClick={() => {
                setDmReferenceFilter("");
              }}
              style={{
                ...buttonStyle,
                background: "#e2e8f0",
                color: "#0f172a",
              }}
            >
              AZZERA FILTRI
            </button>
            <span
              style={{
                alignSelf: "center",
                fontSize: 12,
                color: "#64748b",
                fontWeight: 800,
              }}
            >
              {filteredAgents.length} agenti
            </span>
          </div>
        </div>

        <div className="rm-desktop-agents" style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Nome", "Cognome", "Cellulare", "Zona", "Regione", "DM di Riferimento", "Mappa", "Azioni"].map((head) => (
                  <th key={head} style={{ textAlign: "left", padding: "9px 10px", borderBottom: "1px solid #cbd5e1" }}>
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredAgents.map((agent) => {
                const isEditing = agentId === agent.id;
                const isOnMap =
                  agent.latitude !== null &&
                  agent.longitude !== null;

                return (
                  <React.Fragment key={agent.id}>
                    <tr
                      style={{
                        background: isEditing
                          ? "#eff6ff"
                          : dmDirtyAgentIds.has(agent.id)
                            ? "#f0fdf4"
                            : "transparent",
                      }}
                    >
                      <td style={{ padding: "9px 10px", borderBottom: "1px solid #f1f5f9" }}>{agent.firstName}</td>
                      <td style={{ padding: "9px 10px", borderBottom: "1px solid #f1f5f9" }}>{agent.lastName}</td>
                      <td style={{ padding: "9px 10px", borderBottom: "1px solid #f1f5f9" }}>{agent.phone || "—"}</td>
                      <td style={{ padding: "9px 10px", borderBottom: "1px solid #f1f5f9" }}>{agent.zone || "—"}</td>
                      <td style={{ padding: "9px 10px", borderBottom: "1px solid #f1f5f9" }}>{agent.region || "—"}</td>

                      <td
                        style={{
                          padding: "9px 10px",
                          borderBottom: "1px solid #f1f5f9",
                          minWidth: 190,
                          verticalAlign: "top",
                        }}
                      >
                        <select
                          value={
                            customDmEditor?.agentId === agent.id
                              ? "__ALTRO__"
                              : agent.dmReference
                          }
                          disabled={busy}
                          onChange={(event) => {
                            const value = event.target.value;

                            if (value === "__ALTRO__") {
                              setCustomDmEditor({
                                agentId: agent.id,
                                value: agent.dmReference,
                              });
                              return;
                            }

                            stageAgentDm(agent, value);
                          }}
                          style={{
                            ...inputStyle,
                            minWidth: 180,
                            padding: "7px 8px",
                          }}
                        >
                          <option value="">—</option>
                          {dmSuggestions.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                          <option value="__ALTRO__">ALTRO</option>
                        </select>

                        {customDmEditor?.agentId === agent.id && (
                          <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                            <input
                              autoFocus
                              list="recruiting-dm-suggestions"
                              value={customDmEditor?.value || ""}
                              onChange={(event) =>
                                setCustomDmEditor((current) =>
                                  current
                                    ? { ...current, value: event.target.value }
                                    : current
                                )
                              }
                              placeholder="Inserisci DM di Riferimento"
                              style={{
                                ...inputStyle,
                                minWidth: 180,
                                padding: "7px 8px",
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  stageAgentDm(
                                    agent,
                                    customDmEditor?.value || ""
                                  );
                                }
                              }}
                            />
                            <div style={{ display: "flex", gap: 5 }}>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  stageAgentDm(
                                    agent,
                                    customDmEditor?.value || ""
                                  )
                                }
                                style={{
                                  ...buttonStyle,
                                  padding: "5px 8px",
                                  background: "#16a34a",
                                  color: "white",
                                }}
                              >
                                OK
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setCustomDmEditor(null)}
                                style={{
                                  ...buttonStyle,
                                  padding: "5px 8px",
                                  background: "#e2e8f0",
                                }}
                              >
                                Annulla
                              </button>
                            </div>
                          </div>
                        )}
                      </td>

                      <td style={{ padding: "9px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 800 }}>
                        <label
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            cursor: busy ? "not-allowed" : "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isOnMap}
                            disabled={busy}
                            onChange={(event) => {
                              if (event.target.checked && !agent.zone.trim()) {
                                editAgent(agent);
                                setAgentShowOnMap(true);
                                setMessage(
                                  "Inserisci la ZONA nella modifica aperta e premi SALVA AGENTE per mostrarlo sulla mappa."
                                );
                                return;
                              }
                              void toggleAgentOnMap(
                                agent,
                                event.target.checked
                              );
                            }}
                            style={{
                              width: 18,
                              height: 18,
                              cursor: busy ? "not-allowed" : "pointer",
                            }}
                          />
                          <span>{isOnMap ? "Mostra" : "Non mostrare"}</span>
                        </label>
                      </td>

                      <td style={{ padding: "9px 10px", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          onClick={() => editAgent(agent)}
                          style={{
                            ...buttonStyle,
                            padding: "6px 9px",
                            marginRight: 6,
                            background: isEditing ? "#dbeafe" : "#e0f2fe",
                          }}
                        >
                          {isEditing ? "Chiudi modifica" : "Modifica"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteAgent(agent)}
                          style={{
                            ...buttonStyle,
                            padding: "6px 9px",
                            background: "#fee2e2",
                            color: "#991b1b",
                          }}
                        >
                          Elimina
                        </button>
                      </td>
                    </tr>

                    {isEditing && (
                      <tr>
                        <td
                          colSpan={8}
                          style={{
                            padding: 12,
                            background: "#eff6ff",
                            borderBottom: "2px solid #93c5fd",
                          }}
                        >
                          <div
                            style={{
                              border: "2px solid #2563eb",
                              borderRadius: 12,
                              padding: 12,
                              background: "white",
                            }}
                          >
                            <div
                              className="rm-inline-edit-grid"
                              style={{
                                display: "grid",
                                gridTemplateColumns:
                                  "repeat(auto-fit,minmax(170px,1fr))",
                                gap: 10,
                              }}
                            >
                              <div>
                                <label style={labelStyle}>Nome</label>
                                <input
                                  value={firstName}
                                  onChange={(e) => setFirstName(e.target.value)}
                                  style={inputStyle}
                                />
                              </div>
                              <div>
                                <label style={labelStyle}>Cognome</label>
                                <input
                                  value={lastName}
                                  onChange={(e) => setLastName(e.target.value)}
                                  style={inputStyle}
                                />
                              </div>
                              <div>
                                <label style={labelStyle}>Cellulare</label>
                                <input
                                  value={phone}
                                  onChange={(e) => setPhone(e.target.value)}
                                  style={inputStyle}
                                />
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
                              <div>
                                <label style={labelStyle}>DM di Riferimento</label>
                                <input
                                  list="recruiting-dm-suggestions"
                                  value={agentDm}
                                  onChange={(e) => setAgentDm(e.target.value)}
                                  placeholder="Seleziona o scrivi un DM"
                                  style={inputStyle}
                                />
                              </div>
                              <div>
                                <label style={labelStyle}>Mappa</label>
                                <label
                                  style={{
                                    minHeight: 40,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    fontWeight: 900,
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={agentShowOnMap}
                                    onChange={(e) =>
                                      setAgentShowOnMap(e.target.checked)
                                    }
                                    style={{ width: 18, height: 18 }}
                                  />
                                  {agentShowOnMap
                                    ? "MOSTRA IN MAPPA"
                                    : "NON MOSTRARE IN MAPPA"}
                                </label>
                              </div>
                            </div>

                            <div
                              style={{
                                display: "flex",
                                justifyContent: "flex-end",
                                gap: 8,
                                flexWrap: "wrap",
                                marginTop: 12,
                              }}
                            >
                              <button
                                type="button"
                                onClick={resetAgentForm}
                                style={{
                                  ...buttonStyle,
                                  background: "#e2e8f0",
                                }}
                              >
                                ANNULLA
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void saveAgent()}
                                style={{
                                  ...buttonStyle,
                                  background: busy ? "#94a3b8" : "#16a34a",
                                  color: "white",
                                }}
                              >
                                {busy ? "SALVATAGGIO..." : "SALVA AGENTE"}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {!filteredAgents.length && (
                <tr>
                  <td colSpan={8} style={{ padding: 16, textAlign: "center", color: "#64748b" }}>
                    {agents.length
                      ? "Nessun agente corrisponde al filtro DM di Riferimento."
                      : "Nessun agente attivo inserito."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rm-mobile-agents" style={{ marginTop: 12 }}>
          {filteredAgents.map((agent) => {
            const isEditing = agentId === agent.id;
            const isOnMap =
              agent.latitude !== null &&
              agent.longitude !== null;

            return (
              <div
                key={agent.id}
                style={{
                  border: isEditing
                    ? "2px solid #2563eb"
                    : "1px solid #cbd5e1",
                  borderRadius: 12,
                  padding: 12,
                  background: isEditing ? "#eff6ff" : "white",
                }}
              >
                <div style={{ fontWeight: 950, color: "#0f2d69" }}>
                  {agent.firstName} {agent.lastName}
                </div>
                <div style={{ display: "grid", gap: 4, marginTop: 8, fontSize: 13 }}>
                  <div><strong>Cellulare:</strong> {agent.phone || "—"}</div>
                  <div><strong>Zona:</strong> {agent.zone || "—"}</div>
                  <div><strong>Regione:</strong> {agent.region || "—"}</div>
                  <div><strong>DM:</strong> {agent.dmReference || "—"}</div>
                  <div><strong>Mappa:</strong> {isOnMap ? "MOSTRA" : "NON MOSTRARE"}</div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => editAgent(agent)}
                    style={{
                      ...buttonStyle,
                      background: isEditing ? "#dbeafe" : "#e0f2fe",
                    }}
                  >
                    {isEditing ? "CHIUDI MODIFICA" : "MODIFICA"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteAgent(agent)}
                    style={{
                      ...buttonStyle,
                      background: "#fee2e2",
                      color: "#991b1b",
                    }}
                  >
                    ELIMINA
                  </button>
                </div>

                {isEditing && (
                  <div
                    className="rm-inline-edit-grid"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr",
                      gap: 10,
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop: "1px solid #bfdbfe",
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
                      <input value={zone} onChange={(e) => setZone(e.target.value)} placeholder="Es. Perugia" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>DM di Riferimento</label>
                      <input
                        list="recruiting-dm-suggestions"
                        value={agentDm}
                        onChange={(e) => setAgentDm(e.target.value)}
                        placeholder="Seleziona o scrivi un DM"
                        style={inputStyle}
                      />
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 900 }}>
                      <input
                        type="checkbox"
                        checked={agentShowOnMap}
                        onChange={(e) => setAgentShowOnMap(e.target.checked)}
                      />
                      {agentShowOnMap ? "MOSTRA IN MAPPA" : "NON MOSTRARE IN MAPPA"}
                    </label>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void saveAgent()}
                      style={{
                        ...buttonStyle,
                        background: busy ? "#94a3b8" : "#16a34a",
                        color: "white",
                      }}
                    >
                      {busy ? "SALVATAGGIO..." : "SALVA AGENTE"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 12,
          }}
        >
          <button
            type="button"
            disabled={busy || dmDirtyAgentIds.size === 0}
            onClick={() => void saveDmChanges()}
            style={{
              ...buttonStyle,
              background:
                busy || dmDirtyAgentIds.size === 0
                  ? "#cbd5e1"
                  : "#16a34a",
              color: "white",
              cursor:
                busy || dmDirtyAgentIds.size === 0
                  ? "not-allowed"
                  : "pointer",
              opacity:
                busy || dmDirtyAgentIds.size === 0 ? 0.7 : 1,
              minWidth: 180,
            }}
          >
            {busy
              ? "SALVATAGGIO..."
              : dmDirtyAgentIds.size
                ? `SALVA MODIFICHE (${dmDirtyAgentIds.size})`
                : "SALVA MODIFICHE"}
          </button>
        </div>
      </div>
    </div>
  );
}
