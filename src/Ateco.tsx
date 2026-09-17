import React, { useEffect, useMemo, useState } from "react";

type AtecoRow = {
  code: string;
  title: string;
};

type AtecoMapRow = {
  oldCode: string;
  oldTitle?: string;
  newCodes: string[];
};

type Status = "yes" | "conditional" | "no";

type TaxCard = {
  status: Status;
  title: string;
  detail: string;
};

const normalizeCode = (value: string) => {
  const cleaned = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/,/g, ".")
    .replace(/[^A-Z0-9.]/g, "");

  if (/^[A-Z]$/.test(cleaned)) return cleaned;
  if (cleaned.includes(".")) return cleaned.replace(/\.+/g, ".").replace(/^\.|\.$/g, "");
  if (!/^\d+$/.test(cleaned)) return cleaned;

  if (cleaned.length <= 2) return cleaned;
  if (cleaned.length === 3) return `${cleaned.slice(0, 2)}.${cleaned.slice(2)}`;
  if (cleaned.length === 4) return `${cleaned.slice(0, 2)}.${cleaned.slice(2)}`;
  if (cleaned.length === 5) return `${cleaned.slice(0, 2)}.${cleaned.slice(2, 4)}.${cleaned.slice(4)}`;
  return `${cleaned.slice(0, 2)}.${cleaned.slice(2, 4)}.${cleaned.slice(4, 6)}`;
};

const getDivision = (code: string) => Number(normalizeCode(code).slice(0, 2));
const starts = (code: string, prefix: string) => normalizeCode(code).startsWith(prefix);

function vatEligibility(code: string, product: "luce" | "gas"): TaxCard {
  const n = normalizeCode(code);
  const division = getDivision(n);

  const extractive = division >= 5 && division <= 9;
  const manufacturing = division >= 10 && division <= 33;
  const agriculture = division === 1 || division === 2;
  const fishing = division === 3;
  const publishing = starts(n, "58.1");

  if (extractive || manufacturing || agriculture || publishing) {
    return {
      status: "yes",
      title: "IVA RIDOTTA 10%",
      detail:
        "Il settore rientra tra imprese estrattive, agricole, manifatturiere oppure editoriali/poligrafiche previste dalla Tabella A. Va comunque verificato che la fornitura sia utilizzata nell'attività agevolata.",
    };
  }

  if (fishing) {
    return {
      status: "conditional",
      title: "DA VERIFICARE",
      detail:
        "La pesca non va equiparata automaticamente alle imprese agricole ai fini dell'IVA energia/gas: serve verifica della specifica posizione e dell'impiego.",
    };
  }

  if (product === "gas" && starts(n, "35.11")) {
    return {
      status: "conditional",
      title: "POSSIBILE IVA 10%",
      detail:
        "Il gas destinato a imprese che lo impiegano per produrre energia elettrica può rientrare nell'aliquota ridotta, ma l'agevolazione dipende dall'impiego effettivo del gas.",
    };
  }

  return {
    status: "no",
    title: "IVA ORDINARIA",
    detail:
      "Dal solo codice ATECO non emerge una delle categorie d'impresa che accedono normalmente all'IVA ridotta per questa fornitura.",
  };
}

function electricityExciseEligibility(code: string): TaxCard {
  const n = normalizeCode(code);

  if (starts(n, "23") || starts(n, "24")) {
    return {
      status: "conditional",
      title: "AGEVOLAZIONE POSSIBILE",
      detail:
        "Per processi mineralogici, metallurgici, elettrolitici o di riduzione chimica l'energia può essere esclusa dall'accisa. L'ATECO segnala il settore, ma va verificato il processo effettivo.",
    };
  }

  if (starts(n, "35.11")) {
    return {
      status: "conditional",
      title: "ESENZIONE POSSIBILE",
      detail:
        "L'energia utilizzata per produrre elettricità o mantenere la capacità di produzione può essere esente. L'esenzione riguarda l'impiego, non tutta l'energia consumata dall'impresa.",
    };
  }

  if (starts(n, "49.1") || starts(n, "49.2") || starts(n, "49.3")) {
    return {
      status: "conditional",
      title: "ESENZIONE POSSIBILE",
      detail:
        "Sono previste esenzioni per specifici impieghi nelle linee ferroviarie e nei trasporti urbani/interurbani. Va verificata la destinazione concreta dell'energia.",
    };
  }

  return {
    status: "no",
    title: "NESSUNA AGEVOLAZIONE AUTOMATICA",
    detail:
      "Le agevolazioni sull'accisa elettrica dipendono soprattutto dall'impiego dell'energia e dal processo produttivo; il solo codice ATECO non attribuisce automaticamente il beneficio.",
  };
}

function gasExciseEligibility(code: string): TaxCard {
  const n = normalizeCode(code);
  const division = getDivision(n);
  const professionalOrDomesticLike =
    (division >= 64 && division <= 66) ||
    division === 69 ||
    division === 70 ||
    division === 71 ||
    division === 72 ||
    division === 74 ||
    division === 75 ||
    division === 85;

  if (professionalOrDomesticLike) {
    return {
      status: "conditional",
      title: "VERIFICA USO DEL GAS",
      detail:
        "Dal 2026 il TUA distingue usi domestici e non domestici. Studi professionali, istituti di credito, istruzione e alcuni uffici possono rientrare negli usi domestici: il codice ATECO da solo non basta.",
    };
  }

  return {
    status: "conditional",
    title: "POSSIBILE USO NON DOMESTICO",
    detail:
      "Dal 2026 l'accisa gas dipende dall'uso e dai locali. Le attività produttive possono rientrare negli usi non domestici, ma la qualificazione dipende dall'uso effettivo e dai locali serviti, non dal solo codice ATECO.",
  };
}

function StatusBox({ label, card, color }: { label: string; card: TaxCard; color: "orange" | "blue" }) {
  const active = card.status === "yes" || card.status === "conditional";
  const background = !active
    ? "#f8fafc"
    : color === "orange"
      ? card.status === "yes"
        ? "#ffedd5"
        : "#fff7ed"
      : card.status === "yes"
        ? "#dbeafe"
        : "#eff6ff";
  const border = !active ? "#cbd5e1" : color === "orange" ? "#fb923c" : "#60a5fa";
  const accent = !active ? "#64748b" : color === "orange" ? "#c2410c" : "#1d4ed8";
  const answer = card.status === "no" ? "NO" : "SI";

  return (
    <div
      style={{
        border: `2px solid ${border}`,
        background,
        borderRadius: 14,
        padding: 16,
        minHeight: 148,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: accent, letterSpacing: 0.4, marginBottom: 8 }}>
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 10,
        }}
      >
        <div style={{ fontWeight: 900, color: "#0f172a" }}>ESITO</div>
        <div
          style={{
            minWidth: 54,
            textAlign: "center",
            padding: "6px 12px",
            borderRadius: 999,
            fontWeight: 900,
            fontSize: 14,
            border: `2px solid ${border}`,
            color: accent,
            background: "#ffffff",
          }}
        >
          {answer}
        </div>
      </div>
      <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>{card.title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.45, color: "#475569" }}>{card.detail}</div>
    </div>
  );
}

export default function Ateco() {
  const [rows, setRows] = useState<AtecoRow[]>([]);
  const [mapping, setMapping] = useState<AtecoMapRow[]>([]);
  const [input, setInput] = useState("");
  const [searchedCode, setSearchedCode] = useState("");
  const [selectedCode, setSelectedCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/data/ateco2025.json").then((r) => {
        if (!r.ok) throw new Error("Archivio ATECO 2025 non disponibile");
        return r.json();
      }),
      fetch("/data/ateco-map-2022-2025.json").then((r) => {
        if (!r.ok) throw new Error("Tavola di raccordo ATECO non disponibile");
        return r.json();
      }),
    ])
      .then(([atecoRows, mapRows]) => {
        if (cancelled) return;
        setRows(Array.isArray(atecoRows) ? atecoRows : []);
        setMapping(Array.isArray(mapRows) ? mapRows : []);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message || String(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const byCode = useMemo(() => {
    const m = new Map<string, AtecoRow>();
    rows.forEach((row) => m.set(normalizeCode(row.code), row));
    return m;
  }, [rows]);

  const oldMap = useMemo(() => {
    const m = new Map<string, AtecoMapRow>();
    mapping.forEach((row) => m.set(normalizeCode(row.oldCode), row));
    return m;
  }, [mapping]);

  const searchedOld = searchedCode ? oldMap.get(searchedCode) : undefined;
  const newCodes = searchedOld?.newCodes?.map(normalizeCode).filter(Boolean) || [];
  const changedCodes = newCodes.filter((code) => code !== searchedCode);
  const currentRow = selectedCode ? byCode.get(selectedCode) : undefined;

  const doSearch = () => {
    const normalized = normalizeCode(input);
    setSearchedCode(normalized);

    const mapRow = oldMap.get(normalized);
    const alternatives = mapRow?.newCodes?.map(normalizeCode).filter(Boolean) || [];
    const changed = alternatives.filter((code) => code !== normalized);

    if (changed.length === 1) {
      setSelectedCode(changed[0]);
    } else if (changed.length > 1) {
      setSelectedCode("");
    } else if (byCode.has(normalized)) {
      setSelectedCode(normalized);
    } else if (alternatives.length === 1) {
      setSelectedCode(alternatives[0]);
    } else {
      setSelectedCode("");
    }
  };

  const luceIva = selectedCode ? vatEligibility(selectedCode, "luce") : null;
  const gasIva = selectedCode ? vatEligibility(selectedCode, "gas") : null;
  const luceAccise = selectedCode ? electricityExciseEligibility(selectedCode) : null;
  const gasAccise = selectedCode ? gasExciseEligibility(selectedCode) : null;

  return (
    <div
      style={{
        background: "white",
        padding: 24,
        borderRadius: 16,
        border: "1px solid #e2e8f0",
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
      }}
    >
      <h2 style={{ marginTop: 0, marginBottom: 6 }}>Ricerca ATECO e agevolazioni fiscali</h2>
      <div style={{ color: "#64748b", marginBottom: 20 }}>
        Inserisci un codice ATECO 2025 oppure un codice ATECO 2022 precedente.
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") doSearch();
          }}
          placeholder="Es. 10.71.20 oppure 107120"
          style={{
            minWidth: 280,
            maxWidth: 420,
            flex: "1 1 280px",
            padding: "12px 14px",
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            fontSize: 16,
          }}
        />
        <button
          type="button"
          onClick={doSearch}
          disabled={loading || !input.trim()}
          style={{
            padding: "12px 18px",
            border: "none",
            borderRadius: 10,
            background: "#0f172a",
            color: "white",
            fontWeight: 800,
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading ? "Caricamento..." : "Cerca"}
        </button>
      </div>

      {error && (
        <div style={{ padding: 12, borderRadius: 10, background: "#fef2f2", color: "#b91c1c", marginBottom: 16 }}>
          {error}
        </div>
      )}

      {searchedCode && !selectedCode && !changedCodes.length && !byCode.has(searchedCode) && (
        <div style={{ padding: 14, borderRadius: 12, background: "#f8fafc", border: "1px solid #cbd5e1" }}>
          Codice <b>{searchedCode}</b> non trovato nell'archivio ATECO 2025 né nella tavola di raccordo ATECO 2022 → 2025.
        </div>
      )}

      {changedCodes.length > 0 && (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            background: "#fff7ed",
            border: "2px solid #fb923c",
            marginBottom: 18,
          }}
        >
          <div style={{ fontWeight: 900, color: "#9a3412", marginBottom: 6 }}>
            ⚠ CODICE ATECO PRECEDENTE / RICLASSIFICATO
          </div>
          <div style={{ color: "#7c2d12", marginBottom: 10 }}>
            Il codice <b>{searchedCode}</b>{searchedOld?.oldTitle ? ` – ${searchedOld.oldTitle}` : ""} è collegato nella tavola ISTAT aggiornata ai seguenti codici ATECO 2025:
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {changedCodes.map((code) => {
              const row = byCode.get(code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setSelectedCode(code)}
                  style={{
                    border: selectedCode === code ? "2px solid #9a3412" : "1px solid #fdba74",
                    borderRadius: 10,
                    background: selectedCode === code ? "#ffedd5" : "white",
                    padding: "9px 12px",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <b>{code}</b>{row?.title ? ` – ${row.title}` : ""}
                </button>
              );
            })}
          </div>
          {changedCodes.length > 1 && !selectedCode && (
            <div style={{ marginTop: 10, fontSize: 13, color: "#9a3412" }}>
              Il vecchio codice corrisponde a più attività: scegli il nuovo codice che descrive quella effettivamente svolta per calcolare le agevolazioni.
            </div>
          )}
        </div>
      )}

      {selectedCode && currentRow && (
        <>
          <div
            style={{
              padding: 18,
              borderRadius: 14,
              border: "1px solid #cbd5e1",
              background: "#f8fafc",
              marginBottom: 18,
            }}
          >
            <div style={{ fontSize: 13, color: "#64748b", fontWeight: 700, marginBottom: 4 }}>ATECO 2025</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: "#0f172a", marginBottom: 6 }}>{selectedCode}</div>
            <div style={{ fontSize: 17, color: "#334155" }}>{currentRow.title}</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            {luceAccise && <StatusBox label="LUCE - ACCISE AGEVOLATE" card={luceAccise} color="orange" />}
            {luceIva && <StatusBox label="LUCE - IVA AGEVOLATA" card={luceIva} color="blue" />}
            {gasAccise && <StatusBox label="GAS - ACCISE AGEVOLATE" card={gasAccise} color="orange" />}
            {gasIva && <StatusBox label="GAS - IVA AGEVOLATA" card={gasIva} color="blue" />}
          </div>

          <div
            style={{
              marginTop: 18,
              padding: 14,
              borderRadius: 12,
              background: "#fffbeb",
              border: "1px solid #fde68a",
              color: "#713f12",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            <b>Nota importante:</b> l'ATECO consente di individuare alcune categorie IVA con buona affidabilità, ma per le accise il diritto dipende spesso dall'uso effettivo dell'energia o del gas, dal processo produttivo, dal sito e dai consumi. Per questo i casi non determinabili dal solo codice vengono indicati come “da verificare” anziché come diritto automatico.
          </div>
        </>
      )}

      <div style={{ marginTop: 18, fontSize: 12, color: "#64748b" }}>
        Fonte classificazione: ISTAT ATECO 2025. Raccordi ATECO 2022 → 2025 aggiornati al 2026. Regole fiscali impostate sulla normativa vigente nel 2026.
      </div>
    </div>
  );
}
