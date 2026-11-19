import { createAdminSupabase } from "../../../../lib/supabase/admin";
import { getConsultantAdmin } from "../../../admin/consultants/access";
import { subscriptionPlans } from "../../../../lib/subscription-prices";

const respond = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET() {
  const { status } = await getConsultantAdmin();
  if (status !== 200) return respond({ error: "Accès administrateur requis." }, status);
  const db = createAdminSupabase();
  const [prices, history] = await Promise.all([
    db.from("subscription_prices").select("code,cents"),
    db.from("subscription_price_history").select("id,code,previous_cents,new_cents,changed_at").order("changed_at", { ascending: false }).order("id", { ascending: false }).limit(50),
  ]);
  if (prices.error || history.error) return respond({ error: "Tarifs indisponibles." }, 500);
  return respond({ prices: prices.data, history: history.data });
}

export async function POST(request) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return respond({ error: "Origine invalide." }, 403);
  const { status, actor } = await getConsultantAdmin();
  if (status !== 200) return respond({ error: "Accès administrateur requis." }, status);
  const input = await request.json().catch(() => null);
  const { code, cents, previousCents, confirmed } = input ?? {};
  if (confirmed !== true || code === "free" || !subscriptionPlans.some(plan => plan.code === code) ||
      !Number.isInteger(cents) || cents < 1 || cents > 999999 || !Number.isInteger(previousCents)) {
    return respond({ error: "Tarif ou confirmation invalide." }, 400);
  }
  const { data, error } = await createAdminSupabase().rpc("update_subscription_price", {
    actor, plan_code: code, expected_cents: previousCents, new_cents: cents,
  });
  if (error) return respond({ error: "Enregistrement impossible." }, 500);
  if (!data) return respond({ error: "Le tarif a changé. Recharge la liste avant de réessayer." }, 409);
  return respond({ saved: true });
}
