// Plusieurs destinataires dans un seul champ (Mahdi, 08/10/2026 : « la
// gestionnaire m'a donné son e-mail et celui de sa collègue »).
//
// On accepte les séparateurs courants (virgule, point-virgule, espace, retour
// à la ligne) et la forme « Nom <adresse> ». Le résultat est en minuscules,
// sans doublon, dans l'ordre de saisie.

export const ADRESSE_EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/

export function decouperAdresses(texte: string): string[] {
  const vues = new Set<string>()
  const out: string[] = []
  const garder = (brut: string) => {
    const a = brut.trim().toLowerCase()
    if (!a || vues.has(a)) return
    vues.add(a)
    out.push(a)
  }
  // D'abord les formes « Nom <adresse> » (le nom peut contenir des espaces),
  // puis ce qui reste, découpé sur les séparateurs.
  const reste = (texte || "").replace(/[^<>,;]*<([^>]+)>/g, (_, a: string) => {
    garder(a)
    return " "
  })
  for (const brut of reste.split(/[\s,;]+/)) garder(brut)
  return out
}

// Les adresses qui n'en sont pas (pour les montrer en rouge avant l'envoi).
export function adressesInvalides(liste: string[]): string[] {
  return liste.filter((a) => !ADRESSE_EMAIL.test(a))
}

// Le texte du champ, propre : « a@x.fr, b@y.fr ».
export function joindreAdresses(liste: string[]): string {
  return liste.join(", ")
}
