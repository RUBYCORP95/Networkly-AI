import { recruitmentSession, reply } from "../../../../lib/recruitment/server";
import { validateSettings } from "../../../../lib/recruitment/model.mjs";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request) {
  const { service, response } = await recruitmentSession(true);
  if (response) return response;
  const q = (new URL(request.url).searchParams.get("q") || "").trim().slice(0, 100);
  let accounts = service.from("profiles").select("id,full_name,is_admin").order("full_name").limit(30);
  if (q) accounts = uuid.test(q) ? accounts.eq("id", q) : accounts.ilike("full_name", `%${q.replace(/[\\%_]/g, "\\$&")}%`);
  const [settings, profiles] = await Promise.all([
    service.from("recruitment_settings").select("*").single(), accounts,
  ]);
  if (settings.error || profiles.error) return reply({ error: "Configuration indisponible." }, 503);
  if (!profiles.data.length) return reply({ settings: settings.data, accounts: [] });
  const grants = await service.from("recruitment_access").select().in("user_id", profiles.data.map(profile => profile.id));
  if (grants.error) return reply({ error: "Droits indisponibles." }, 503);
  const byUser = new Map(grants.data.map(grant => [grant.user_id, grant.allowed]));
  return reply({ settings: settings.data, accounts: profiles.data.map(profile => ({
    ...profile, allowed: byUser.get(profile.id) ?? null,
  })) });
}

export async function PATCH(request) {
  const { service, response } = await recruitmentSession(true);
  if (response) return response;
  let input;
  try { input = await request.json(); } catch { return reply({ error: "Requête invalide." }, 400); }
  if (input?.type === "settings") {
    let values;
    try { values = validateSettings(input.settings); } catch (error) { return reply({ error: error.message }, 400); }
    const { error } = await service.from("recruitment_settings").update(values).eq("id", true);
    return error ? reply({ error: "Enregistrement impossible." }, 503) : reply({ settings: values });
  }
  if (input?.type !== "access" || !uuid.test(input.userId) || ![null, true, false].includes(input.allowed)) {
    return reply({ error: "Droit invalide." }, 400);
  }
  const account = await service.from("profiles").select("is_admin").eq("id", input.userId).maybeSingle();
  if (account.error) return reply({ error: "Compte indisponible." }, 503);
  if (!account.data || account.data.is_admin) return reply({ error: "Sélectionne un compte consultant." }, 400);
  const grants = service.from("recruitment_access");
  const { error } = input.allowed === null ? await grants.delete().eq("user_id", input.userId)
    : await grants.upsert({ user_id: input.userId, allowed: input.allowed });
  return error ? reply({ error: "Modification du droit impossible." }, 503) : reply({ ok: true });
}
