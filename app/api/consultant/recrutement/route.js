import { recruitmentSession, reply } from "../../../../lib/recruitment/server";
import { validateSimulation } from "../../../../lib/recruitment/model.mjs";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pageSize = 30;

export async function GET(request) {
  const { db, service, user, response } = await recruitmentSession();
  if (response) return response;
  const params = new URL(request.url).searchParams;
  const page = Math.max(0, Math.min(Number.parseInt(params.get("page"), 10) || 0, 100000));
  const name = (params.get("q") || "").trim().slice(0, 60).replace(/[\\%_]/g, "\\$&");
  const status = params.get("status");
  let query = db.from("recruitment_simulations").select("*", { count: "exact" }).eq("owner_id", user.id);
  if (name) query = query.ilike("first_name", `%${name}%`);
  if (status) query = query.eq("status", status);
  const [records, settings, profile, metrics] = await Promise.all([
    query.order("updated_at", { ascending: false }).order("id").range(page * pageSize, (page + 1) * pageSize - 1),
    service.from("recruitment_settings").select("expenses").single(),
    db.from("profiles").select("full_name,join_url").eq("id", user.id).maybeSingle(),
    service.rpc("recruitment_metrics", { p_owner: user.id }),
  ]);
  if (records.error || settings.error || profile.error || metrics.error) return reply({ error: "Historique indisponible." }, 503);
  return reply({ simulations: records.data, total: records.count, pageSize, metrics: metrics.data,
    defaults: { expenses: settings.data.expenses, consultant_name: profile.data?.full_name ?? "",
      join_url: profile.data?.join_url ?? "" } });
}

async function save(request, editing) {
  const { service, user, response } = await recruitmentSession();
  if (response) return response;
  let input, values;
  try {
    input = await request.json();
    values = validateSimulation(input);
    if (editing && !uuid.test(input.id)) throw new Error("Simulation invalide.");
  } catch (error) {
    return reply({ error: error.message }, 400);
  }
  const table = service.from("recruitment_simulations");
  const query = editing
    ? table.update({ ...values, updated_at: new Date().toISOString() }).eq("id", input.id).eq("owner_id", user.id)
    : table.insert({ ...values, owner_id: user.id });
  const { data, error } = await query.select().maybeSingle();
  if (error) return reply({ error: "Impossible d’enregistrer la simulation." }, 503);
  return data ? reply({ simulation: data }, editing ? 200 : 201) : reply({ error: "Simulation introuvable." }, 404);
}

export const POST = request => save(request, false);
export const PATCH = request => save(request, true);
