export const dynamic = "force-dynamic";
export async function GET(request) {
 const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 90) || "";
 if (q.length < 2) return Response.json({cities:[]});
 try {
  const url = "https://api-adresse.data.gouv.fr/search/?type=municipality&limit=6&q=" + encodeURIComponent(q);
  const res = await fetch(url, {next:{revalidate:3600}});
  if (!res.ok) throw new Error("Service de recherche indisponible");
  const json = await res.json();
  return Response.json({cities:(json.features||[]).filter(x=>Array.isArray(x.geometry?.coordinates)&&x.geometry.coordinates.length===2).map(x=>({name:x.properties?.city||x.properties?.name||"",postcode:x.properties?.postcode||"",code:x.properties?.citycode||"",latitude:x.geometry.coordinates[1],longitude:x.geometry.coordinates[0]}))});
 } catch {return Response.json({error:"Recherche de villes indisponible"}, {status:502});}
}
