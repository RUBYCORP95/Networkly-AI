export const dynamic = "force-dynamic";

const json = (body, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store" }
});

export async function GET(request) {
  const q = (new URL(request.url).searchParams.get("q") || "").trim().slice(0, 90);
  if (q.length < 2) return json({ cities: [] });
  // The official communes API supports both commune names and postal codes.
  // Do not use the discontinued api-adresse.data.gouv.fr endpoint.
  const postal = /^\\d{5}$/.test(q);
  if (/^\\d{2}$/.test(q)) return json({ cities: [], hint: "Indique une ville ou un code postal à 5 chiffres (ex. Saint-Étienne ou 42000)." });
  const params = new URLSearchParams({ [postal ? "codePostal" : "nom"]: q, fields: "nom,code,codesPostaux,centre", format: "json", geometry: "centre", limit: "15" });
  try {
    const res = await fetch("https://geo.api.gouv.fr/communes?" + params.toString(), { signal: AbortSignal.timeout(8000), next: { revalidate: 3600 } });
    if (!res.ok) throw new Error("Service de communes indisponible");
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Réponse du service de communes invalide");
    const cities = data.filter(x => Array.isArray(x.centre?.coordinates) && x.centre.coordinates.length === 2)
      .map(x => ({ name: x.nom, postcode: x.codesPostaux?.[0] || "", code: x.code, latitude: x.centre.coordinates[1], longitude: x.centre.coordinates[0] }))
      .filter(x => Number.isFinite(x.latitude) && Number.isFinite(x.longitude));
    return json({ cities });
  } catch (error) {
    console.error("LeadFactory cities search:", error instanceof Error ? error.message : "unknown");
    return json({ error: "Recherche de villes temporairement indisponible. Réessaie dans quelques instants." }, 502);
  }
}
