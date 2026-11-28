import { createAdminSupabase } from "../supabase/admin";
import { canAccessConsultantResources } from "../auth/consultant";
import { parisDate } from "../crm/dates.mjs";
import { hostLinkActive, hostUuid } from "../crm/hosts.mjs";

export async function publicCatalogue(id, token) {
  if (!hostUuid.test(id) || (token != null && (typeof token !== "string" || !hostUuid.test(token)))) return null;
  const db = createAdminSupabase();
  const { data: catalogue, error } = await db.from("public_catalogues").select("owner_id,shipping_cents")
    .eq("id", id).eq("enabled", true).maybeSingle();
  if (error) throw error;
  if (!catalogue) return null;
  const owner = catalogue.owner_id;
  const [profile, seller, context] = await Promise.all([
    db.from("profiles").select("is_admin,account_status").eq("id", owner).maybeSingle(),
    db.from("crm_seller_profiles").select("name,business,email,phone").eq("owner_id", owner).maybeSingle(),
    token ? db.from("crm_host_sessions").select("kind,status,starts_on,ends_on,shipping_cents,delivery_mode,grouped_shipping_cents,individual_shipping_cents")
      .eq("owner_id", owner).eq("order_token", token).maybeSingle() : { data: null },
  ]);
  if (profile.error || seller.error || context.error) throw profile.error || seller.error || context.error;
  if (!seller.data || !await canAccessConsultantResources(db, owner, profile.data) ||
      (token && (!context.data || !hostLinkActive(context.data, parisDate())))) return null;
  return { db, seller: seller.data, context: context.data, shipping: catalogue.shipping_cents };
}

export function cataloguePath(id, token) {
  return "/catalogue/" + id + (token ? "?contexte=" + encodeURIComponent(token) : "");
}
