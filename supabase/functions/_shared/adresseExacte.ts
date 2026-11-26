// L'ADRESSE E-MAIL EXACTE, SANS TENIR COMPTE DES MAJUSCULES (lot 1, 27/11/2026).
// Une recherche « ilike » lit « % » et « _ » comme des jokers (et PostgREST lit aussi « * » comme « % ») :
// « %@gmail.com » tapé dans un formulaire public trouvait une fiche gmail au hasard. Ici, ces caractères sont
// échappés ; une adresse qui contient « * » (que PostgREST transformerait quand même) est comparée telle quelle.
// Fichier PUR (aucun import) : supabase/tests/adresse-exacte.test.ts le lit.

/** Le filtre à poser sur la colonne e-mail : `ilike` échappé, ou `eq` en minuscules si l'adresse contient « * ». */
export function filtreAdresseExacte(email: string): { op: "ilike" | "eq"; valeur: string } {
  const adresse = String(email ?? "").trim().toLowerCase()
  if (adresse.includes("*")) return { op: "eq", valeur: adresse }
  return { op: "ilike", valeur: adresse.replace(/[\\%_]/g, (c) => "\\" + c) }
}
