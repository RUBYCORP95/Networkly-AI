import { giftProgress } from "./hosts.mjs";

export async function loadHostRewards(db, owner, sessionId) {
  const [sales, gifts] = await Promise.all([
    db.from("crm_host_sales").select("paid_cents").eq("owner_id", owner).eq("session_id", sessionId).maybeSingle(),
    db.from("crm_host_gifts").select("label,threshold_cents,delivered_at")
      .eq("owner_id", owner).eq("session_id", sessionId).order("threshold_cents"),
  ]);
  return {
    error: sales.error || gifts.error,
    rewards: giftProgress(gifts.data ?? [], sales.data?.paid_cents ?? 0).filter(gift => gift.state !== "pending"),
  };
}

export function rewardLabel(reward) {
  return reward.label + (reward.state === "delivered" ? " · Déjà remis" : " · À remettre à l’hôte");
}
