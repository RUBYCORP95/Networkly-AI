import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHEET_ID = "1_8u7XQknjBcsttXbfjWpMgNuSJs9qiUigGYg_UGijaE";
const SHEET_RANGE = "'Feuille 1'!A1:P5001";
const clean = (value, max = 500) => String(value ?? "").trim().slice(0, max);
const normalizePhone = value => clean(value, 60).replace(/[^0-9+]/g, "");
const respond = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function base64url(input) {
  return Buffer.from(typeof input === "string" ? input : JSON.stringify(input)).toString("base64url");
}

async function googleToken(email, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url({ alg: "RS256", typ: "JWT" });
  const payload = base64url({
    iss: email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3500
  });
  const crypto = await import("node:crypto");
  const signature = crypto.sign("RSA-SHA256", Buffer.from(header + "." + payload), privateKey).toString("base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: header + "." + payload + "." + signature }),
    cache: "no-store"
  });
  if (!response.ok) throw new Error("Authentification Google Sheets impossible (" + response.status + ")");
  const json = await response.json();
  return json.access_token;
}

async function locateProfessional(address, postalCode, city) {
  const query = [address, postalCode, city].filter(Boolean).join(" ").trim();
  if (!query || (!postalCode && !city)) return null;
  try {
    const params = new URLSearchParams({ q: query, limit: "1" });
    const response = await fetch("https://data.geopf.fr/geocodage/search/?" + params.toString(), { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!response.ok) return null;
    const result = await response.json();
    const feature = result.features?.[0];
    const coordinates = feature?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length !== 2 || (feature.properties?.score ?? 0) < 0.5) return null;
    const [longitude, latitude] = coordinates;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (postalCode && feature.properties?.postcode && !String(feature.properties.postcode).startsWith(String(postalCode).slice(0, 2))) return null;
    return { latitude, longitude };
  } catch { return null; }
}

async function synchronize() {
  const email = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const role = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!email || !key || !url || !role) return respond({ error: "Configuration serveur incomplète" }, 503);
  try {
    const token = await googleToken(email, key);
    const response = await fetch(
      "https://sheets.googleapis.com/v4/spreadsheets/" + SHEET_ID + "/values/" + encodeURIComponent(SHEET_RANGE),
      { headers: { Authorization: "Bearer " + token }, cache: "no-store" }
    );
    if (!response.ok) throw new Error("Lecture Google Sheets impossible (" + response.status + "). Vérifier le partage au compte de service.");
    const data = await response.json();
    const rows = data.values || [];
    const expected = ["ID prospect","Entreprise","Activité","Prénom","Nom","Téléphone","Email","Adresse","Code postal","Ville","Département","Site internet","Statut prospection","Source","Dernière mise à jour","Notes"];
    if (expected.some((h, i) => clean(rows[0]?.[i]) !== h)) return respond({ error: "En-têtes Google Sheets différents du modèle validé" }, 422);
    if (rows.length >= 5001) return respond({ error: "Limite de 4999 prospects atteinte : ajouter une pagination avant de poursuivre" }, 422);
    const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });
    let imported = 0, duplicates = 0, invalid = 0, geocoded = 0, missingCoordinates = 0, updatedCoordinates = 0;
    let geocodingBudget = 20; // Avoid serverless timeouts; subsequent syncs complete the backlog.
    for (const row of rows.slice(1)) {
      if (!row.some(v => clean(v))) continue;
      const source_id = clean(row[0], 150) || null;
      const company = clean(row[1], 250);
      const phone = normalizePhone(row[5]) || null;
      const email = clean(row[6], 254).toLowerCase() || null;
      if (!company || (!source_id && !phone && !email)) { invalid++; continue; }
      let existing = null;
      for (const [column, value] of [["source_id", source_id], ["email", email], ["phone", phone]]) {
        if (!value) continue;
        const { data: found, error } = await db.from("lead_private_professional_imports").select("id,latitude,longitude").eq(column, value).limit(1);
        if (error) throw error;
        if (found?.length) { existing = found[0]; break; }
      }
      if (existing) {
        duplicates++;
        if ((existing.latitude == null || existing.longitude == null) && geocodingBudget > 0) {
          geocodingBudget--;
          const position = await locateProfessional(clean(row[7],400),clean(row[8],30),clean(row[9],150));
          if (position) {
            const { error } = await db.from("lead_private_professional_imports").update(position).eq("id", existing.id);
            if (error) throw error;
            updatedCoordinates++;
          } else missingCoordinates++;
        }
        continue;
      }
      const record = {
        source_id, company, sector: clean(row[2], 200) || null,
        first_name: clean(row[3], 120) || null, last_name: clean(row[4], 120) || null,
        phone, email, address: clean(row[7], 400) || null,
        postal_code: clean(row[8], 30) || null, city: clean(row[9], 150) || null,
        department: clean(row[10], 100) || null, website: clean(row[11], 350) || null,
        prospect_status: "À contacter", source: clean(row[13], 200) || "Google Sheets TESAMI",
        notes: clean(row[15], 1000) || null
      };
      const position = geocodingBudget > 0 ? await locateProfessional(record.address, record.postal_code, record.city) : null;
      if (geocodingBudget > 0) geocodingBudget--;
      if (position) { Object.assign(record, position); geocoded++; } else missingCoordinates++;
      const { error } = await db.from("lead_private_professional_imports").insert(record);
      if (error?.code === "23505") { duplicates++; continue; }
      if (error) throw error;
      imported++;
    }
    return respond({ ok: true, imported, duplicates, invalid, geocoded, updatedCoordinates, missingCoordinates, checked: Math.max(rows.length - 1, 0), source: "Google Sheets BTOB" });
  } catch (error) {
    console.error("LeadFactory Google Sheets sync failed:", error instanceof Error ? error.message : "unknown");
    return respond({ error: "Synchronisation impossible ; consulter les journaux serveur" }, 500);
  }
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== "Bearer " + secret) return respond({ error: "Non autorisé" }, 401);
  return synchronize();
}

export async function POST(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const role = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token || !url || !anon || !role) return respond({ error: "Authentification requise" }, 401);
  const authClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await authClient.auth.getUser(token);
  if (authError || !auth?.user?.id) return respond({ error: "Session invalide" }, 401);
  const adminDb = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile, error: profileError } = await adminDb.from("profiles").select("is_admin").eq("id", auth.user.id).maybeSingle();
  if (profileError || !profile?.is_admin) return respond({ error: "Accès réservé à l’administration" }, 403);
  return synchronize();
}
