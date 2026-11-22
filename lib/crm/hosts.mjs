import { isDate } from "./dates.mjs";

export const hostKinds = { meeting: "Hôte réunion", case: "Hôte mallette" };
export const meetingDeliveryModes = { grouped: "Livraison groupée chez l’hôte", individual: "Livraison au domicile de chaque client" };
export const hostStatuses = { planned: "Prévue", active: "Active", closed: "Clôturée", cancelled: "Annulée" };
export const hostCaseStatuses = { ...hostStatuses, active: "Remise", closed: "Retournée" };
export const hostUuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function hostLinkActive(session, date) {
  return session.status === "active" &&
    (session.kind === "meeting" || (isDate(date) && date >= session.starts_on && date <= session.ends_on));
}

export function giftProgress(gifts, cents) {
  return gifts.map(gift => ({
    ...gift, remaining: Math.max(0, gift.threshold_cents - cents),
    state: gift.delivered_at ? "delivered" : cents >= gift.threshold_cents ? "available" : "pending",
  }));
}

export function meetingOrderReviewed(order) {
  return Boolean(order.meeting_reviewed_at) && ["paid", "later"].includes(order.payment_status);
}

export function meetingShippingRate(session, mode) {
  if (mode === "individual") return session.individual_shipping_cents ?? session.shipping_cents;
  return session.grouped_shipping_cents ?? (session.delivery_mode === "individual" ? 0 : session.shipping_cents);
}

export function meetingOrderDeliveryMode(order, session) {
  return order.meeting_delivery_mode ?? session.delivery_mode;
}
