"use server";

import { availableSharedOrder } from "../../../../lib/crm/host-public";
import { meetingPromoCode } from "../../../../lib/crm/meeting-promo.mjs";

export async function checkMeetingPromo(token, input) {
  const code = meetingPromoCode(input);
  if (!code || typeof token !== "string") return null;
  const link = await availableSharedOrder(token);
  if (link?.session?.kind !== "meeting") return null;
  const { data, error } = await link.db.rpc("preview_crm_meeting_promo", { invite: token, promo_code: code });
  return error || !Number.isInteger(data) ? null : { code, amount: data };
}
