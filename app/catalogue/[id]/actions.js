"use server";

import { hostUuid } from "../../../lib/crm/hosts.mjs";
import { meetingPromoCode } from "../../../lib/crm/meeting-promo.mjs";
import { readPublicCustomer } from "../../../lib/crm/public-customer.mjs";
import { createAdminSupabase } from "../../../lib/supabase/admin";
import { readCart } from "../../../lib/public-catalogue/model.mjs";

const messages = {
  catalogue: "Ce catalogue est indisponible.",
  context: "La réunion ou la mallette n’est plus disponible.",
  cart: "Vérifiez les articles et quantités de votre panier. Un article a pu devenir indisponible.",
  promo: "Ce code promo n'est pas disponible.",
  delivery: "Vérifiez votre mode et votre adresse de livraison.",
  price: "Le montant a changé. Recalculez le total avant d’envoyer la commande.",
};

export async function catalogueCheckout(id, token, input, form) {
  const cart = readCart(input?.cart);
  if (typeof id !== "string" || !hostUuid.test(id) ||
      (token !== null && (typeof token !== "string" || !hostUuid.test(token))) || !cart) {
    return { error: messages.cart };
  }
  const rawCode = typeof input.code === "string" ? input.code.trim() : "";
  const code = rawCode ? meetingPromoCode(rawCode) : "";
  if (code === null) return { error: messages.promo };
  const mode = ["grouped", "individual"].includes(input.mode) ? input.mode : null;
  const customer = form instanceof FormData ? readPublicCustomer(form) : null;
  const destination = form instanceof FormData ? String(form.get("destination") ?? "").trim() : null;
  if (form !== undefined && (!customer || typeof input.submission !== "string" || !hostUuid.test(input.submission) ||
      !Number.isSafeInteger(input.total) || input.total < 0 || input.total > 199999998)) {
    return { error: "Vérifiez vos coordonnées et le total de la commande." };
  }
  if (destination && destination.length > 500) return { error: messages.delivery };

  const { data, error } = await createAdminSupabase().rpc("checkout_public_catalogue", {
    catalogue: id, context_token: token, cart, code_input: code, mode_input: mode,
    submission: customer ? input.submission : null, expected_total: customer ? input.total : null,
    customer_data: customer, destination,
  });
  if (error || !data) return { error: "La commande n’a pas pu être traitée. Réessayez ou contactez votre consultant." };
  return data.error ? { error: messages[data.error] } : data;
}
