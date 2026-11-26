import assert from "node:assert/strict";
import test from "node:test";
import { isBirthday, nextBirthday } from "../lib/crm/dates.mjs";
import { readPublicCustomer } from "../lib/crm/public-customer.mjs";

test("a birthday can omit the year and still recur annually", () => {
  const today = "2026-06-16";
  assert.equal(isBirthday("06-15", today), true);
  assert.equal(nextBirthday("06-15", today), "2027-06-15");
  assert.equal(nextBirthday("1985-06-15", today), "2027-06-15");
  assert.equal(isBirthday("02-29", today), true);
  assert.equal(nextBirthday("02-29", today), "2027-02-28");
});

test("birthdays require a valid day and month and reject a future full date", () => {
  const today = "2026-06-16";
  for (const birthday of ["", "06", "04-31", "2001-02-29", "2026-06-17"]) {
    assert.equal(isBirthday(birthday, today), false, birthday);
  }
  assert.equal(isBirthday("1985-06-15", today), true);
});

test("public registration passes an incomplete birthday to Supabase without a year", () => {
  const form = new FormData();
  form.set("first_name", "Alice");
  form.set("last_name", "Dupont");
  form.set("customer_email", "alice@example.com");
  form.set("consent", "on");
  form.set("customer_birth", "06-15");
  assert.equal(readPublicCustomer(form)?.customer_birthday, "06-15");
  form.set("customer_birth", "1985-06-15");
  assert.equal(readPublicCustomer(form)?.customer_birthday, "1985-06-15");
  form.set("customer_birth", "06-31");
  assert.equal(readPublicCustomer(form), null);
  form.delete("customer_birth");
  assert.equal(readPublicCustomer(form), null);
});
