"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "../../../lib/supabase/server";
import { requireConsultant } from "../../../lib/auth/consultant";
import { validDate } from "./dates";

async function consultantClient() {
  const client = await createServerSupabase();
  const access = await requireConsultant(client);
  if (access.status === 401) redirect("/login?next=/consultant/mallettes");
  if (!access.ok) redirect("/");
  return client;
}

function finish(status, from, to) {
  const params = new URLSearchParams({ status });
  if (validDate(from) && validDate(to) && from <= to) {
    params.set("month", from.slice(0, 7));
    params.set("from", from);
    params.set("to", to);
  }
  redirect("/consultant/mallettes?" + params);
}

export async function addCase(form) {
  const client = await consultantClient();
  const name = String(form.get("name") ?? "").trim();
  const size = form.get("size");
  if (!name || name.length > 80 || !["small", "large"].includes(size)) finish("invalid");
  const { error } = await client.from("travelling_cases").insert({ name, size });
  finish(error ? "error" : "added");
}

export async function bookTrip(form) {
  const client = await consultantClient();
  const case_id = form.get("case_id");
  const starts_on = form.get("starts_on");
  const ends_on = form.get("ends_on");
  const destination = String(form.get("destination") ?? "").trim();
  if (!case_id || !destination || destination.length > 160 ||
      !validDate(starts_on) || !validDate(ends_on) || starts_on > ends_on) finish("invalid");
  const { error } = await client.from("travelling_case_trips").insert({
    case_id, starts_on, ends_on, destination,
  });
  finish(error?.code === "23P01" ? "overlap" : error?.code === "23514" ? "inactive" : error ? "error" : "booked", starts_on, ends_on);
}

export async function cancelTrip(form) {
  const client = await consultantClient();
  const { data, error } = await client.from("travelling_case_trips")
    .update({ cancelled: true }).eq("id", form.get("id")).eq("cancelled", false).select("id").maybeSingle();
  finish(error || !data ? "error" : "cancelled", form.get("from"), form.get("to"));
}

export async function updateCase(form) {
  const client = await consultantClient();
  const operation = form.get("operation");
  const size = form.get("size");
  const from = form.get("from");
  const to = form.get("to");
  const id = form.get("id");
  if (typeof id !== "string" || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)) finish("invalid", from, to);

  let changes;
  if (operation === "archive") changes = { archived_at: new Date().toISOString() };
  else if (operation === "restore") changes = { archived_at: null };
  else if (operation === "size" && ["small", "large"].includes(size)) changes = { size };
  else finish("invalid", from, to);

  const { data, error } = await client.from("travelling_cases").update(changes)
    .eq("id", id).select("id").maybeSingle();
  finish(error || !data ? "error" : operation, from, to);
}
