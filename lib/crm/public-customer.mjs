import { isBirthday, parisDate } from "./dates.mjs";

export function readPublicCustomer(form) {
  const first_name = String(form.get("first_name") ?? "").trim();
  const last_name = String(form.get("last_name") ?? "").trim();
  const customer_email = String(form.get("customer_email") ?? "").trim().toLowerCase();
  const customer_phone = String(form.get("customer_phone") ?? "").trim();
  const customer_birthday = String(form.get("customer_birth") ?? "");
  if (!first_name || first_name.length > 60 || !last_name || last_name.length > 59 ||
      customer_email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email) ||
      customer_phone.length > 40 || !isBirthday(customer_birthday, parisDate()) ||
      (customer_birthday.length === 10 && customer_birthday < "1900-01-01") || form.get("consent") !== "on") return null;
  return { first_name, last_name, customer_email, customer_phone, customer_birthday };
}
