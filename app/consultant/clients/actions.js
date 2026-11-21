"use server";

import { redirect } from "next/navigation";
import { requireConsultant } from "../../../lib/auth/consultant";
import { createServerSupabase } from "../../../lib/supabase/server";
import { isDate, parisDate } from "../../../lib/crm/dates.mjs";
import { orderTotals, readDiscount } from "../../../lib/crm/order-pricing.mjs";
import { priceOrder, readLines } from "../../../lib/crm/order";
import { randomBytes, createHash } from "node:crypto";
import { sellerFields } from "../../../lib/crm/order-receipt.mjs";
import { parseCents } from "../../../lib/crm/money.mjs";

const path = "/consultant/clients";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function consultantClient() {
  const client = await createServerSupabase();
  const access = await requireConsultant(client);
  if (access.status === 401) redirect("/login?next=" + path);
  if (!access.ok) redirect("/");
  return client;
}

function finish(result, id) {
  const params = new URLSearchParams({ result });
  if (id) params.set("client", id);
  redirect(path + "?" + params);
}

export async function saveClient(form) {
  const client = await consultantClient();
  const id = form.get("id");
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim() || null;
  const phone = String(form.get("phone") ?? "").trim() || null;
  const birth_date = form.get("birth_date") || null;

  if ((id && !uuid.test(id)) || !name || name.length > 120 || phone?.length > 40 ||
      (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) ||
      (birth_date && (!isDate(birth_date) || birth_date > parisDate()))) finish("invalid");

  const values = { name, email, phone, birth_date,
    birthday_notification: !!birth_date && form.get("birthday_notification") === "on" };
  const operation = id ? client.from("crm_clients").update(values).eq("id", id) :
    client.from("crm_clients").insert(values);
  const { data, error } = await operation.select("id").single();
  finish(error || !data ? "error" : "client", data?.id);
}

export async function addFollowup(form) {
  const client = await consultantClient();
  const id = form.get("client_id");
  const delay = form.get("delay_days");
  if (!uuid.test(id) || typeof delay !== "string" || !/^\d{1,4}$/.test(delay) ||
      Number(delay) < 1 || Number(delay) > 3650) finish("invalid");

  const { error } = await client.from("crm_followups").insert({
    client_id: id, delay_days: Number(delay), notification: form.get("notification") === "on",
  });
  finish(error ? "error" : "followup", id);
}

export async function updateFollowup(form) {
  const client = await consultantClient();
  const id = form.get("id");
  const operation = form.get("operation");
  if (!uuid.test(id) || !["complete", "enable", "disable"].includes(operation)) finish("invalid");
  const values = operation === "complete" ? { completed_at: new Date().toISOString() } :
    { notification: operation === "enable" };
  const { data, error } = await client.from("crm_followups").update(values).eq("id", id)
    .is("completed_at", null).select("client_id").single();
  finish(error || !data ? "error" : "updated", data?.client_id);
}

async function readOrderPricing(form, existingItems) {
  let details = String(form.get("details") ?? "").trim();
  let total = parseCents(form.get("total"));
  const shipping = parseCents(form.get("shipping")) ?? 0;
  const requested = readLines(form.get("lines"));
  if (Number.isNaN(shipping) || !requested) return { error: "invalid" };

  let discount;
  try { discount = readDiscount(form.get("discount_type"), form.get("discount_value")); }
  catch { return { error: "invalid" }; }
  let items = [];
  if (requested.length) {
    try { ({ items, total } = await priceOrder(requested, { customPricing: true, existingItems })); }
    catch { return { error: "catalogue" }; }
    details = "Bon de commande catalogue";
  }
  if (!details || details.length > 4000 || Number.isNaN(total) || total > 99999999) return { error: "invalid" };
  if (discount && total === null) return { error: "invalid" };
  const { net, savings } = orderTotals(total, discount, shipping);
  return { values: {
    details, total_cents: net, shipping_cents: shipping, items,
    order_discount: discount ? { ...discount, applied_cents: savings } : null,
  } };
}

export async function addOrder(form) {
  const client = await consultantClient();
  const id = form.get("client_id");
  if (!uuid.test(id)) finish("invalid");
  const { values, error: pricingError } = await readOrderPricing(form);
  if (pricingError) finish(pricingError, id);
  const { data: seller } = await client.from("crm_seller_profiles").select("name").maybeSingle();
  if (!seller) finish("seller_required", id);
  const { error } = await client.from("crm_orders").insert({ client_id: id, ...values });
  finish(error ? "error" : "order", id);
}

export async function editOrder(id, clientId, form) {
  const client = await consultantClient();
  if (!uuid.test(id) || !uuid.test(clientId)) finish("invalid");
  const params = new URLSearchParams({ view: "history", client: clientId });
  const { data: order } = await client.from("crm_orders").select("items")
    .eq("id", id).eq("client_id", clientId).maybeSingle();
  let result = "error";
  if (order) {
    const { values, error: pricingError } = await readOrderPricing(form, order.items);
    if (pricingError) {
      params.set("edit", id);
      result = pricingError;
    } else {
      const { data, error } = await client.from("crm_orders").update(values)
        .eq("id", id).eq("client_id", clientId).select("id").maybeSingle();
      if (data && !error) result = "order";
      else params.set("edit", id);
    }
  }
  params.set("result", result);
  redirect(path + "?" + params);
}

export async function updateOrder(form) {
  const client = await consultantClient();
  const id = form.get("id");
  const status = form.get("status");
  const payment_status = form.get("payment_status");
  const shipping = parseCents(form.get("shipping")) ?? 0;
  if (!uuid.test(id) || Number.isNaN(shipping) || !["pending", "paid", "later"].includes(payment_status) ||
      !["pending", "confirmed", "completed", "cancelled"].includes(status)) finish("invalid");

  const { data, error } = await client.from("crm_orders").update({ status, payment_status, shipping_cents: shipping }).eq("id", id)
    .select("client_id").single();
  const result = error || !data ? "error" : "order";
  const filter = form.get("order_filter");
  if (["all", "pending", "processed"].includes(filter)) {
    redirect(path + "?" + new URLSearchParams({ view: "orders", filter, result }));
  }
  if (data?.client_id) {
    redirect(path + "?" + new URLSearchParams({ view: "history", client: data.client_id, result }));
  }
  finish(result);
}

export async function createOrderLink(form) {
  const client = await consultantClient();
  const id = form.get("client_id");
  const shipping = parseCents(form.get("shipping")) ?? 0;
  if (!uuid.test(id) || Number.isNaN(shipping)) return { error: "Vérifie les frais de livraison." };

  const { data: customer } = await client.from("crm_clients").select("email").eq("id", id).maybeSingle();
  if (!customer?.email) return { error: "Ajoute l’e-mail du client à sa fiche avant de partager le bon." };
  const { data: seller } = await client.from("crm_seller_profiles").select("name").maybeSingle();
  if (!seller) return { error: "Enregistre d’abord tes coordonnées professionnelles." };

  const token = randomBytes(32).toString("base64url");
  const token_hash = createHash("sha256").update(token).digest("hex");
  const { error } = await client.from("crm_order_links").insert({
    token_hash, client_id: id, shipping_cents: shipping,
  });
  return error ? { error: "Le lien n’a pas pu être créé." } : { token };
}

export async function saveSeller(form) {
  const client = await consultantClient();
  const values = Object.fromEntries(sellerFields.map(([key]) => [key, String(form.get(key) ?? "").trim()]));
  if (!values.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) ||
      sellerFields.some(([key, , limit]) => values[key].length > limit)) finish("invalid");
  const { error } = await client.from("crm_seller_profiles").upsert(values, { onConflict: "owner_id" });
  finish(error ? "error" : "seller");
}

export async function createRegistrationLink() {
  const client = await consultantClient();
  const {data: seller} = await client.from("crm_seller_profiles").select("name").maybeSingle();
  if (!seller) return {error: "Enregistre d’abord tes coordonnées professionnelles dans les paramètres du CRM."};
  const token = randomBytes(32).toString("base64url");
  const token_hash = createHash("sha256").update(token).digest("hex");
  const {error} = await client.from("crm_registration_links").insert({token_hash});
  return error ? {error: "Le lien n’a pas pu être créé."} : {token};
}
