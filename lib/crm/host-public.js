import { canAccessConsultantResources } from "../auth/consultant";
import { createAdminSupabase } from "../supabase/admin";
import { parisDate } from "./dates.mjs";
import { hostLinkActive, hostUuid } from "./hosts.mjs";

async function publicSession(token, column, fields) {
  if (!hostUuid.test(token)) return null;
  const db = createAdminSupabase();
  const result = await db.from("crm_host_sessions").select(fields).eq(column, token).maybeSingle();
  if (result.error || !result.data) return null;
  const session = result.data;
  const { data: profile } = await db.from("profiles").select("is_admin,account_status").eq("id", session.owner_id).maybeSingle();
  return await canAccessConsultantResources(db, session.owner_id, profile) ? { db, session } : null;
}

export async function availableHostOrder(token) {
  const found = await publicSession(token, "order_token", "owner_id,kind,status,starts_on,ends_on,shipping_cents");
  if (!found || !hostLinkActive(found.session, parisDate())) return null;
  const { data: seller } = await found.db.from("crm_seller_profiles")
    .select("name,business,email,phone,address,registration").eq("owner_id", found.session.owner_id).maybeSingle();
  return seller ? { ...found, seller } : null;
}

export async function hostTracking(token) {
  const found = await publicSession(token, "tracking_token", "id,owner_id,kind,status,starts_on,ends_on,order_token");
  if (!found) return null;
  const { db, session } = found;
  const [sales, gifts] = await Promise.all([
    db.from("crm_host_sales").select("paid_orders,paid_cents").eq("owner_id", session.owner_id).eq("session_id", session.id).maybeSingle(),
    db.from("crm_host_gifts").select("threshold_cents,label,delivered_at").eq("owner_id", session.owner_id).eq("session_id", session.id).order("threshold_cents"),
  ]);
  return sales.error || gifts.error ? null : { session, sales: sales.data, gifts: gifts.data };
}
