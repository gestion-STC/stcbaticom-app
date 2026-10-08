// Les filtres de la page « Base d'artisans », sans le DOM ni la base : une
// fonction pure, testée dans baseFiltres.test.ts. L'écran ne fait que lui
// passer ce que l'utilisateur a tapé ou coché.
import type { SousTraitant, StatutST } from "../recrutement"
import { exerceCorps } from "./recrutementCalc"
import { normaliserTelephone } from "./importSousTraitants"

export type FiltresBase = {
  recherche: string // entreprise, contact, e-mail, téléphone, zone
  statut: StatutST | "" // "" = tous les statuts
  corps: string // "" = tous les corps de métier
  source: string // "" = toutes les sources
  avecErreur: boolean // au moins un envoi en erreur, ou une dernière erreur
  emailInvalide: boolean // adresse marquée injoignable par la machine
}

export const FILTRES_VIDES: FiltresBase = { recherche: "", statut: "", corps: "", source: "", avecErreur: false, emailInvalide: false }

/** Texte comparable : minuscules, sans accents, espaces réduits. */
const plat = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()

/** La fiche a-t-elle une erreur d'envoi à montrer ? */
export const aUneErreur = (f: SousTraitant) => (f.nbEnvoisErreur ?? 0) > 0 || !!(f.derniereErreur && f.derniereErreur.trim())

export function filtrerFiches(fiches: SousTraitant[], filtres: FiltresBase): SousTraitant[] {
  const texte = plat(filtres.recherche)
  // Une recherche faite de chiffres (avec espaces, points, +) vise un numéro :
  // on la compare au téléphone normalisé, pour trouver « 06 12 » comme « +33 6 12 ».
  const brut = filtres.recherche.trim()
  // Un début de numéro n'a pas ses 10 chiffres : on ramène nous-mêmes +33 / 0033 au 0.
  const chiffres = brut && /^[\d\s.+-]+$/.test(brut) ? brut.replace(/^(\+33|0033)/, "0").replace(/\D/g, "") : ""
  const source = plat(filtres.source)

  return fiches.filter((f) => {
    if (filtres.statut && f.statut !== filtres.statut) return false
    if (filtres.corps && !exerceCorps(f, filtres.corps)) return false
    if (source && plat(f.source) !== source) return false
    if (filtres.avecErreur && !aUneErreur(f)) return false
    if (filtres.emailInvalide && !f.emailInvalide) return false
    if (texte) {
      const meule = plat([f.entreprise, f.contact, f.email, f.telephone, f.zone].join(" "))
      const parTexte = meule.includes(texte)
      const parNumero = !!chiffres && normaliserTelephone(f.telephone).includes(chiffres)
      if (!parTexte && !parNumero) return false
    }
    return true
  })
}

/** Le nombre de fiches par statut, plus le total : la matière des compteurs. */
export function compterParStatut(fiches: SousTraitant[]): Record<StatutST | "tous", number> {
  const n: Record<StatutST | "tous", number> = { tous: fiches.length, a_contacter: 0, en_sequence: 0, depose: 0, termine: 0, desinscrit: 0, injoignable: 0, exclu: 0 }
  for (const f of fiches) if (f.statut in n) n[f.statut]++
  return n
}

/** Les sources présentes dans la base, triées, sans doublon ni vide. */
export function sourcesDistinctes(fiches: SousTraitant[]): string[] {
  const set = new Set<string>()
  for (const f of fiches) {
    const s = (f.source ?? "").trim()
    if (s) set.add(s)
  }
  return [...set].sort((a, b) => a.localeCompare(b, "fr"))
}
