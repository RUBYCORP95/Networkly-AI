"use server";

import { redirect } from "next/navigation";
import { requireConsultant } from "../../../lib/auth/consultant";
import { createServerSupabase } from "../../../lib/supabase/server";
import { isDate, parisDate } from "../../../lib/crm/dates.mjs";

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
  const details = String(form.get("details") ?? "").trim();
  const amount = String(form.get("total") ?? "").trim().replace(",", ".");
  if (!uuid.test(id) || !details || details.length > 4000 ||
      (amount && !/^\d{1,6}(?:\.\d{1,2})?$/.test(amount))) finish("invalid", uuid.test(id) ? id : null);

  const { error } = await client.from("crm_orders").insert({
    client_id: id, details, total_cents: amount ? Math.round(Number(amount) * 100) : null,
  });
  finish(error ? "error" : "order", id);
}

export async function updateOrder(form) {
  const client = await consultantClient();
  const id = form.get("id");
  const status = form.get("status");
  if (!uuid.test(id) || !["pending", "confirmed", "completed", "cancelled"].includes(status)) finish("invalid");

  const { data, error } = await client.from("crm_orders").update({ status }).eq("id", id)
    .select("client_id").single();
  finish(error || !data ? "error" : "order", data?.client_id);
}
