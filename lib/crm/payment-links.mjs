export const maxPaymentLinks = 8;
export const paymentLabelLimit = 50;
export const paymentUrlLimit = 500;

export function paymentLink(label, url) {
  if (typeof label !== "string" || typeof url !== "string") return null;
  label = label.trim();
  url = url.trim();
  if (!label || label.length > paymentLabelLimit || !url || url.length > paymentUrlLimit ||
      /\p{C}/u.test(label + url)) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    return { label, url: parsed.href };
  } catch {
    return null;
  }
}

export function paymentLinksFromForm(form) {
  const names = form.getAll("payment_label");
  const urls = form.getAll("payment_url");
  if (names.length !== urls.length || names.length > maxPaymentLinks) return null;
  const links = [];
  for (const [i, name] of names.entries()) {
    const url = urls[i];
    if (typeof name !== "string" || typeof url !== "string") return null;
    if (!name.trim() && !url.trim()) continue;
    const entry = paymentLink(name, url);
    if (!entry) return null;
    links.push(entry);
  }
  return links;
}

export function publicPaymentLinks(links) {
  return Array.isArray(links) ? links.slice(0, maxPaymentLinks)
    .map(entry => paymentLink(entry?.label, entry?.url)).filter(Boolean) : [];
}
