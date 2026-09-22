export const ITALIAN_REGIONS = [
  "Abruzzo",
  "Basilicata",
  "Calabria",
  "Campania",
  "Emilia-Romagna",
  "Friuli-Venezia Giulia",
  "Lazio",
  "Liguria",
  "Lombardia",
  "Marche",
  "Molise",
  "Piemonte",
  "Puglia",
  "Sardegna",
  "Sicilia",
  "Toscana",
  "Trentino-Alto Adige",
  "Umbria",
  "Valle d'Aosta",
  "Veneto",
] as const;

export type ItalianRegion = (typeof ITALIAN_REGIONS)[number];

export const REGION_CENTERS: Record<ItalianRegion, [number, number]> = {
  Abruzzo: [42.35, 13.4],
  Basilicata: [40.5, 16.1],
  Calabria: [39.05, 16.35],
  Campania: [40.85, 14.85],
  "Emilia-Romagna": [44.52, 11.25],
  "Friuli-Venezia Giulia": [46.08, 13.12],
  Lazio: [41.9, 12.72],
  Liguria: [44.3, 8.7],
  Lombardia: [45.55, 9.85],
  Marche: [43.45, 13.15],
  Molise: [41.67, 14.6],
  Piemonte: [45.05, 7.8],
  Puglia: [41.0, 16.75],
  Sardegna: [40.1, 9.0],
  Sicilia: [37.55, 14.05],
  Toscana: [43.45, 11.0],
  "Trentino-Alto Adige": [46.45, 11.3],
  Umbria: [42.95, 12.55],
  "Valle d'Aosta": [45.74, 7.32],
  Veneto: [45.65, 11.95],
};

export function normalizeItalianRegion(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const normalized = raw
    .toLocaleLowerCase("it")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const aliases: Array<[RegExp, string]> = [
    [/valle d.?aosta|vallee d.?aoste/, "Valle d'Aosta"],
    [/trentino.*alto adige|sudtirol|suedtirol/, "Trentino-Alto Adige"],
    [/friuli.*venezia giulia/, "Friuli-Venezia Giulia"],
    [/emilia.*romagna/, "Emilia-Romagna"],
  ];

  for (const [pattern, region] of aliases) {
    if (pattern.test(normalized)) return region;
  }

  return (
    ITALIAN_REGIONS.find(
      (region) =>
        region
          .toLocaleLowerCase("it")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "") === normalized
    ) || raw
  );
}

export async function geocodeItalianZone(zone: string) {
  const query = String(zone || "").trim();
  if (!query) return { latitude: null, longitude: null, region: "", displayName: "" };

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", `${query}, Italia`);
  url.searchParams.set("countrycodes", "it");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url.toString(), {
    headers: { "Accept-Language": "it" },
  });

  if (!response.ok) {
    throw new Error("Servizio di geolocalizzazione non disponibile");
  }

  const rows = await response.json();
  const first = Array.isArray(rows) ? rows[0] : null;
  if (!first) {
    return { latitude: null, longitude: null, region: "", displayName: "" };
  }

  const address = first.address || {};
  const region = normalizeItalianRegion(
    address.state || address.region || address.state_district || ""
  );

  return {
    latitude: Number(first.lat),
    longitude: Number(first.lon),
    region,
    displayName: String(first.display_name || query),
  };
}
