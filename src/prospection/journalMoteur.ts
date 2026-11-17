// La lecture du journal du moteur (17/11/2026) : chaque passage dit, en clair, ce qui s'est passé pour une campagne. Fichier PUR.

type Campagne = { id?: string; creneau?: string; parJour?: number; contacts?: number; autorises?: number; adressesRefusees?: number; entrees?: number; envois?: number; sorties?: number; taches?: number; reportes?: Record<string, number>; erreurs?: Record<string, number>; sautes?: Record<string, number>; miseEnPause?: string }
type Passage = { le: string; erreur?: string; bilan?: Record<string, unknown>; campagnes?: Campagne[] }
export type LigneJournal = { le: string; heure: string; texte: string; niveau: "info" | "attention" | "erreur"; important: boolean }

const liste = (o: Record<string, number> | undefined) => Object.entries(o ?? {}).map(([k, n]) => (n > 1 ? `${n} × ${k}` : k)).join(", ")

export function lignesJournal(valeur: string | null | undefined, campagneId: string): LigneJournal[] {
  let passages: Passage[]
  try { const l = JSON.parse(valeur || "[]"); passages = Array.isArray(l) ? l : [] } catch { passages = [] }
  const out: LigneJournal[] = []
  for (const p of passages) {
    const heure = new Date(p.le).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })
    if (p.erreur) { out.push({ le: p.le, heure, texte: `Passage en erreur : ${p.erreur}`, niveau: "erreur", important: true }); continue }
    const c = p.campagnes?.find((x) => x.id === campagneId)
    if (!c) continue
    const morceaux: string[] = []
    let niveau: LigneJournal["niveau"] = "info"
    if (c.miseEnPause) { morceaux.push(`Mise en pause automatique : ${c.miseEnPause}`); niveau = "erreur" }
    if (c.envois || c.entrees) morceaux.push(`${c.envois ?? 0} envoi${(c.envois ?? 0) > 1 ? "s" : ""}, ${c.entrees ?? 0} nouvelle${(c.entrees ?? 0) > 1 ? "s" : ""} entrée${(c.entrees ?? 0) > 1 ? "s" : ""}`)
    if (c.sorties) morceaux.push(`${c.sorties} sortie${c.sorties > 1 ? "s" : ""} de séquence`)
    if (c.taches) morceaux.push(`${c.taches} tâche${c.taches > 1 ? "s" : ""} d'appel`)
    if (c.adressesRefusees) morceaux.push(`${c.adressesRefusees} adresse${c.adressesRefusees > 1 ? "s" : ""} refusée${c.adressesRefusees > 1 ? "s" : ""} à la vérification`)
    if (Object.keys(c.reportes ?? {}).length) { morceaux.push(`Reportés : ${liste(c.reportes)}`); if (niveau === "info") niveau = "attention" }
    if (Object.keys(c.sautes ?? {}).length) morceaux.push(`Sautés : ${liste(c.sautes)}`)
    if (Object.keys(c.erreurs ?? {}).length) { morceaux.push(`Erreurs : ${liste(c.erreurs)}`); niveau = "erreur" }
    const important = morceaux.length > 0
    if (!morceaux.length) morceaux.push(c.creneau === "fermé" ? "Hors créneau d'envoi : rien à faire." : c.autorises === 0 ? "Créneau ouvert, mais personne de nouveau à faire entrer (audience épuisée ou exclue)." : "Créneau ouvert, rien d'autre à envoyer à ce passage.")
    out.push({ le: p.le, heure, texte: morceaux.join(" · "), niveau, important })
  }
  return out
}
