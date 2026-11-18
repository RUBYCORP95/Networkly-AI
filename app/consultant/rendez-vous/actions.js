"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "../../../lib/supabase/server";
import { requireConsultant } from "../../../lib/auth/consultant";
import { validDate } from "../mallettes/dates";

async function clientForConsultant() {
  const client = await createServerSupabase();
  const access = await requireConsultant(client);
  if (access.status === 401) redirect("/login?next=/consultant/rendez-vous");
  if (!access.ok) redirect("/");
  return client;
}

function finish(status, day) {
  const params = new URLSearchParams({ status });
  if (validDate(day)) params.set("month", day.slice(0, 7));
  redirect("/consultant/rendez-vous?" + params);
}

export async function scheduleAppointment(form) {
  const client = await clientForConsultant();
  const title = String(form.get("title") ?? "").trim();
  const place = String(form.get("place") ?? "").trim();
  const day = form.get("day");
  const starts_at = form.get("starts_at");
  const ends_at = form.get("ends_at");
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!title || title.length > 100 || place.length > 240 || !validDate(day) ||
    !time.test(starts_at) || !time.test(ends_at) || starts_at >= ends_at) finish("invalid", day);

  const leadId = form.get("lead");
  let lead_allocation_id = null;
  if (leadId) {
    const { data, error } = await client.rpc("my_lead_allocation_cards");
    if (error || !data?.some(card => card.allocation_id === leadId)) finish("lead", day);
    lead_allocation_id = leadId;
  }
  const { error } = await client.from("consultant_appointments").insert({
    title, place, day, starts_at, ends_at, lead_allocation_id,
  });
  finish(error ? "error" : "saved", day);
}

export async function cancelAppointment(form) {
  const client = await clientForConsultant();
  const { data, error } = await client.from("consultant_appointments")
    .update({ cancelled: true }).eq("id", form.get("id")).eq("cancelled", false).select("id").maybeSingle();
  finish(error || !data ? "error" : "cancelled", form.get("day"));
}
