export const audiences = { tous: "Sans préférence", homme: "Homme", femme: "Femme", mixte: "Mixte" };
export const levels = { tete: "Tête", coeur: "Cœur", fond: "Fond" };
export const catalogueFields = "reference,nom,inspiration,public_cible,famille,tete,coeur,fond,source,source_page,publie";

export function normalize(value) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
    .replace(/œ/g, "oe").replace(/[’‘]/g, "'").replace(/[-\s]+/g, " ").trim();
}

export function findPerfumes(catalogue, query) {
  const term = normalize(query);
  if (!term) return catalogue;
  const reference = term.match(/^(?:n[°ºo]\s*)?0*(\d+)([mwu])?$/);
  if (reference) {
    const [, number, suffix = ""] = reference;
    const code = number.padStart(3, "0") + suffix.toUpperCase();
    const exact = catalogue.filter(perfume => perfume.reference === code ||
      (!suffix && perfume.reference.slice(0, -1) === code));
    if (exact.length) return exact;
    return catalogue.filter(perfume => perfume.reference.startsWith(code));
  }
  const words = term.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return catalogue.filter(perfume => {
    const searchable = normalize([perfume.nom, perfume.inspiration, perfume.famille].join(" "));
    return words.length > 0 && words.every(word => searchable.includes(word));
  });
}

export function rankPerfumes(catalogue, audience, preferences) {
  const wanted = new Map(preferences.map(note => [normalize(note), note]));
  if (!wanted.size) return [];
  return catalogue.filter(perfume => audience === "tous" || perfume.public_cible === audience)
    .map(perfume => {
      const matches = [...wanted].flatMap(([key, note]) => {
        const stages = Object.keys(levels).filter(stage => perfume[stage].some(item => normalize(item) === key));
        return stages.length ? [{ note, stages }] : [];
      });
      return {
        perfume, matches, score: Math.round(100 * matches.length / wanted.size),
        missing: [...wanted.values()].filter(note => !matches.some(match => match.note === note)),
      };
    })
    .filter(result => result.matches.length)
    .sort((a, b) => b.score - a.score || a.perfume.reference.localeCompare(b.perfume.reference, "fr", { numeric: true }));
}

export function whatsappLink(perfume) {
  const message = [
    `Olfazeta · ${perfume.nom} (réf. ${perfume.reference})`,
    `Famille olfactive · ${perfume.famille}`,
    ...Object.entries(levels).map(([stage, label]) => `${label} · ${perfume[stage].join(", ") || "Non documenté"}`),
  ];
  return `https://wa.me/?text=${encodeURIComponent(message.join("\n"))}`;
}
