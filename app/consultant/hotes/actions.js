"use server";

import { redirect } from "next/navigation";
import { requireConsultant } from "../../../lib/auth/consultant";
import { createServerSupabase } from "../../../lib/supabase/server";
import { isDate } from "../../../lib/crm/dates.mjs";
import { hostKinds, hostStatuses, hostUuid, meetingDeliveryModes } from "../../../lib/crm/hosts.mjs";
import { parseCents } from "../../../lib/crm/money.mjs";

const root = "/consultant/hotes";
const field = (form, key) => String(form.get(key) ?? "").trim();
function finish(kind, id, result) {
  const params = new URLSearchParams({ type: kind, result });
  if (id) params.set("session", id);
  redirect(root + "?" + params);
}

async function context() {
  const db = await createServerSupabase();
  const access = await requireConsultant(db);
  if (!access.ok) redirect(access.status === 401 ? "/login?next=/consultant/hotes" : "/");
  return { db, owner: access.user.id };
}

async function ownedSession(db, owner, id) {
  if (!hostUuid.test(id)) return null;
  const { data } = await db.from("crm_host_sessions").select("id,kind,status").eq("id", id).eq("owner_id", owner).maybeSingle();
  return data;
}

export async function saveHost(form) {
  const { db, owner } = await context();
  const id = field(form, "session_id");
  const existing = id ? await ownedSession(db, owner, id) : null;
  const kind = existing?.kind ?? field(form, "kind");
  if ((id && !existing) || !Object.hasOwn(hostKinds, kind)) finish("meeting", null, "invalid");
  const host_client_id = field(form, "host_client_id") || null;
  if (host_client_id && !hostUuid.test(host_client_id)) finish(kind, existing?.id, "invalid");
  const host_name = field(form, "host_name");
  const starts_on = field(form, "starts_on");
  const ends_on = kind === "case" ? field(form, "ends_on") : null;
  const venue = kind === "meeting" ? field(form, "venue") : null;
  const delivery_mode = kind === "meeting" ? field(form, "delivery_mode") : null;
  const delivery_address = delivery_mode === "grouped" ? field(form, "delivery_address") || null : null;
  const guests = kind === "meeting" ? field(form, "guests") : null;
  const status = field(form, "status");
  const shipping_cents = parseCents(field(form, "shipping")) ?? 0;
  if (!host_name || host_name.length > 120 || !isDate(starts_on) || !Object.hasOwn(hostStatuses, status) ||
      !Number.isInteger(shipping_cents) || (kind === "case" && (!isDate(ends_on) || ends_on < starts_on)) ||
      (kind === "meeting" && (!venue || venue.length > 240 || guests.length > 4000 || !Object.hasOwn(meetingDeliveryModes, delivery_mode))) ||
      (delivery_address && (delivery_address.length < 5 || delivery_address.length > 500))) finish(kind, existing?.id, "invalid");
  if (kind === "meeting" && status === "closed" && existing?.status !== "closed") finish(kind, id, "review-required");
  const values = { host_client_id, host_name, starts_on, ends_on, venue, guests, status, shipping_cents, delivery_mode, delivery_address };
  const table = db.from("crm_host_sessions");
  const query = existing ? table.update(values).eq("id", id).eq("owner_id", owner) : table.insert({ ...values, kind });
  const { data, error } = await query.select("id").single();
  finish(kind, data?.id ?? existing?.id, error?.code === "P0001" ? "delivery-locked" : error ? "error" : "saved");
}

export async function manageGift(form) {
  const { db, owner } = await context();
  const session = await ownedSession(db, owner, field(form, "session_id"));
  if (!session) finish("meeting", null, "invalid");
  const operation = field(form, "operation");
  const table = db.from("crm_host_gifts");
  let query;
  if (operation === "add") {
    const label = field(form, "label");
    const threshold_cents = parseCents(field(form, "threshold"));
    if (!label || label.length > 160 || !Number.isInteger(threshold_cents) || threshold_cents <= 0) finish(session.kind, session.id, "invalid");
    query = table.insert({ session_id: session.id, threshold_cents, label });
  } else {
    const id = field(form, "gift_id");
    if (!hostUuid.test(id) || !["deliver", "remove"].includes(operation)) finish(session.kind, session.id, "invalid");
    query = (operation === "deliver" ? table.update({ delivered_at: new Date().toISOString() }) : table.delete())
      .eq("id", id).eq("session_id", session.id).eq("owner_id", owner).is("delivered_at", null);
  }
  const { error, data } = await query.select("id").maybeSingle();
  finish(session.kind, session.id, error?.code === "23505" ? "duplicate-gift" : error?.code === "P0001" ? "threshold" : error || !data ? "error" : "saved");
}

export async function attachOrder(form) {
  const { db, owner } = await context();
  const session = await ownedSession(db, owner, field(form, "session_id"));
  const order = field(form, "order_id");
  if (!session) finish("meeting", null, "invalid");
  if (!hostUuid.test(order)) finish(session.kind, session.id, "invalid");
  const { data, error } = await db.from("crm_orders").update({ host_session_id: session.id })
    .eq("owner_id", owner).eq("id", order).is("host_session_id", null).select("id").maybeSingle();
  finish(session.kind, session.id, !error && data ? "saved" : "unavailable-order");
}

export async function reviewMeetingOrder(form) {
  const { db } = await context();
  const meeting = field(form, "session_id");
  const order = field(form, "order_id");
  const payment = field(form, "payment");
  const destination = field(form, "delivery_address");
  if (!hostUuid.test(meeting) || !hostUuid.test(order) || !["paid", "later"].includes(payment) ||
      (destination && (destination.length < 5 || destination.length > 500))) {
    finish("meeting", hostUuid.test(meeting) ? meeting : null, "invalid");
  }
  const { data, error } = await db.rpc("review_crm_meeting_order", { meeting, order_id: order, payment, destination: destination || null });
  finish("meeting", meeting, !error && data ? "payment-reviewed" : "error");
}

export async function closeMeeting(form) {
  const { db, owner } = await context();
  const id = field(form, "session_id");
  const delivery_mode = field(form, "delivery_mode");
  const delivery_address = delivery_mode === "grouped" ? field(form, "delivery_address") || null : null;
  if (!hostUuid.test(id) || !Object.hasOwn(meetingDeliveryModes, delivery_mode) ||
      (delivery_address && (delivery_address.length < 5 || delivery_address.length > 500))) {
    finish("meeting", hostUuid.test(id) ? id : null, "invalid");
  }
  const { data, error } = await db.from("crm_host_sessions").update({ status: "closed", delivery_mode, delivery_address })
    .eq("owner_id", owner).eq("id", id).eq("kind", "meeting").in("status", ["active", "planned"]).select("id").maybeSingle();
  const reasons = {
    "Meeting orders require payment review": "review-required",
    "Meeting orders require delivery addresses": "addresses-required",
  };
  finish("meeting", id, error ? reasons[error.message] ?? "error" : data ? "meeting-closed" : "invalid");
}
