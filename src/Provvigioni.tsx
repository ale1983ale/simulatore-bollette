import React, { useMemo, useState } from "react";

type OfferType = "STANDARD" | "UNICA" | "SPECIAL";
type CommodityType = "Energia" | "Gas";

type CommissionTier = {
  label: string;
  min: number;
  max: number;
  gettone: number;
  premioRid: number;
  ricorrente: number;
  gettoneUnica: number;
  gettoneSpecial: number;
  ricorrenteUnicaSpecial: number;
};

const ENERGY_TIERS: CommissionTier[] = [
  { label: "Da 0 a 3.000 kWh/anno", min: 0, max: 3000, gettone: 30, premioRid: 5, ricorrente: 2.5, gettoneUnica: 21, gettoneSpecial: 15, ricorrenteUnicaSpecial: 1.5 },
  { label: "Da 3.001 a 5.000", min: 3001, max: 5000, gettone: 40, premioRid: 5, ricorrente: 2.5, gettoneUnica: 28, gettoneSpecial: 20, ricorrenteUnicaSpecial: 1.5 },
  { label: "Da 5.001 a 10.000", min: 5001, max: 10000, gettone: 65, premioRid: 10, ricorrente: 4, gettoneUnica: 45.5, gettoneSpecial: 32.5, ricorrenteUnicaSpecial: 2.5 },
  { label: "Da 10.001 a 15.000", min: 10001, max: 15000, gettone: 100, premioRid: 15, ricorrente: 4, gettoneUnica: 70, gettoneSpecial: 50, ricorrenteUnicaSpecial: 2.5 },
  { label: "Da 15.001 a 20.000", min: 15001, max: 20000, gettone: 130, premioRid: 15, ricorrente: 4, gettoneUnica: 91, gettoneSpecial: 65, ricorrenteUnicaSpecial: 2.5 },
  { label: "Da 20.001 a 50.000", min: 20001, max: 50000, gettone: 175, premioRid: 20, ricorrente: 5.5, gettoneUnica: 122.5, gettoneSpecial: 87.5, ricorrenteUnicaSpecial: 3.5 },
  { label: "Da 50.001 a 80.000", min: 50001, max: 80000, gettone: 220, premioRid: 25, ricorrente: 5.5, gettoneUnica: 154, gettoneSpecial: 110, ricorrenteUnicaSpecial: 3.5 },
  { label: "Da 80.001 a 150.000", min: 80001, max: 150000, gettone: 270, premioRid: 25, ricorrente: 7, gettoneUnica: 189, gettoneSpecial: 135, ricorrenteUnicaSpecial: 5 },
  { label: "Da 150.001 a 200.000", min: 150001, max: 200000, gettone: 330, premioRid: 25, ricorrente: 7, gettoneUnica: 231, gettoneSpecial: 165, ricorrenteUnicaSpecial: 6 },
  { label: "Da 200.001 a 350.000", min: 200001, max: 350000, gettone: 420, premioRid: 25, ricorrente: 8.5, gettoneUnica: 294, gettoneSpecial: 210, ricorrenteUnicaSpecial: 6 },
  { label: "Da 350.001 a 550.000", min: 350001, max: 550000, gettone: 580, premioRid: 35, ricorrente: 10, gettoneUnica: 406, gettoneSpecial: 290, ricorrenteUnicaSpecial: 7 },
  { label: "Da 550.001 a 900.000", min: 550001, max: 900000, gettone: 800, premioRid: 35, ricorrente: 15, gettoneUnica: 560, gettoneSpecial: 400, ricorrenteUnicaSpecial: 10 },
  { label: "Da 990.001 a 1.400.000", min: 990001, max: 1400000, gettone: 1200, premioRid: 50, ricorrente: 15, gettoneUnica: 840, gettoneSpecial: 600, ricorrenteUnicaSpecial: 10 },
  { label: "Da 1.400.001 a 2.000.000", min: 1400001, max: 2000000, gettone: 2000, premioRid: 50, ricorrente: 15, gettoneUnica: 1400, gettoneSpecial: 1000, ricorrenteUnicaSpecial: 10 },
];

const GAS_TIERS: CommissionTier[] = [
  { label: "Fino a 2.000 Smc/anno", min: 0, max: 2000, gettone: 60, premioRid: 10, ricorrente: 3.5, gettoneUnica: 35, gettoneSpecial: 35, ricorrenteUnicaSpecial: 1.5 },
  { label: "Da 2.001 a 5.000", min: 2001, max: 5000, gettone: 60, premioRid: 10, ricorrente: 5, gettoneUnica: 35, gettoneSpecial: 35, ricorrenteUnicaSpecial: 2.5 },
  { label: "Da 5.001 a 15.000", min: 5001, max: 15000, gettone: 95, premioRid: 20, ricorrente: 6, gettoneUnica: 50, gettoneSpecial: 50, ricorrenteUnicaSpecial: 3 },
  { label: "Da 15.001 a 50.000", min: 15001, max: 50000, gettone: 140, premioRid: 35, ricorrente: 8, gettoneUnica: 75, gettoneSpecial: 75, ricorrenteUnicaSpecial: 4 },
  { label: "Da 50.001 a 80.000", min: 50001, max: 80000, gettone: 220, premioRid: 40, ricorrente: 10, gettoneUnica: 100, gettoneSpecial: 100, ricorrenteUnicaSpecial: 7 },
  { label: "Oltre 80.001", min: 80001, max: Number.POSITIVE_INFINITY, gettone: 300, premioRid: 40, ricorrente: 10, gettoneUnica: 150, gettoneSpecial: 150, ricorrenteUnicaSpecial: 10 },
];

const formatMoney = (value: number) => {
  const safeValue = Number.isFinite(value) ? value : 0;
  const needsDecimals = !Number.isInteger(safeValue);

  return `€${safeValue.toLocaleString("it-IT", {
    minimumFractionDigits: needsDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
};

const getTierForConsumption = (commodity: CommodityType, annualConsumption: number) => {
  const tiers = commodity === "Energia" ? ENERGY_TIERS : GAS_TIERS;

  if (commodity === "Energia" && annualConsumption >= 900001 && annualConsumption <= 990000) {
    return { tier: null, missing: true };
  }

  const tier = tiers.find((item) => {
    if (item.max === Number.POSITIVE_INFINITY) return annualConsumption >= item.min;
    return annualConsumption >= item.min && annualConsumption <= item.max;
  });

  return { tier: tier ?? null, missing: false };
};

const monthlyEnergyMaintenance = [
  {
    title: "Clienti con consumi INFERIORI a 41.000 kWh/mese",
    values: { STANDARD: 2.49, UNICA: 1.74, SPECIAL: 1.24 },
  },
  {
    title: "Clienti con consumi SUPERIORI a 41.000 kWh/mese",
    values: { STANDARD: 2.21, UNICA: 1.46, SPECIAL: 0.96 },
  },
];

const gasMaintenance = {
  STANDARD: 0.01,
  UNICA: 0.0075,
  SPECIAL: 0.0075,
};

const gasPortfolioBonus = [
  { range: "70.000–120.000 Smc", value: 200 },
  { range: "120.001–170.000", value: 400 },
  { range: "170.001–230.000", value: 600 },
  { range: "230.001–280.000", value: 850 },
  { range: "280.001–330.000", value: 1100 },
  { range: "oltre 330.001", value: 1400 },
];

const energyPortfolioBonus = [
  { range: "2–3 GWh", value: 400 },
  { range: "3–4 GWh", value: 800 },
  { range: "4–5 GWh", value: 1200 },
  { range: "5–6 GWh", value: 1600 },
  { range: "6–7 GWh", value: 2000 },
  { range: "7–8 GWh", value: 2400 },
  { range: "8–9 GWh", value: 2800 },
  { range: "9–10 GWh", value: 3200 },
  { range: "oltre 10 GWh", value: 3600 },
];

const energyPortfolioThresholds = [
  { threshold: 2000000, value: 400 },
  { threshold: 3000000, value: 800 },
  { threshold: 4000000, value: 1200 },
  { threshold: 5000000, value: 1600 },
  { threshold: 6000000, value: 2000 },
  { threshold: 7000000, value: 2400 },
  { threshold: 8000000, value: 2800 },
  { threshold: 9000000, value: 3200 },
  { threshold: 10000000, value: 3600 },
];

const gasPortfolioThresholds = [
  { threshold: 70000, value: 200 },
  { threshold: 120001, value: 400 },
  { threshold: 170001, value: 600 },
  { threshold: 230001, value: 850 },
  { threshold: 280001, value: 1100 },
  { threshold: 330001, value: 1400 },
];

const productionLights = [
  { amount: 200, text: "4 BUS con almeno 40.000 kWh/anno\noppure\n2 BUS con almeno 100.000 kWh/anno" },
  { amount: 450, text: "8 BUS con almeno 70.000 kWh/anno\noppure\n5 BUS con almeno 200.000 kWh/anno" },
  { amount: 750, text: "10 BUS con almeno 100.000 kWh/anno\noppure\n6 BUS con almeno 300.000 kWh/anno" },
  { amount: 1100, text: "15 BUS con almeno 150.000 kWh/anno\noppure\n8 BUS con almeno 400.000 kWh/anno" },
  { amount: 1500, text: "20 BUS con almeno 200.000 kWh/anno\noppure\n10 BUS con almeno 500.000 kWh/anno" },
];

export default function Provvigioni() {
  const [commodity, setCommodity] = useState<CommodityType>("Energia");
  const [annualConsumption, setAnnualConsumption] = useState<number | string>(0);
  const [offer, setOffer] = useState<OfferType>("STANDARD");
  const [manualTierSelection, setManualTierSelection] = useState<{ commodity: CommodityType; tier: CommissionTier } | null>(null);
  const [bonusFissoLuce, setBonusFissoLuce] = useState(false);
  const [longSimulationOpen, setLongSimulationOpen] = useState(false);
  const [longMonths, setLongMonths] = useState(1);
  const [includePortfolioBonus, setIncludePortfolioBonus] = useState(false);

  const consumptionValue = annualConsumption === "" ? null : Number(annualConsumption);
  const safeConsumption = consumptionValue !== null && Number.isFinite(consumptionValue) ? consumptionValue : 0;
  const hasRealConsumption = consumptionValue !== null && Number.isFinite(consumptionValue) && consumptionValue > 0;
  const hasManualTierSelection = manualTierSelection?.commodity === commodity;

  const tierInfo = useMemo(() => {
    if (consumptionValue === null || !Number.isFinite(consumptionValue) || consumptionValue <= 0) {
      return { tier: null, missing: false };
    }
    return getTierForConsumption(commodity, safeConsumption);
  }, [commodity, consumptionValue, safeConsumption]);

  const activeTierInfo = manualTierSelection?.commodity === commodity
    ? { tier: manualTierSelection.tier, missing: false }
    : tierInfo;

  const result = useMemo(() => {
    if ((!hasRealConsumption && !hasManualTierSelection) || !Number.isFinite(consumptionValue ?? 0)) {
      return {
        fascia: "Inserisci un consumo annuo",
        gettone: null,
        premioRid: null,
        ricorrente: null,
        gettoneLabel: offer === "UNICA" ? "Gettone Unica" : offer === "SPECIAL" ? "Gettone Special" : "Gettone",
        recurringLabel: offer === "UNICA" || offer === "SPECIAL" ? "Ricorrente Unica/Special" : "Ricorrente mensile",
      };
    }

    if (commodity === "Energia") {
      if (activeTierInfo.missing) {
        return {
          fascia: "Fascia non presente nella tabella provvigionale originale",
          gettone: null,
          premioRid: null,
          ricorrente: null,
          gettoneLabel: "Gettone",
          recurringLabel: "Ricorrente mensile",
        };
      }

      const tier = activeTierInfo.tier as CommissionTier;
      const gettoneValue =
        offer === "STANDARD"
          ? tier.gettone
          : offer === "UNICA"
            ? tier.gettoneUnica
            : tier.gettoneSpecial;

      const recurringValue =
        offer === "STANDARD" ? tier.ricorrente : tier.ricorrenteUnicaSpecial;

      return {
        fascia: tier.label,
        gettone: gettoneValue,
        premioRid: tier.premioRid,
        ricorrente: recurringValue,
        gettoneLabel: offer === "UNICA" ? "Gettone Unica" : offer === "SPECIAL" ? "Gettone Special" : "Gettone",
        recurringLabel: offer === "UNICA" || offer === "SPECIAL" ? "Ricorrente Unica/Special" : "Ricorrente mensile",
      };
    }

    if (activeTierInfo.missing) {
      return {
        fascia: "Fascia non presente nella tabella provvigionale originale",
        gettone: null,
        premioRid: null,
        ricorrente: null,
        gettoneLabel: "Gettone",
        recurringLabel: "Ricorrente mensile",
      };
    }

    const tier = activeTierInfo.tier as CommissionTier;
    const gettoneValue =
      offer === "STANDARD"
        ? tier.gettone
        : offer === "UNICA"
          ? tier.gettoneUnica
          : tier.gettoneSpecial;

    const recurringValue =
      offer === "STANDARD" ? tier.ricorrente : tier.ricorrenteUnicaSpecial;

    return {
      fascia: tier.label,
      gettone: gettoneValue,
      premioRid: tier.premioRid,
      ricorrente: recurringValue,
      gettoneLabel: offer === "UNICA" ? "Gettone Unica" : offer === "SPECIAL" ? "Gettone Special" : "Gettone",
      recurringLabel: offer === "UNICA" || offer === "SPECIAL" ? "Ricorrente Unica/Special" : "Ricorrente mensile",
    };
  }, [commodity, offer, activeTierInfo, consumptionValue]);

  const bonusFissoLuceCard =
    commodity === "Energia" && bonusFissoLuce && hasRealConsumption && safeConsumption <= 10000
      ? {
          title: "BONUS PREZZO FISSO LUCE",
          gettone: 100,
          premioRid: 5,
          ricorrente: 2.5,
        }
      : null;

  const tableRows = commodity === "Energia" ? ENERGY_TIERS : GAS_TIERS;
  const [selectedTableRow, setSelectedTableRow] = useState<{ table: string; row: string } | null>(null);

  const toggleTableRow = (table: string, row: string) => {
    setSelectedTableRow((current) => current?.table === table && current.row === row ? null : { table, row });
  };

  const selectCommissionTier = (selectedCommodity: CommodityType, tier: CommissionTier, selectedOffer?: OfferType) => {
    setCommodity(selectedCommodity);
    setManualTierSelection({ commodity: selectedCommodity, tier });
    if (selectedOffer) setOffer(selectedOffer);
  };

  const longSimulation = useMemo(() => {
    const months = longMonths;
    const gettone = result.gettone ?? 0;
    const premioRid = result.premioRid ?? 0;
    const ricorrente = result.ricorrente ?? 0;
    const monthlyConsumption = safeConsumption / 12;
    const maintenanceRate = commodity === "Energia"
      ? monthlyEnergyMaintenance[monthlyConsumption <= 41000 ? 0 : 1].values[offer]
      : gasMaintenance[offer];
    const maintenance = commodity === "Energia"
      ? (monthlyConsumption / 1000) * maintenanceRate * months
      : monthlyConsumption * maintenanceRate * months;
    const portfolioThresholds = commodity === "Energia" ? energyPortfolioThresholds : gasPortfolioThresholds;
    const firstThreshold = portfolioThresholds[0].threshold;
    const portfolioTier = [...portfolioThresholds].reverse().find((item) => safeConsumption >= item.threshold);
    const portfolioPerSemester = portfolioTier
      ? portfolioTier.value
      : (safeConsumption / firstThreshold) * portfolioThresholds[0].value;
    const bonusGettone = bonusFissoLuceCard ? Math.max(0, 100 - gettone) : 0;
    const portfolioTotal = includePortfolioBonus ? portfolioPerSemester * Math.floor(months / 6) : 0;

    return {
      months,
      gettone,
      bonusGettone,
      initialGettone: gettone + bonusGettone,
      premioRid,
      ricorrente,
      monthlyConsumption,
      maintenanceRate,
      maintenance,
      portfolioPerSemester,
      semesters: Math.floor(months / 6),
      thirteenthMonth: months >= 13 ? gettone * 0.25 : 0,
      portfolioTotal,
    };
  }, [commodity, offer, result, safeConsumption, longMonths, bonusFissoLuceCard, includePortfolioBonus]);

  return (
    <>
      <style>{`
        .provv-shell {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 18px;
          min-width: 0;
        }
        .provv-panel {
          width: 100%;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          padding: 20px;
          box-shadow: 0 4px 14px rgba(15, 23, 42, 0.04);
        }
        .provv-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
          align-items: end;
        }
        .provv-field {
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 0;
        }
        .provv-label {
          font-size: 13px;
          font-weight: 700;
          color: #334155;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .provv-input,
        .provv-select {
          width: 100%;
          min-height: 42px;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          background: #fff;
          padding: 10px 12px;
          color: #0f172a;
          font-size: 15px;
          box-sizing: border-box;
        }
        .provv-checkbox {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 42px;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          background: #f8fafc;
          padding: 10px 12px;
        }
        .provv-checkbox input {
          width: 18px;
          height: 18px;
        }
        .provv-commodity-switch {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        .provv-commodity-button {
          min-height: 48px;
          border: 2px solid transparent;
          border-radius: 10px;
          color: white;
          cursor: pointer;
          font-size: 14px;
          font-weight: 900;
          letter-spacing: 0.04em;
          opacity: 0.62;
          transition: opacity 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
        }
        .provv-commodity-button:hover,
        .provv-commodity-button--active {
          opacity: 1;
          transform: translateY(-1px);
        }
        .provv-commodity-button--active {
          box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.12);
        }
        .provv-commodity-button--energy {
          background: #f97316;
        }
        .provv-commodity-button--gas {
          background: #2563eb;
        }
        .provv-results {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }
        .provv-card {
          background: linear-gradient(180deg, #fff 0%, #f8fafc 100%);
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 16px;
          min-height: 124px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .provv-card--highlight {
          border-color: rgba(245, 158, 11, 0.35);
          box-shadow: inset 0 0 0 1px rgba(245, 158, 11, 0.18);
        }
        .provv-card--signature {
          background: linear-gradient(180deg, #fff7ed 0%, #ffedd5 100%);
          border: 2px solid #f97316;
          box-shadow: 0 5px 16px rgba(234, 88, 12, 0.14);
        }
        .provv-card--signature-gas {
          background: linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%);
          border-color: #2563eb;
          box-shadow: 0 5px 16px rgba(37, 99, 235, 0.14);
        }
        .provv-card__label {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #64748b;
          margin-bottom: 8px;
        }
        .provv-card__value {
          font-size: clamp(1.45rem, 2vw, 2.1rem);
          font-weight: 800;
          color: #0f172a;
        }
        .provv-bonus-values {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-top: 12px;
        }
        .provv-bonus-value {
          padding: 12px;
          border-radius: 10px;
          background: rgba(245, 158, 11, 0.1);
        }
        .provv-bonus-value strong {
          display: block;
          margin-top: 4px;
          font-size: clamp(1.3rem, 2vw, 2rem);
          color: #0f172a;
        }
        .provv-long-toggle {
          width: 100%;
          border: 0;
          border-radius: 14px;
          padding: 18px 20px;
          background: ${commodity === "Energia" ? "#fff7ed" : "#eff6ff"};
          color: ${commodity === "Energia" ? "#9a3412" : "#1d4ed8"};
          font-size: 1.05rem;
          font-weight: 900;
          letter-spacing: 0.04em;
          text-align: left;
          cursor: pointer;
        }
        .provv-semester-toggle {
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          padding: 10px 12px;
          background: #f8fafc;
          color: #334155;
          font-size: 12px;
          font-weight: 800;
          text-align: left;
          cursor: pointer;
        }
        .provv-semester-toggle--active {
          border-color: #2563eb;
          background: #dbeafe;
          color: #1d4ed8;
        }
        .provv-long-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin-top: 16px;
        }
        .provv-long-item {
          padding: 14px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          background: #f8fafc;
        }
        .provv-long-item__label {
          color: #475569;
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
        }
        .provv-long-item__value {
          margin-top: 5px;
          color: #0f172a;
          font-size: 1.2rem;
          font-weight: 900;
        }
        .provv-long-item__detail {
          margin-top: 5px;
          color: #64748b;
          font-size: 12px;
          line-height: 1.45;
        }
        .provv-long-total {
          margin-top: 16px;
          padding: 20px;
          border-radius: 14px;
          background: ${commodity === "Energia" ? "#f97316" : "#2563eb"};
          color: white;
        }
        .provv-long-total strong {
          display: block;
          margin-top: 5px;
          font-size: clamp(1.8rem, 4vw, 3rem);
        }
        .provv-col-standard {
          background: #ffedd5 !important;
        }
        .provv-col-unica {
          background: #fef9c3 !important;
        }
        .provv-col-special {
          background: #fee2e2 !important;
        }
        .provv-col-standard--gas {
          background: #dbeafe !important;
        }
        .provv-col-unica--gas {
          background: #bfdbfe !important;
        }
        .provv-col-special--gas {
          background: #93c5fd !important;
        }
        .provv-section {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          padding: 18px;
        }
        .provv-section h3 {
          margin: 0 0 14px 0;
          font-size: 1.15rem;
          color: #0f172a;
        }
        .provv-table-wrap {
          width: 100%;
          overflow-x: auto;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
        }
        .provv-table {
          width: 100%;
          min-width: 760px;
          border-collapse: collapse;
          background: #fff;
        }
        .provv-table th,
        .provv-table td {
          border-bottom: 1px solid #e2e8f0;
          padding: 10px 12px;
          text-align: left;
          vertical-align: middle;
          font-size: 14px;
        }
        .provv-table th {
          background: #f8fafc;
          color: #0f172a;
          font-weight: 800;
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .provv-table tbody tr:nth-child(even) {
          background: rgba(248, 250, 252, 0.6);
        }
        .provv-table tbody tr.provv-row-selected--energia {
          background: #fff7ed;
          box-shadow: inset 4px 0 0 #f97316;
        }
        .provv-table tbody tr.provv-row-selected--gas {
          background: #eff6ff;
          box-shadow: inset 4px 0 0 #2563eb;
        }
        .provv-table tbody tr.provv-row-selected--energia > td,
        .provv-table tbody tr.provv-row-selected--gas > td {
          border-top: 1px solid #f97316;
          border-bottom: 1px solid #f97316;
        }
        .provv-table tbody tr.provv-row-selected--gas > td {
          border-top-color: #2563eb;
          border-bottom-color: #2563eb;
        }
        .provv-table tbody tr.provv-row-selected--energia > td:first-child,
        .provv-table tbody tr.provv-row-selected--gas > td:first-child {
          border-left: 1px solid #f97316;
        }
        .provv-table tbody tr.provv-row-selected--energia > td:last-child,
        .provv-table tbody tr.provv-row-selected--gas > td:last-child {
          border-right: 1px solid #f97316;
        }
        .provv-table tbody tr.provv-row-selected--gas > td:first-child {
          border-left-color: #2563eb;
        }
        .provv-table tbody tr.provv-row-selected--gas > td:last-child {
          border-right-color: #2563eb;
        }
        .provv-table tbody tr.provv-manual-row-selected > td {
          border-top: 1px solid #64748b;
          border-bottom: 1px solid #64748b;
        }
        .provv-table tbody tr.provv-manual-row-selected > td:first-child {
          border-left: 1px solid #64748b;
        }
        .provv-table tbody tr.provv-manual-row-selected > td:last-child {
          border-right: 1px solid #64748b;
        }
        .provv-table tbody tr.provv-row-selected--energia,
        .provv-table tbody tr.provv-row-selected--gas,
        .provv-table tbody tr.provv-manual-row-selected {
          cursor: pointer;
        }
        .provv-badge {
          display: inline-block;
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(14, 165, 233, 0.12);
          color: #0f172a;
          font-weight: 700;
          font-size: 12px;
        }
        .provv-note {
          padding: 10px 12px;
          border-radius: 10px;
          background: #fef3c7;
          border: 1px solid #facc15;
          color: #78350f;
          font-size: 13px;
          line-height: 1.5;
        }
        .provv-production-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 12px;
        }
        .provv-production-card {
          background: linear-gradient(180deg, #fff 0%, #f8fafc 100%);
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          min-height: 170px;
        }
        .provv-production-card__amount {
          font-size: clamp(1.1rem, 2vw, 1.8rem);
          font-weight: 900;
          color: #0f172a;
          margin-bottom: 10px;
        }
        .provv-production-card__text {
          color: #334155;
          font-size: 14px;
          line-height: 1.55;
          white-space: pre-line;
        }
        @media (max-width: 900px) {
          .provv-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .provv-results {
            grid-template-columns: 1fr;
          }
          .provv-production-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 640px) {
          .provv-panel,
          .provv-section {
            padding: 14px;
          }
          .provv-grid,
          .provv-production-grid,
          .provv-long-grid,
          .provv-bonus-values {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="provv-shell">
        <div className="provv-panel">
          <div className="provv-grid">
            <div className="provv-field">
              <label className="provv-label">Energia / Gas</label>
              <div className="provv-commodity-switch">
                <button
                  type="button"
                  className={`provv-commodity-button provv-commodity-button--energy${commodity === "Energia" ? " provv-commodity-button--active" : ""}`}
                  onClick={() => { setCommodity("Energia"); setManualTierSelection(null); setSelectedTableRow(null); }}
                >
                  ⚡ ENERGIA
                </button>
                <button
                  type="button"
                  className={`provv-commodity-button provv-commodity-button--gas${commodity === "Gas" ? " provv-commodity-button--active" : ""}`}
                  onClick={() => { setCommodity("Gas"); setManualTierSelection(null); setSelectedTableRow(null); }}
                >
                  🔥 GAS
                </button>
              </div>
            </div>

            <div className="provv-field">
              <label className="provv-label">Consumo annuo</label>
              <input
                className="provv-input"
                type="number"
                min={0}
                step={1}
                value={annualConsumption}
                onChange={(event) => { setAnnualConsumption(event.target.value); setManualTierSelection(null); }}
              />
            </div>

            <div className="provv-field">
              <label className="provv-label">Offerta</label>
              <select
                className="provv-select"
                value={offer}
                onChange={(event) => setOffer(event.target.value as OfferType)}
              >
                <option value="STANDARD">STANDARD</option>
                <option value="UNICA">UNICA</option>
                <option value="SPECIAL">SPECIAL</option>
              </select>
            </div>

            {commodity === "Energia" && (
              <div className="provv-field">
                <label className="provv-label" style={{ opacity: 0 }}>Bonus</label>
                <label className="provv-checkbox" htmlFor="bonus-fisso-luce">
                  <input
                    id="bonus-fisso-luce"
                    type="checkbox"
                    checked={bonusFissoLuce}
                    onChange={(event) => setBonusFissoLuce(event.target.checked)}
                  />
                  <span>Bonus prezzo fisso luce</span>
                </label>
              </div>
            )}
          </div>
        </div>

        <div className="provv-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div className="provv-badge">{commodity} · {offer}</div>
            <div style={{ fontWeight: 700, color: "#334155" }}>Fascia: {result.fascia}</div>
          </div>

          <div className="provv-results">
            <div className="provv-card provv-card--highlight">
              <div className="provv-card__label">{result.gettoneLabel}</div>
              <div className="provv-card__value">{result.gettone !== null ? formatMoney(result.gettone) : "-"}</div>
            </div>
            <div className="provv-card">
              <div className="provv-card__label">Premio RID</div>
              <div className="provv-card__value">{result.premioRid !== null ? formatMoney(result.premioRid) : "-"}</div>
            </div>
            <div className={`provv-card provv-card--signature${commodity === "Gas" ? " provv-card--signature-gas" : ""}`}>
              <div className="provv-card__label">Gettone alla firma</div>
              <div className="provv-card__value">
                {result.gettone !== null && result.premioRid !== null ? formatMoney(result.gettone + result.premioRid) : "-"}
              </div>
              <div style={{ marginTop: 6, color: commodity === "Gas" ? "#1d4ed8" : "#9a3412", fontSize: 12, fontWeight: 700 }}>Gettone + Premio RID</div>
            </div>
            <div className="provv-card">
              <div className="provv-card__label">{result.recurringLabel}</div>
              <div className="provv-card__value">{result.ricorrente !== null ? formatMoney(result.ricorrente) : "-"}</div>
            </div>
          </div>

          {bonusFissoLuceCard && (
            <div style={{ marginTop: 14 }} className="provv-card provv-card--highlight">
              <div className="provv-card__label">{bonusFissoLuceCard.title}</div>
              <div className="provv-bonus-values">
                <div className="provv-bonus-value"><div className="provv-card__label">GETTONE</div><strong>{formatMoney(bonusFissoLuceCard.gettone)}</strong></div>
                <div className="provv-bonus-value"><div className="provv-card__label">PREMIO RID</div><strong>{formatMoney(bonusFissoLuceCard.premioRid)}</strong></div>
                <div className="provv-bonus-value"><div className="provv-card__label">RICORRENTE</div><strong>{formatMoney(bonusFissoLuceCard.ricorrente)}</strong></div>
              </div>
            </div>
          )}
        </div>

        <div className="provv-section">
          <button className="provv-long-toggle" type="button" onClick={() => setLongSimulationOpen((isOpen) => !isOpen)}>
            SIMULAZIONE LUNGO PERIODO {longSimulationOpen ? "−" : "+"}
          </button>

          {longSimulationOpen && (
            !hasRealConsumption ? (
              <div className="provv-note" style={{ marginTop: 16 }}>
                Inserisci il consumo annuo per calcolare mantenimento e simulazione lungo periodo.
              </div>
            ) : (
            <div>
              <div className="provv-field" style={{ maxWidth: 320, marginTop: 16 }}>
                <label className="provv-label" htmlFor="long-period">Periodo di permanenza</label>
                <select
                  id="long-period"
                  className="provv-select"
                  value={longMonths}
                  onChange={(event) => setLongMonths(Number(event.target.value))}
                >
                  {Array.from({ length: 24 }, (_, index) => index + 1).map((months) => (
                    <option key={months} value={months}>{months} {months === 1 ? "mese" : "mesi"}</option>
                  ))}
                  {[36, 48, 60, 72, 84, 96, 108, 120].map((months) => (
                    <option key={months} value={months}>{months / 12} anni ({months} mesi)</option>
                  ))}
                </select>
              </div>
              <button
                className={`provv-semester-toggle${includePortfolioBonus ? " provv-semester-toggle--active" : ""}`}
                type="button"
                style={{ marginTop: 12 }}
                onClick={() => setIncludePortfolioBonus((isIncluded) => !isIncluded)}
              >
                PREMIO SEMESTRALE · {includePortfolioBonus ? "INCLUSO NEL CALCOLO" : "NON INCLUSO"}
              </button>

              <div className="provv-long-grid">
                <div className="provv-long-item">
                  <div className="provv-long-item__label">Gettone originario</div>
                  <div className="provv-long-item__value">{formatMoney(longSimulation.gettone)}</div>
                  <div className="provv-long-item__detail">{result.gettoneLabel}</div>
                </div>
                {bonusFissoLuceCard && (
                  <div className="provv-long-item">
                    <div className="provv-long-item__label">Bonus prezzo fisso</div>
                    <div className="provv-long-item__value">{formatMoney(longSimulation.bonusGettone)}</div>
                    <div className="provv-long-item__detail">Differenza necessaria per arrivare a {formatMoney(100)}</div>
                  </div>
                )}
                <div className="provv-long-item">
                  <div className="provv-long-item__label">Gettone complessivo iniziale</div>
                  <div className="provv-long-item__value">{formatMoney(longSimulation.initialGettone)}</div>
                  <div className="provv-long-item__detail">Gettone originario + bonus prezzo fisso</div>
                </div>
                <div className="provv-long-item">
                  <div className="provv-long-item__label">Premio RID iniziale</div>
                  <div className="provv-long-item__value">{formatMoney(longSimulation.premioRid)}</div>
                  <div className="provv-long-item__detail">Gettone + Premio RID: {formatMoney(longSimulation.gettone + longSimulation.premioRid)}</div>
                </div>
                <div className="provv-long-item">
                  <div className="provv-long-item__label">Ricorrente mensile maturato</div>
                  <div className="provv-long-item__value">{formatMoney(longSimulation.ricorrente * longSimulation.months)}</div>
                  <div className="provv-long-item__detail">{formatMoney(longSimulation.ricorrente)} x {longSimulation.months} mesi</div>
                </div>
                <div className="provv-long-item">
                  <div className="provv-long-item__label">Mantenimento sul consumo</div>
                  <div className="provv-long-item__value">{formatMoney(longSimulation.maintenance)}</div>
                  <div className="provv-long-item__detail">
                    Consumo mensile: {longSimulation.monthlyConsumption.toLocaleString("it-IT", { maximumFractionDigits: 2 })} {commodity === "Energia" ? "kWh" : "Smc"} · Tariffa: {formatMoney(longSimulation.maintenanceRate)} /{commodity === "Energia" ? "MWh" : "Smc"} · {longSimulation.months} mesi
                  </div>
                </div>
                <div className="provv-long-item">
                  <div className="provv-long-item__label">Bonus 13° mese</div>
                  <div className="provv-long-item__value">{formatMoney(longSimulation.thirteenthMonth)}</div>
                  <div className="provv-long-item__detail">{longSimulation.months >= 13 ? "25% del gettone iniziale, una sola volta" : "Spetta da 13 mesi"}</div>
                </div>
                {includePortfolioBonus && (
                  <div className="provv-long-item">
                    <div className="provv-long-item__label">Contributo premio semestrale</div>
                    <div className="provv-long-item__value">{formatMoney(longSimulation.portfolioTotal)}</div>
                    <div className="provv-long-item__detail">{formatMoney(longSimulation.portfolioPerSemester)} per semestre x {longSimulation.semesters} semestri maturati</div>
                  </div>
                )}
              </div>

              <div className="provv-long-total">
                <div className="provv-card__label" style={{ color: "rgba(255,255,255,0.82)" }}>TOTALE MATURATO NEL PERIODO</div>
                <strong>{formatMoney(
                  longSimulation.initialGettone +
                  longSimulation.premioRid +
                  longSimulation.ricorrente * longSimulation.months +
                  longSimulation.maintenance +
                  longSimulation.thirteenthMonth +
                  longSimulation.portfolioTotal
                )}</strong>
                <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5 }}>
                  Gettone originario{bonusFissoLuceCard ? " + differenza bonus prezzo fisso" : ""} + Premio RID + ricorrente + mantenimento + bonus 13° mese sul gettone originario{includePortfolioBonus ? " + premio semestrale" : ""}
                </div>
              </div>
            </div>
            )
          )}
        </div>

        <div className="provv-section">
          <h3>{commodity === "Energia" ? "Tabella Energia" : "Tabella Gas"}</h3>
          <div className="provv-table-wrap">
            <table className="provv-table">
              <thead>
                <tr>
                  <th>Consumo annuale</th>
                  <th className={`provv-col-standard${commodity === "Gas" ? " provv-col-standard--gas" : ""}`}>Gettone Standard</th>
                  <th>Premio RID</th>
                  <th>Ricorrente mensile</th>
                  <th className={`provv-col-unica${commodity === "Gas" ? " provv-col-unica--gas" : ""}`}>Gettone Unica</th>
                  <th className={`provv-col-special${commodity === "Gas" ? " provv-col-special--gas" : ""}`}>Gettone Special</th>
                  <th>Ricorrente Unica/Special</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((tier) => {
                  const isSelected = Boolean(activeTierInfo.tier && tier.label === activeTierInfo.tier.label);
                  const selectedClass = isSelected
                    ? commodity === "Energia" ? "provv-row-selected--energia" : "provv-row-selected--gas"
                    : "";

                  return (
                    <tr
                      key={tier.label}
                      className={selectedClass}
                      onClick={() => selectCommissionTier(commodity, tier)}
                    >
                      <td>{tier.label}</td>
                      <td
                        className={`provv-col-standard${commodity === "Gas" ? " provv-col-standard--gas" : ""}`}
                        onClick={() => selectCommissionTier(commodity, tier, "STANDARD")}
                      >{formatMoney(tier.gettone)}</td>
                      <td>{formatMoney(tier.premioRid)}</td>
                      <td>{formatMoney(tier.ricorrente)}</td>
                      <td
                        className={`provv-col-unica${commodity === "Gas" ? " provv-col-unica--gas" : ""}`}
                        onClick={() => selectCommissionTier(commodity, tier, "UNICA")}
                      >{formatMoney(tier.gettoneUnica)}</td>
                      <td
                        className={`provv-col-special${commodity === "Gas" ? " provv-col-special--gas" : ""}`}
                        onClick={() => selectCommissionTier(commodity, tier, "SPECIAL")}
                      >{formatMoney(tier.gettoneSpecial)}</td>
                      <td>{formatMoney(tier.ricorrenteUnicaSpecial)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="provv-section">
          <h3>MANTENIMENTO SUL CONSUMO MENSILE {commodity === "Energia" ? "ENERGIA" : "GAS"}</h3>
          {commodity === "Energia" ? (
            <div className="provv-table-wrap">
              <table className="provv-table">
                <thead>
                  <tr>
                    <th>Categoria</th>
                    <th>STANDARD</th>
                    <th>UNICA</th>
                    <th>SPECIAL</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyEnergyMaintenance.map((row) => (
                    <tr
                      key={row.title}
                      className={selectedTableRow?.table === "maintenance-energia" && selectedTableRow.row === row.title ? "provv-manual-row-selected" : ""}
                      onClick={() => toggleTableRow("maintenance-energia", row.title)}
                    >
                      <td>{row.title}</td>
                      <td>{formatMoney(row.values.STANDARD)} /MWh</td>
                      <td>{formatMoney(row.values.UNICA)} /MWh</td>
                      <td>{formatMoney(row.values.SPECIAL)} /MWh</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="provv-table-wrap">
              <table className="provv-table">
                <thead>
                  <tr>
                    <th>Offerta</th>
                    <th>Valore</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(gasMaintenance).map(([key, value]) => (
                    <tr
                      key={key}
                      className={selectedTableRow?.table === "maintenance-gas" && selectedTableRow.row === key ? "provv-manual-row-selected" : ""}
                      onClick={() => toggleTableRow("maintenance-gas", key)}
                    >
                      <td>{key}</td>
                      <td>{formatMoney(value)} /Smc</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="provv-section">
          <h3>PREMIO SEMESTRALE PORTAFOGLIO {commodity === "Energia" ? "ENERGIA" : "GAS"}</h3>
          <div className="provv-table-wrap">
            <table className="provv-table">
              <thead>
                <tr>
                  <th>Fascia</th>
                  <th>Premio</th>
                </tr>
              </thead>
              <tbody>
                {(commodity === "Energia" ? energyPortfolioBonus : gasPortfolioBonus).map((item) => (
                  <tr
                    key={item.range}
                    className={selectedTableRow?.table === `portfolio-${commodity}` && selectedTableRow.row === item.range ? "provv-manual-row-selected" : ""}
                    onClick={() => toggleTableRow(`portfolio-${commodity}`, item.range)}
                  >
                    <td>{item.range}</td>
                    <td>{formatMoney(item.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 12 }} className="provv-note"><strong>AL 13° MESE:</strong> ulteriore 25% del gettone iniziale</div>
        </div>

        <div className="provv-section">
          <h3>PREMIO PRODUZIONE MENSILE LUCE</h3>
          <div style={{ marginBottom: 12, color: "#475569", fontWeight: 600 }}>Validità produzioni 11/08/2026 – 10/01/2027</div>
          <div className="provv-production-grid">
            {productionLights.map((item) => (
              <div key={item.amount} className="provv-production-card">
                <div className="provv-production-card__amount">{formatMoney(item.amount)}</div>
                <div className="provv-production-card__text">{item.text}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="provv-note" style={{ marginTop: 8 }}>
          Da verificare sulla tabella originale: tra 900.001 e 990.000 kWh non è indicata alcuna fascia.
        </div>
      </div>
    </>
  );
}
