import fs from "node:fs";

const filePath = "src/App.tsx";
let source = fs.readFileSync(filePath, "utf8");
let changed = false;

const oldYear = "const [selectedYear, setSelectedYear] = useState(2025);";
const newYear = `const [selectedYear, setSelectedYear] = useState(() => {
  const currentYear = new Date().getFullYear();
  const availableYears = ANNI.filter((anno) => anno <= currentYear);
  return availableYears.length
    ? Math.max(...availableYears)
    : Math.max(...ANNI);
});`;

if (source.includes(oldYear)) {
  source = source.replace(oldYear, newYear);
  changed = true;
} else if (!source.includes("const availableYears = ANNI.filter((anno) => anno <= currentYear);")) {
  throw new Error("Impossibile trovare la selezione anno PUN/PSV da aggiornare");
}

const listiniStart = source.indexOf("function Listini({");
const agentsStart = source.indexOf("function AgentsAdmin({", listiniStart);

if (listiniStart === -1 || agentsStart === -1) {
  throw new Error("Impossibile individuare il componente Listini");
}

const currentListini = source.slice(listiniStart, agentsStart);

if (!currentListini.includes("draftDispCpRows")) {
  const newListini = `function Listini({
  dispCpRows,
  setDispCpRows,
  energyOffers,
  setEnergyOffers,
  gasOffers,
  setGasOffers,
  gasAcciseSettings,
  setGasAcciseSettings,
}: {
  dispCpRows: DispCpRow[];
  setDispCpRows: React.Dispatch<React.SetStateAction<DispCpRow[]>>;
  energyOffers: EnergyOffer[];
  setEnergyOffers: React.Dispatch<React.SetStateAction<EnergyOffer[]>>;
  gasOffers: GasOffer[];
  setGasOffers: React.Dispatch<React.SetStateAction<GasOffer[]>>;
  gasAcciseSettings: GasAcciseSettings;
  setGasAcciseSettings: React.Dispatch<React.SetStateAction<GasAcciseSettings>>;
}) {
  const cloneDispCpRows = (rows: DispCpRow[]) => rows.map((row) => ({ ...row }));
  const cloneEnergyOffers = (rows: EnergyOffer[]) => rows.map((row) => ({ ...row }));
  const cloneGasOffers = (rows: GasOffer[]) => rows.map((row) => ({ ...row }));

  const [draftDispCpRows, setDraftDispCpRows] = useState<DispCpRow[]>(() => cloneDispCpRows(dispCpRows));
  const [draftEnergyOffers, setDraftEnergyOffers] = useState<EnergyOffer[]>(() => cloneEnergyOffers(energyOffers));
  const [draftGasOffers, setDraftGasOffers] = useState<GasOffer[]>(() => cloneGasOffers(gasOffers));
  const [draftGasAcciseSettings, setDraftGasAcciseSettings] = useState<GasAcciseSettings>(() => ({ ...gasAcciseSettings }));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (dirty) return;
    setDraftDispCpRows(cloneDispCpRows(dispCpRows));
    setDraftEnergyOffers(cloneEnergyOffers(energyOffers));
    setDraftGasOffers(cloneGasOffers(gasOffers));
    setDraftGasAcciseSettings({ ...gasAcciseSettings });
  }, [dispCpRows, energyOffers, gasOffers, gasAcciseSettings, dirty]);

  const markDirty = () => setDirty(true);

  const updateDispCp = (index: number, key: keyof DispCpRow, value: string) => {
    setDraftDispCpRows((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, [key]: key === "mese" ? value : n(value) } : row
      )
    );
    markDirty();
  };

  const updateEnergyOffer = (index: number, key: keyof EnergyOffer, value: string) => {
    setDraftEnergyOffers((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, [key]: key === "nome" ? value : n(value) } : row
      )
    );
    markDirty();
  };

  const updateGasOffer = (index: number, key: keyof GasOffer, value: string) => {
    setDraftGasOffers((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, [key]: key === "nome" ? value : n(value) } : row
      )
    );
    markDirty();
  };

  const saveListini = async () => {
    setSaving(true);

    const payload = [
      { key: "dispCpRows", value_json: draftDispCpRows },
      { key: "energyOffers", value_json: draftEnergyOffers },
      { key: "gasOffers", value_json: draftGasOffers },
      { key: "gasAcciseSettings", value_json: draftGasAcciseSettings },
    ];

    const { error } = await supabase.from("app_settings").upsert(payload);
    setSaving(false);

    if (error) {
      console.error("SAVE LISTINI ERROR:", error);
      alert("Errore nel salvataggio dei listini");
      return;
    }

    setDispCpRows(cloneDispCpRows(draftDispCpRows));
    setEnergyOffers(cloneEnergyOffers(draftEnergyOffers));
    setGasOffers(cloneGasOffers(draftGasOffers));
    setGasAcciseSettings({ ...draftGasAcciseSettings });
    setDirty(false);
    alert("Listini salvati online");
  };

  const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: 10,
    borderBottom: "1px solid #e2e8f0",
  };

  const tdStyle: React.CSSProperties = {
    padding: 10,
    borderBottom: "1px solid #f1f5f9",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: 6,
    borderRadius: 6,
    border: "1px solid #cbd5e1",
    boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        {dirty && (
          <span style={{ fontSize: 13, fontWeight: 700, color: "#b45309" }}>
            Modifiche non salvate
          </span>
        )}
        <button
          type="button"
          onClick={saveListini}
          disabled={saving || !dirty}
          style={{
            padding: "10px 18px",
            borderRadius: 8,
            border: "none",
            background: saving || !dirty ? "#cbd5e1" : "#2563eb",
            color: "white",
            fontWeight: 800,
            cursor: saving || !dirty ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Salvataggio..." : "Salva listini"}
        </button>
      </div>

      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Dispacciamento + CP Market Energia</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Mese", "Dispacciam", "CP Market", "Tot"].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {draftDispCpRows.map((row, i) => {
                const tot = n(row.dispacciamento) + n(row.cpMarket);
                return (
                  <tr key={row.mese}>
                    <td style={tdStyle}>{row.mese}</td>
                    <td style={tdStyle}>
                      <input
                        type="number"
                        step="0.000001"
                        style={inputStyle}
                        value={row.dispacciamento}
                        onChange={(e) => updateDispCp(i, "dispacciamento", e.target.value)}
                      />
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="number"
                        step="0.000001"
                        style={inputStyle}
                        value={row.cpMarket}
                        onChange={(e) => updateDispCp(i, "cpMarket", e.target.value)}
                      />
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="number"
                        step="0.000001"
                        style={{ ...inputStyle, background: "#f8fafc" }}
                        value={tot}
                        readOnly
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: 16,
          display: "grid",
          gridTemplateColumns: "repeat(2,minmax(0,1fr))",
          gap: 16,
        }}
      >
        <div>
          <h2 style={{ marginTop: 0 }}>Accise gas</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Accisa agevolata</div>
              <input
                type="number"
                step="0.000001"
                style={{ width: "100%", padding: 8, border: "1px solid #cbd5e1", borderRadius: 8 }}
                value={draftGasAcciseSettings.agevolata}
                onChange={(e) => {
                  setDraftGasAcciseSettings((prev) => ({ ...prev, agevolata: n(e.target.value) }));
                  markDirty();
                }}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Accisa non agevolata</div>
              <input
                type="number"
                step="0.000001"
                style={{ width: "100%", padding: 8, border: "1px solid #cbd5e1", borderRadius: 8 }}
                value={draftGasAcciseSettings.nonAgevolata}
                onChange={(e) => {
                  setDraftGasAcciseSettings((prev) => ({ ...prev, nonAgevolata: n(e.target.value) }));
                  markDirty();
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Offerte Energia</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Nome offerta", "Spread", "Maggiorazione Capacity Market", "Quota fissa"].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {draftEnergyOffers.map((row, i) => (
                <tr key={row.nome + i}>
                  <td style={tdStyle}>
                    <input
                      style={{ ...inputStyle, width: 180 }}
                      value={row.nome}
                      onChange={(e) => updateEnergyOffer(i, "nome", e.target.value)}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      step="0.000001"
                      style={{ ...inputStyle, width: 100 }}
                      value={row.spread}
                      onChange={(e) => updateEnergyOffer(i, "spread", e.target.value)}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      step="0.000001"
                      style={{ ...inputStyle, width: 120 }}
                      value={row.maggiorazioneCapacityMarket}
                      onChange={(e) => updateEnergyOffer(i, "maggiorazioneCapacityMarket", e.target.value)}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      step="0.01"
                      style={{ ...inputStyle, width: 100 }}
                      value={row.canone}
                      onChange={(e) => updateEnergyOffer(i, "canone", e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Offerte Gas</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Nome offerta", "Spread", "Quota variabile", "Quota fissa"].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {draftGasOffers.map((row, i) => (
                <tr key={row.nome + i}>
                  <td style={tdStyle}>
                    <input
                      style={{ ...inputStyle, width: 180 }}
                      value={row.nome}
                      onChange={(e) => updateGasOffer(i, "nome", e.target.value)}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      step="0.000001"
                      style={{ ...inputStyle, width: 100 }}
                      value={row.spread}
                      onChange={(e) => updateGasOffer(i, "spread", e.target.value)}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      step="0.000001"
                      style={{ ...inputStyle, width: 120 }}
                      value={row.quotaVariabile}
                      onChange={(e) => updateGasOffer(i, "quotaVariabile", e.target.value)}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      step="0.01"
                      style={{ ...inputStyle, width: 100 }}
                      value={row.canone}
                      onChange={(e) => updateGasOffer(i, "canone", e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}`;

  source = source.slice(0, listiniStart) + newListini + "\n\n" + source.slice(agentsStart);
  changed = true;
}

if (changed) {
  fs.writeFileSync(filePath, source, "utf8");
  console.log("App.tsx aggiornato: salvataggio manuale Listini + anno PUN/PSV più recente.");
} else {
  console.log("Nessuna modifica necessaria: patch già applicata.");
}
