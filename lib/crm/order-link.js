import { createHash } from "node:crypto";
import { createAdminSupabase } from "../supabase/admin";

export function orderLinkHash(token) {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token)
    ? createHash("sha256").update(token).digest("hex") : null;
}

export async function availableOrderLink(token) {
  const hash = orderLinkHash(token);
  if (!hash) return null;
  const { data } = await createAdminSupabase().from("crm_order_links")
    .select("shipping_cents").eq("token_hash", hash).is("used_at", null)
    .gt("expires_at", new Date().toISOString()).maybeSingle();
  return data;
}
