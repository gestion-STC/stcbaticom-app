// LA FORMATION DES SOUS-TRAITANTS (Mahdi, 10/11/2026) : les règles et le tirage des questions.
// Copie exacte côté serveur (_shared/formationST.ts), vérifiée par un test. Fichier PUR.

export type ReglesFormation = { questions: number; seuil: number; essais: number; attente: number; inedites: boolean; desordre: boolean; bloque: boolean; derogation: boolean }
// « bloque » reste coupé tant que la formation complète n'est pas livrée : « Accepté » ne doit pas se retrouver bloqué sans raison.
export const REGLES_DEPART: ReglesFormation = { questions: 20, seuil: 80, essais: 3, attente: 24, inedites: true, desordre: true, bloque: false, derogation: true }
export const regles = (r: Partial<ReglesFormation> | null | undefined): ReglesFormation => ({ ...REGLES_DEPART, ...(r ?? {}) })

export type EtatFormation = "a_envoyer" | "envoye" | "en_cours" | "reussi" | "a_refaire"
export const LIBELLE_ETAT: Record<EtatFormation, string> = { a_envoyer: "À envoyer", envoye: "Lien envoyé", en_cours: "En cours", reussi: "Réussie", a_refaire: "À refaire" }

export type QuestionBanque = { id: string; theme: string; actif: boolean }

/** Mélange équitable : `alea` est injecté pour que le test soit reproductible. */
export function melanger<T>(l: T[], alea: () => number = Math.random): T[] {
  const x = [...l]
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(alea() * (i + 1)); [x[i], x[j]] = [x[j], x[i]] }
  return x
}

/** Un thème après l'autre, pour que le tirage couvre tout le logiciel. */
function repartir<T extends QuestionBanque>(l: T[], n: number, alea: () => number): T[] {
  const parTheme = new Map<string, T[]>()
  for (const q of melanger(l, alea)) parTheme.set(q.theme, [...(parTheme.get(q.theme) ?? []), q])
  const files = melanger([...parTheme.values()], alea), out: T[] = []
  while (out.length < n && files.some((f) => f.length)) for (const f of files) { const q = f.shift(); if (q && out.length < n) out.push(q) }
  return out
}

/** Le tirage : d'abord les questions jamais posées à ce sous-traitant, et seulement ensuite celles déjà vues. */
export function tirerQuestions<T extends QuestionBanque>(banque: T[], vues: string[], r: ReglesFormation, alea: () => number = Math.random): T[] {
  const actives = banque.filter((q) => q.actif)
  if (!r.inedites) return repartir(actives, r.questions, alea)
  const dejaVues = new Set(vues), inedites = actives.filter((q) => !dejaVues.has(q.id))
  const premieres = repartir(inedites, r.questions, alea)
  return premieres.length >= r.questions ? premieres : [...premieres, ...repartir(actives.filter((q) => dejaVues.has(q.id)), r.questions - premieres.length, alea)]
}

export const scoreSur = (bonnes: number, total: number) => (total ? Math.round((bonnes / total) * 100) : 0)

/** Peut-il recommencer ? Vide : oui. Sinon, la raison. */
export function blocageEssai(r: ReglesFormation, f: { essais: number; termineLe: string | null; etat: EtatFormation }, maintenant: Date): string {
  if (f.etat === "reussi") return "Formation déjà réussie."
  if (f.essais >= r.essais) return "Tu as utilisé tous tes essais. STC Bâtiment va te recontacter."
  if (f.termineLe && r.attente > 0) {
    const reste = new Date(f.termineLe).getTime() + r.attente * 3_600_000 - maintenant.getTime()
    if (reste > 0) return `Tu pourras refaire un essai dans ${Math.ceil(reste / 3_600_000)} h.`
  }
  return ""
}

/** La formation est-elle faite, du point de vue de la décision ? */
export function formationValide(r: ReglesFormation, f: { etat: EtatFormation; derogationLe: string | null } | null): boolean {
  return !r.bloque || f?.etat === "reussi" || Boolean(f?.derogationLe)
}
