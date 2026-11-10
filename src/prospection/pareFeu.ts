// LE PARE-FEU DES CAMPAGNES (Mahdi, 10/11/2026 : « il ne faut pas que plusieurs bases soient dans plusieurs campagnes en
// même temps, sinon on va cramer les numéros »). Une même personne, reconnue à son mail ou à son numéro, quelle que soit
// sa base, n'est sollicitée que par une campagne à la fois. Copie exacte côté serveur, vérifiée par un test. Fichier PUR.

export type Coordonnees = { id: string; email: string; mobile: string; telephone: string }

function numero(s: string): string {
  const c = s.replace(/\D/g, "")
  const n = c.startsWith("0033") ? `0${c.slice(4)}` : c.startsWith("33") && c.length === 11 ? `0${c.slice(2)}` : c
  return n.length >= 9 ? n : ""
}

/** Ce qui identifie une personne : son mail et ses numéros. */
export function clesContact(k: Omit<Coordonnees, "id">): string[] {
  const mail = k.email.trim().toLowerCase()
  return [mail ? `m:${mail}` : "", ...[k.mobile, k.telephone].map((t) => { const n = numero(t); return n ? `t:${n}` : "" })].filter(Boolean)
}

/**
 * Retire des candidats ceux qui sont déjà sollicités ailleurs, et les doublons entre eux.
 * `dejaDedans` : les contacts déjà inscrits dans CETTE campagne, qui continuent leur séquence.
 */
export function sansDejaSollicites<T extends Coordonnees>(candidats: T[], dejaDedans: ReadonlySet<string>, actifs: Coordonnees[]): T[] {
  const prises = new Set(actifs.filter((k) => !dejaDedans.has(k.id)).flatMap(clesContact))
  const gardes: T[] = []
  for (const k of candidats) {
    if (dejaDedans.has(k.id)) { gardes.push(k); continue }
    const cles = clesContact(k)
    if (cles.some((c) => prises.has(c))) continue
    cles.forEach((c) => prises.add(c))
    gardes.push(k)
  }
  return gardes
}
