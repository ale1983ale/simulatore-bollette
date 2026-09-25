const cache = new Map();

function clean(value) {
  return String(value || "").trim();
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Metodo non consentito." });
  }

  const query = clean(req.query?.query || req.query?.q);
  const province = clean(req.query?.province);
  const region = clean(req.query?.region);

  if (!query) {
    return res.status(400).json({ error: "Zona non indicata." });
  }

  const searchText = [query, province, region, "Italia"]
    .filter(Boolean)
    .join(", ");
  const cacheKey = searchText.toLocaleLowerCase("it");

  if (cache.has(cacheKey)) {
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=604800, stale-while-revalidate=2592000"
    );
    return res.status(200).json({
      results: cache.get(cacheKey),
      cached: true,
    });
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("countrycodes", "it");
    url.searchParams.set("limit", "20");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("namedetails", "1");
    url.searchParams.set("extratags", "1");
    url.searchParams.set("q", searchText);

    const response = await fetch(url.toString(), {
      headers: {
        "Accept-Language": "it",
        "User-Agent":
          "simulatore-bollette/1.0 (+https://simulatore-bollette.vercel.app)",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Servizio di geolocalizzazione non disponibile (${response.status})`
      );
    }

    const body = await response.json();
    const results = Array.isArray(body) ? body : [];

    cache.set(cacheKey, results);
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=604800, stale-while-revalidate=2592000"
    );
    return res.status(200).json({ results, cached: false });
  } catch (error) {
    return res.status(502).json({
      error:
        error?.message ||
        "Errore durante la geolocalizzazione della zona.",
    });
  }
}
