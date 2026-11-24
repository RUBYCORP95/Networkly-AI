export const statuses = { active: "En cours", follow_up: "À relancer", registered: "Inscrit", archived: "Archivé" };
export const legal = "Les simulations présentées sont basées sur un barème indicatif. Elles ne constituent pas une garantie de revenus. Les résultats dépendent des ventes effectivement réalisées, de l'activité personnelle, des performances de l'équipe, des conditions du plan de rémunération Chogan et des charges applicables.";

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
export const money = cents => eur.format(cents / 100);
export const validSlug = slug => typeof slug === "string" && /^[a-f0-9]{32}$/.test(slug);

export function sales(quantity, settings) {
  return { monthly: quantity * settings.margin_cents, yearly: quantity * settings.margin_cents * 12, points: quantity * settings.points };
}

export function allocateBudget(monthly, expenses) {
  let remaining = monthly;
  const rows = expenses.map(expense => {
    const funded = Math.min(remaining, expense.cents);
    remaining -= funded;
    return { ...expense, funded };
  });
  return { rows, remaining };
}

export function teamEstimate(personalSales, teamSize, salesPerMember, settings) {
  const personal = sales(personalSales, settings);
  const memberPoints = salesPerMember * settings.points;
  const teamPoints = teamSize * memberPoints;
  const total = personal.points + teamPoints;
  const eligiblePersonal = (tier, points) => Math.min(points, tier.personalCap ?? Infinity);
  const qualifiedPoints = (tier, ownPoints, branches, branchPoints) =>
    eligiblePersonal(tier, ownPoints) + branches * Math.min(branchPoints, tier.branchCap ?? Infinity);
  const qualifiedBranches = (tier, ownPoints, branches) =>
    branches >= tier.consultants || (tier.solo === true && eligiblePersonal(tier, ownPoints) >= tier.points);
  const tierFor = (ownPoints, branches, branchPoints) => settings.tiers.findLast(tier =>
    qualifiedPoints(tier, ownPoints, branches, branchPoints) >= tier.points &&
    eligiblePersonal(tier, ownPoints) >= tier.personalPoints &&
    qualifiedBranches(tier, ownPoints, branches));
  const tier = tierFor(personal.points, teamSize, memberPoints);
  const next = settings.tiers.find(candidate => !tier || candidate.points > tier.points);
  const rate = tier?.bps ?? 0;
  const memberRate = settings.differential ? tierFor(memberPoints, 0, 0)?.bps ?? 0 : 0;
  const priced = settings.point_value_cents !== null && settings.tiers.length > 0;
  const ownPoints = tier ? eligiblePersonal(tier, personal.points) : personal.points;
  const teamRate = teamSize >= (tier?.commissionMinConsultants ?? 0) ? Math.max(0, rate - memberRate) : 0;
  const commissionOn = (points, basisPoints) => Math.round(settings.point_value_cents * points * basisPoints / 10000);
  const personalCommission = priced ? commissionOn(ownPoints, rate) : null;
  const teamCommission = priced ? commissionOn(teamPoints, teamRate) : null;
  return { personal, teamPoints, total, tier, next, memberRate, teamRate, personalCommission, teamCommission,
    commission: priced ? personalCommission + teamCommission : null,
    missingPoints: next ? Math.max(0, next.points - qualifiedPoints(next, personal.points, teamSize, memberPoints)) : 0,
    missingPersonal: next ? Math.max(0, next.personalPoints - eligiblePersonal(next, personal.points)) : 0,
    missingConsultants: next && !qualifiedBranches(next, personal.points, teamSize) ? next.consultants - teamSize : 0 };
}

export function integer(value, max) {
  if (!Number.isInteger(value) || value < 0 || value > max) throw new Error("Valeur numérique hors limites.");
  return value;
}

function label(value, limit, required = false) {
  if (typeof value !== "string" || value.trim().length > limit || (required && !value.trim())) {
    throw new Error("Vérifie les champs de texte.");
  }
  return value.trim();
}

export function httpsUrl(value) {
  const url = label(value, 1000);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" && !parsed.username && !parsed.password) return parsed.href;
  } catch {}
  throw new Error("Saisis une adresse HTTPS valide.");
}

const choganRegistration = "https://www.chogangroupspa.com/registration_consultant/";
const sponsorCode = /^[a-z0-9][a-z0-9_-]{0,99}$/i;

export function referralInput(value) {
  const address = value.replace(/^https:\/\//i, "");
  const registration = choganRegistration.slice("https://".length);
  if (address.toLowerCase().startsWith(registration)) {
    const code = address.slice(registration.length).replace(/\/$/, "");
    if (sponsorCode.test(code)) return code;
  }
  return address;
}

function referralUrl(value) {
  const url = label(value, 1000);
  if (!url) return "";
  if (sponsorCode.test(url)) return choganRegistration + url;
  if (/^https:\/\//i.test(url)) return httpsUrl(url);
  if (!/^[^\s/:?#@\\]+\.[^\s/:?#@\\]+(?::\d+)?(?:[/?#]|$)/.test(url)) {
    throw new Error("Saisis un code sponsor Chogan ou un lien de parrainage valide.");
  }
  return httpsUrl(`https://${url}`);
}

function expensesList(expenses) {
  if (!Array.isArray(expenses) || expenses.length > 12) throw new Error("12 dépenses maximum.");
  return expenses.map(item => ({ label: label(item.label, 80, true), cents: integer(item.cents, 10000000) }));
}

export function validateSettings(input) {
  if (!Array.isArray(input.tiers) || input.tiers.length > 30) throw new Error("30 paliers maximum.");
  const tiers = input.tiers.map(item => ({
    label: label(item.label, 80, true),
    points: integer(item.points, 100000000),
    personalPoints: integer(item.personalPoints, 1000000),
    consultants: integer(item.consultants, 1000),
    bps: integer(item.bps, 10000),
    ...(item.branchCap != null && { branchCap: integer(item.branchCap, 100000000) }),
    ...(item.personalCap != null && { personalCap: integer(item.personalCap, 1000000) }),
    ...(item.commissionMinConsultants != null && { commissionMinConsultants: integer(item.commissionMinConsultants, 1000) }),
    ...(item.solo === true && { solo: true }),
  })).sort((a, b) => a.points - b.points);
  if (tiers.some((tier, index) => index && (tier.points === tiers[index - 1].points || tier.bps < tiers[index - 1].bps))) {
    throw new Error("Utilise des seuils distincts et des taux croissants ou égaux.");
  }
  return {
    enabled: input.enabled === true,
    default_access: input.default_access === true,
    margin_cents: integer(input.margin_cents, 100000),
    points: integer(input.points, 1000),
    point_value_cents: input.point_value_cents === null ? null : integer(input.point_value_cents, 100000),
    differential: input.differential === true,
    tiers,
    expenses: expensesList(input.expenses),
    presentation: label(input.presentation, 3000, true),
    video_url: httpsUrl(input.video_url),
  };
}

export function validateSimulation(input) {
  const whatsapp = label(input.whatsapp, 30).replace(/[\s()+.-]/g, "");
  if (whatsapp && !/^[1-9]\d{7,14}$/.test(whatsapp)) throw new Error("Saisis le numéro WhatsApp au format international.");
  if (!Object.hasOwn(statuses, input.status)) throw new Error("Statut invalide.");
  return {
    first_name: label(input.first_name, 60, true),
    consultant_name: label(input.consultant_name, 100, true),
    ...(Object.hasOwn(input, "photo_url") && { photo_url: httpsUrl(input.photo_url) }),
    ...(Object.hasOwn(input, "video_url") && { video_url: httpsUrl(input.video_url) }),
    join_url: referralUrl(input.join_url),
    whatsapp,
    notes: label(input.notes, 5000),
    status: input.status,
    quantity: integer(input.quantity, 100),
    team_size: integer(input.team_size, 1000),
    per_member: integer(input.per_member, 100),
    personal_sales: integer(input.personal_sales, 100),
    expenses: expensesList(input.expenses),
  };
}
