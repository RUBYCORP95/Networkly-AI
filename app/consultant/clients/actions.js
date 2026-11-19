"use server";

import { redirect } from "next/navigation";
import { requireConsultant } from "../../../lib/auth/consultant";
import { createServerSupabase } from "../../../lib/supabase/server";
import { isDate, parisDate } from "../../../lib/crm/dates.mjs";

import { getVariants, requireEuroCatalogue } from "../../../lib/crm/catalogue";
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

export async function addOrder(form) {
  const client = await consultantClient();
  const id = form.get("client_id");
  let details = String(form.get("details") ?? "").trim();
  let total = parseCents(form.get("total"));
  const shipping = parseCents(form.get("shipping")) ?? 0;
  let requested;
  try { requested = JSON.parse(form.get("lines") || "[]"); }
  catch { finish("invalid"); }
  if (!uuid.test(id) || Number.isNaN(shipping) || !Array.isArray(requested) || requested.length > 20 ||
      requested.some(line => !line || typeof line.handle !== "string" || !/^[0-9]+$/.test(line.id) ||
        !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 999) ||
      new Set(requested.map(line => line.id)).size !== requested.length) finish("invalid");

  let items = [];
  if (requested.length) {
    try {
      const handles = [...new Set(requested.map(line => line.handle))];
      const [, variants] = await Promise.all([requireEuroCatalogue(), Promise.all(handles.map(getVariants))]);
      const available = new Map(variants.flat().map(item => [item.id, item]));
      items = requested.map(line => {
        const item = available.get(line.id);
        if (!item || item.handle !== line.handle) throw new Error("Variante indisponible");
        return { ...item, quantity: line.quantity };
      });
    } catch { finish("catalogue", id); }
    total = items.reduce((sum, item) => sum + item.unit_cents * item.quantity, 0);
    details = "Bon de commande catalogue";
  }
  if (!details || details.length > 4000 || Number.isNaN(total) || total > 99999999) finish("invalid", id);
  const { error } = await client.from("crm_orders").insert({
    client_id: id, details, total_cents: total, shipping_cents: shipping, items,
  });
  finish(error ? "error" : "order", id);
}

export async function updateOrder(form) {
  const client = await consultantClient();
  const id = form.get("id");
  const status = form.get("status");
  const shipping = parseCents(form.get("shipping")) ?? 0;
  if (!uuid.test(id) || Number.isNaN(shipping) || !["pending", "confirmed", "completed", "cancelled"].includes(status)) finish("invalid");

  const { data, error } = await client.from("crm_orders").update({ status, shipping_cents: shipping }).eq("id", id)
    .select("client_id").single();
  finish(error || !data ? "error" : "order", data?.client_id);
}
