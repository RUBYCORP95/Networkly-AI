const allowedOrigins=new Set(["https://app.tesami.fr","https://tesami.fr","https://networkly-sage.vercel.app","https://networkly-ai.vercel.app"]);
const cors=(req:Request)=>{const origin=req.headers.get("origin")||"";return {"Access-Control-Allow-Origin":allowedOrigins.has(origin)?origin:"https://networkly-sage.vercel.app","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Vary":"Origin"};};
import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const SEGMENT="RbHGeT", CHECKOUT="YhWu4P", ORDER="X8xDaX";
const respond=(v:unknown,status=200,req?:Request)=>new Response(JSON.stringify(v),{status,headers:{"content-type":"application/json","cache-control":"no-store",...(req?cors(req):{})}});
const api=async(path:string,key:string)=>{const r=await fetch("https://a.klaviyo.com/api/"+path,{headers:{Authorization:"Klaviyo-API-Key "+key,accept:"application/vnd.api+json",revision:"2026-07-15"},signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error("Klaviyo HTTP "+r.status);return await r.json()};
const EXCLUSION_SEGMENT = "TqYu8v";
const query = (values: Record<string, string>) => new URLSearchParams(values).toString();

async function latestEvent(profile: string, metric: string, key: string) {
 const result = await api("events?" + query({
  filter: `and(equals(profile_id,"${profile}"),equals(metric_id,"${metric}"))`,
  "page[size]": "1",
  "fields[event]": "datetime",
  sort: "-datetime",
 }), key);
 if (!Array.isArray(result.data)) throw new Error("Invalid Klaviyo event response");
 if (!result.data.length) return null;
 const date = Date.parse(result.data[0].attributes?.datetime);
 if (!Number.isFinite(date)) throw new Error("Invalid Klaviyo event date");
 return date;
}

function coordinate(value: unknown, limit: number) {
 return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit ? value : null;
}

function frenchDepartment(zip: string, country: unknown) {
 if (country !== "France" && country !== "FR") return null;
 if (!/^\d{5}$/.test(zip) || zip.startsWith("20")) return null;
 return /^9[78]/.test(zip) ? zip.slice(0, 3) : zip.slice(0, 2);
}

async function communeCoordinates(city: string, zip: string, country: unknown) {
 if (!city || !/^\d{5}$/.test(zip) || !["FR", "France"].includes(String(country))) return null;
 const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
 try {
  const response = await fetch("https://geo.api.gouv.fr/communes?" + query({
   codePostal: zip, fields: "nom,centre,codeDepartement",
  }), {signal: AbortSignal.timeout(3500)});
  if (!response.ok) return null;
  const communes = await response.json();
  if (!Array.isArray(communes)) return null;
  const matches = communes.filter(c => typeof c.nom === "string" && normalize(c.nom) === normalize(city));
  if (matches.length !== 1) return null;
  const [longitude, latitude] = matches[0].centre?.coordinates ?? [];
  const lat = coordinate(latitude, 90);
  const lon = coordinate(longitude, 180);
  return lat === null || lon === null ? null : {lat, lon, department: matches[0].codeDepartement};
 } catch {
  return null;
 }
}

Deno.serve(async (req) => {
 if (req.method === "OPTIONS") return new Response(null, {status: 204, headers: cors(req)});
 const reply = (body: unknown, status = 200) => respond(body, status, req);
 if (req.method !== "POST") return reply({error: "POST required"}, 405);
 const token = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
 if (!token) return reply({error: "Authentication required"}, 401);
 const url = Deno.env.get("SUPABASE_URL");
 const anon = Deno.env.get("SUPABASE_ANON_KEY");
 const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if (!url || !anon || !service) return reply({error: "Configuration Supabase incomplète"}, 503);
 const userClient = createClient(url, anon);
 const {data: auth, error: authError} = await userClient.auth.getUser(token);
 if (authError || !auth.user) return reply({error: "Unauthorized"}, 401);
 const db = createClient(url, service);
 const {data: admin, error: adminError} = await db.from("profiles").select("is_admin").eq("id", auth.user.id).single();
 if (adminError || admin?.is_admin !== true) return reply({error: "Admin only"}, 403);
 const key = Deno.env.get("KLAVIYO_API_KEY");
 if (!key) return reply({error: "Clé serveur Klaviyo absente"}, 503);

 const body = await req.json().catch(() => null);
 if (!body || typeof body !== "object" || (body.cursor != null && typeof body.cursor !== "string")) {
  return reply({error: "Invalid request"}, 400);
 }
 const commit = body.commit === true;
 const cutoff = Date.now() - 60 * 86400000;
 const counts = {checked: 0, eligible: 0, imported: 0, skipped: 0, incomplete: 0, excluded: 0, missing_coordinates: 0};
 const rows = [];
 try {
  const params: Record<string, string> = {"page[size]": "20", "additional-fields[profile]": "subscriptions"};
  if (body.cursor) params["page[cursor]"] = body.cursor;
  const page = await api(`segments/${SEGMENT}/profiles?` + query(params), key);
  if (!Array.isArray(page.data)) throw new Error("Invalid Klaviyo profile response");
  const profiles = page.data;
  const ids = profiles.map(p => p.id).filter(id => typeof id === "string" && /^[a-zA-Z0-9_-]+$/.test(id));
  const excluded = new Set<string>();
  if (ids.length) {
   const response = await api(`segments/${EXCLUSION_SEGMENT}/profiles?` + query({
    filter: `any(id,${JSON.stringify(ids)})`,
    "fields[profile]": "id", "page[size]": "20",
   }), key);
   if (!Array.isArray(response.data) || response.links?.next) throw new Error("Incomplete Klaviyo exclusion check");
   for (const profile of response.data) excluded.add(profile.id);
  }
  const now = new Date().toISOString();
  for (const {id, attributes: a} of profiles) {
   counts.checked++;
   const email = String(a?.email || "").trim().toLowerCase();
   const phone = String(a?.phone_number || "").trim();
   const location = a?.location || {};
   const city = String(location.city || "").trim();
   const zip = String(location.zip || "").trim();
   const department = frenchDepartment(zip, location.country);
   const marketing = a?.subscriptions?.email?.marketing;
   if (!marketing || excluded.has(id) || marketing.consent === "UNSUBSCRIBED" ||
       marketing.can_receive_email_marketing === false || marketing.suppression?.length ||
       marketing.list_suppressions?.length || a?.subscriptions?.sms?.marketing?.consent === "UNSUBSCRIBED") {
    counts.excluded++;
    continue;
   }
   if (!ids.includes(id) || !email || phone.replace(/\D/g, "").length < 8 || (!city && !department)) {
    counts.incomplete++;
    continue;
   }
   const [cart, order] = await Promise.all([latestEvent(id, CHECKOUT, key), latestEvent(id, ORDER, key)]);
   if (cart === null || cart > cutoff || (order !== null && order >= cart)) continue;
   const lat = coordinate(location.latitude, 90);
   const lon = coordinate(location.longitude, 180);
   const point = lat !== null && lon !== null && (lat !== 0 || lon !== 0)
    ? {lat, lon, department} : await communeCoordinates(city, zip, location.country);
   if (!point) counts.missing_coordinates++;
   rows.push({
    klaviyo_profile_id: id, email, phone, first_name: a.first_name || null, last_name: a.last_name || null,
    city: city || null, department: point?.department || department, postal_code: zip || null,
    latitude: point?.lat ?? null, longitude: point?.lon ?? null,
    last_abandoned_at: new Date(cart).toISOString(),
    last_order_at: order === null ? null : new Date(order).toISOString(),
    orders_checked_at: now, consent_status: "unknown", source_segment_id: SEGMENT, updated_at: now,
   });
   counts.eligible++;
  }
  counts.skipped = counts.checked - counts.eligible;
  const cursor = page.links?.next ? new URL(page.links.next).searchParams.get("page[cursor]") : null;
  if (page.links?.next && !cursor) throw new Error("Invalid Klaviyo pagination");
  if (commit && rows.length) {
   const {error} = await db.from("lead_private_klaviyo_contacts").upsert(rows, {onConflict: "klaviyo_profile_id", defaultToNull: false});
   if (error) throw new Error("Private storage failed: " + error.code);
   counts.imported = rows.length;
  }
  return reply({...counts, committed: commit, next_cursor: cursor, private_admin_only: true, assigned_to_consultants: 0});
 } catch (error) {
  return reply({error: error instanceof Error ? error.message : "Import unavailable", ...counts}, 502);
 }
});
