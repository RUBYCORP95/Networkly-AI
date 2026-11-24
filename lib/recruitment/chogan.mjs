// Plan de carrière Chogan, édition française, pages 4–5, 9, 11 et 22.
export const choganPlanUrl = "https://belluxa.fr/documents-chogan/plan-carriere-chogan.pdf";
export const choganPointValueCents = 100;

export const choganTiers = [
  ["Partner", 500, 400, 100, 2, 300],
  ["Junior Leader", 1500, 800, 100, 2, 1000],
  ["Senior Leader", 3500, 1200, 150, 3, 1500],
  ["Team Leader", 7000, 1600, 150, 3, 3000],
  ["Amethyst", 15000, 2300, 250, 3, 5500],
  ["Onyx", 25000, 2500, 250, 3, 9000],
  ["Sapphire", 50000, 2600, 250, 3, 18000],
  ["Emerald", 100000, 2800, 250, 5, 20000],
  ["Ruby", 200000, 2950, 250, 5, 40000],
  ["Diamond", 400000, 3050, 250, 5, 80000],
  ["Manager", 800000, 3250, 250, 5, 160000],
  ["Senior Manager", 1600000, 3350, 250, 5, 320000],
  ["World Manager", 3500000, 3400, 250, 5, 700000],
  ["Top Manager", 7000000, 3450, 250, 5, 1400000],
  ["President", 15000000, 3500, 250, 5, 3000000],
].map(([label, points, bps, personalPoints, consultants, branchCap]) => ({
  label, points, bps, personalPoints, consultants, branchCap, personalCap: 900,
  commissionMinConsultants: 2, ...(bps <= 1600 && { solo: true }),
}));
