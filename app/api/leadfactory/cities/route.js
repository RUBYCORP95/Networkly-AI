export const dynamic = "force-dynamic";
const reply = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const toCity = (x) => {
  const coords = x.centre?.coordinates;
  if (!Array.isArray(coords) || coords.length !== 2 || !coords.every(Number.isFinite)) return null;
  return { name: x.nom, postcode: x.codesPostaux?.[0] || "", code: x.code, latitude: coords[1], longitude: coords[0] };
};
export async function GET(request) {
  const q = (new URL(request.url).searchParams.get("q") || "").trim().slice(0, 90);
  if (q.length < 2) return reply({ cities: [] });
  const department = /^(?:[0-9]{2}|2[AB]|97[1-6])$/i.test(q);
  const postal = /^[0-9]{5}$/.test(q);
  const fields = "nom,code,codesPostaux,centre";
  const params = new URLSearchParams({ fields, format: "json", geometry: "centre" });
  if (!department) { params.set(postal ? "codePostal" : "nom", q); params.set("limit", "30"); }
  const url = department
    ? "https://geo.api.gouv.fr/departements/" + encodeURIComponent(q.toUpperCase()) + "/communes?" + params
    : "https://geo.api.gouv.fr/communes?" + params;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000), cache: "no-store" });
    if (!response.ok) throw new Error("API communes HTTP " + response.status);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("Invalid communes response");
    const cities = data.map(toCity).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, "fr"));
    return reply({ cities: department ? cities.slice(0, 200) : cities, department: department ? q.toUpperCase() : null });
  } catch (error) {
    console.error("LeadFactory city search failed", error instanceof Error ? error.message : "unknown");
    return reply({ error: "Recherche de villes indisponible. Veuillez réessayer." }, 502);
  }
}
