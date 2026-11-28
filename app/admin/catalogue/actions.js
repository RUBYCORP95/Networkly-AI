"use server";

import { redirect } from "next/navigation";
import { requireActiveUser } from "../../../lib/auth/active-user";
import { hostUuid } from "../../../lib/crm/hosts.mjs";
import { meetingPromoCode } from "../../../lib/crm/meeting-promo.mjs";
import { parseCents } from "../../../lib/crm/money.mjs";
import { categories } from "../../../lib/public-catalogue/model.mjs";
import { createAdminSupabase } from "../../../lib/supabase/admin";
import { createServerSupabase } from "../../../lib/supabase/server";

async function admin() {
  const access = await requireActiveUser(await createServerSupabase());
  if (!access.ok || !access.profile.is_admin) redirect("/");
  return createAdminSupabase();
}

function done(result, product) {
  const qs = new URLSearchParams({ result });
  if (product) qs.set("product", product);
  redirect("/admin/catalogue?" + qs);
}

export async function saveProduct(form) {
  const db = await admin();
  const id = String(form.get("id") ?? "");
  if (id && !/^[1-9][0-9]{0,17}$/.test(id)) done("invalid");
  const fields = { reference: 80, title: 180, format: 80, description: 3000,
    notes: 1000, photo_url: 1000, photo_alt: 200, source_note: 1000 };
  const product = Object.fromEntries(Object.keys(fields).map(key => [key, String(form.get(key) ?? "").trim()]));
  if (Object.entries(fields).some(([key, limit]) => product[key].length > limit)) done("invalid", id);
  product.reference = product.reference.toUpperCase();
  product.category = String(form.get("category"));
  product.bottle = product.category === "parfums" ? String(form.get("bottle") ?? "") || null : null;
  product.unit_cents = parseCents(form.get("price"));
  product.available = form.get("available") === "on";
  product.visible = form.get("visible") === "on";
  product.verified = form.get("verified") === "on";
  if (product.photo_url) {
    let url;
    try { url = new URL(product.photo_url); } catch { done("invalid", id); }
    if (url.protocol !== "https:" || url.username || url.password) done("invalid", id);
  }
  if (!Object.hasOwn(categories, product.category) || !product.reference || !product.title ||
      !Number.isSafeInteger(product.unit_cents) || ![null, "noir", "blanc"].includes(product.bottle) ||
      (product.visible && (!product.verified || !product.photo_url || !product.source_note || !product.description ||
        (product.category === "parfums" && (!product.bottle || !product.notes))))) done("invalid", id);
  const query = db.from("public_catalogue_products");
  const result = await (id ? query.update(product).eq("id", id) : query.insert(product)).select("id").maybeSingle();
  done(result.error || !result.data ? "failed" : "saved", result.data?.id ?? id);
}

export async function savePromo(form) {
  const db = await admin();
  const code = meetingPromoCode(form.get("code"));
  const discount_bp = parseCents(form.get("discount"));
  if (!code || !Number.isInteger(discount_bp) || discount_bp < 1 || discount_bp > 10000) done("invalid");
  const { error } = await db.from("public_catalogue_promos").upsert({ code, discount_bp, active: form.get("active") === "on" });
  done(error ? "failed" : "saved");
}

export async function toggleCatalogue(form) {
  const db = await admin();
  const id = form.get("catalogue");
  const value = form.get("enabled");
  if (!hostUuid.test(id) || !["yes", "no"].includes(value)) done("invalid");
  const { error, data } = await db.from("public_catalogues").update({ enabled: value === "yes" }).eq("id", id)
    .select("id").maybeSingle();
  done(error || !data ? "failed" : "saved");
}
