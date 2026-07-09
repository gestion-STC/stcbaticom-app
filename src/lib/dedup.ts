// Dédoublonnage à l'import — logique pure, isolée ici pour être testable.
//
// Règle métier : on écarte une ligne SEULEMENT si la même identité
// (même téléphone ET même nom d'agence) est déjà présente. Ainsi deux
// gestionnaires différents qui partagent le standard d'une même agence
// sont TOUS LES DEUX conservés (on ne dédoublonne pas sur l'agence seule).

export type IdentiteProspect = { telephone: string; entreprise: string }

// Ne garde que les chiffres d'un numéro (ignore espaces, points, +33…).
export function normaliserTel(t: string): string {
  return (t || "").replace(/\D/g, "")
}

// Clé d'unicité : "chiffres du tel|nom d'agence en minuscules".
// Renvoie "" si pas de téléphone → une ligne sans numéro n'est JAMAIS
// considérée comme doublon (on préfère garder que perdre).
export function cleDoublon(p: IdentiteProspect): string {
  const t = normaliserTel(p.telephone)
  return t ? t + "|" + (p.entreprise || "").trim().toLowerCase() : ""
}

// Filtre `nouveaux` en retirant ceux déjà présents dans `existants`
// (et les doublons internes au lot importé). Conserve l'ordre d'arrivée.
export function filtrerSansDoublons<T extends IdentiteProspect>(
  existants: IdentiteProspect[],
  nouveaux: T[],
): T[] {
  const vus = new Set(existants.map(cleDoublon).filter(Boolean))
  const aGarder: T[] = []
  for (const p of nouveaux) {
    const k = cleDoublon(p)
    if (k && vus.has(k)) continue // vrai doublon (même n° + même agence) → ignoré
    if (k) vus.add(k)
    aGarder.push(p)
  }
  return aGarder
}
