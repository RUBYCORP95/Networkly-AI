export const demoSettings = Object.freeze({
  birthDate: "1990-05-24",
  delayDays: 30,
  notification: true,
});

export function parisDate(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(now);
}

export function isDate(value) {
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function afterDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function nextBirthday(birthDate, today) {
  const monthDay = birthDate.slice(5);
  const occurrence = year => {
    const date = year + "-" + monthDay;
    return isDate(date) ? date : year + "-02-28";
  };
  const year = Number(today.slice(0, 4));
  const date = occurrence(year);
  return date >= today ? date : occurrence(year + 1);
}

export function formatDate(date) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(date));
}
