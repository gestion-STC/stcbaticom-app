// ════════════════════════════════════════════════════════════════════════════
// LE COCKPIT : LES CHIFFRES DE STC BÂTIMENT (26/11/2026, proposition 1 validée par le gérant).
// Fichier PUR (testé dans cockpitStc.test.ts). La passerelle `chiffres_pour_baticom` (STC Bâtiment) dépose ses
// chiffres BRUTS dans parametres.chiffres_stc chaque heure (synchro-clients) ; les règles sont appliquées ici.
//
// AGENCES — la règle validée (statutAgence, croissance.ts) appliquée À CHAQUE FIN DE MOIS, à partir des OS et du
// facturé jour par jour de chaque agence (agences[].os, agences[].factures) :
//   · active    = sur les 30 jours qui précèdent, ≥ 1 000 € facturés ET ≥ 2 OS ET pas en chute ;
//   · nouvelle  = active en fin de mois, jamais active à une fin de mois d'avant (dans l'historique reçu) ;
//   · revenue   = active en fin de mois, pas à la fin du mois d'avant, mais déjà active avant ;
//   · décrochée = active à la fin du mois d'avant, plus en fin de mois.
//   Le mois en cours est jugé « maintenant », avec les compteurs exacts de STC Bâtiment (os_30, os_30_60, facture_30) :
//   le même nombre d'agences actives que le prévisionnel.
//   Statut affiché : « À surveiller » = active mais silencieuse depuis plus de 2 fois son rythme habituel ;
//   « En chute » = les seuils sont atteints mais les OS ont chuté de moitié (pas active, comme la règle le dit).
//
// SOUS-TRAITANTS (définitions validées par le gérant le 26/11/2026) — une mission = une demande envoyée à l'artisan dans
// STC Bâtiment (table demandes, hors brouillon / retirée / refusée), datée de son envoi ; le compte d'essai « Adan »
// (and@gmail.com) est écarté par la passerelle :
//   · actif   = au moins 1 mission sur les 30 derniers jours ET compte STC ouvert ;
//   · nouveau = sa toute première mission tombe dans le mois ;
//   · revenu  = actif, inactif à la fin du mois d'avant, mais déjà missionné avant ;
//   · sorti   = actif à la fin du mois d'avant, plus rien depuis 30 jours (ou compte fermé depuis) ;
//   · « compte fermé » = une mission récente mais un compte fermé : affiché, pas compté actif.
//   STC ne garde pas la date de fermeture d'un compte : l'état du compte d'aujourd'hui vaut pour les fins de mois passées.
// ════════════════════════════════════════════════════════════════════════════
import { CHUTE_JUGEE_DES, statutAgence, type AgenceStc, type SeuilsActive } from "./croissance"

const JOUR = 86_400_000
export type SousTraitantStc = { nom: string; email?: string; compte_actif: boolean; metier?: string | null; secteurs?: string[]; cree_le?: string; missions: ([string, number] | string)[]; paye_30: number; paye_30_60: number }
/** Une agence telle que la passerelle étendue l'envoie (os et factures : absents tant que le SQL du 26/11 n'est pas collé). */
export type AgenceBrute = AgenceStc & { os?: string[]; factures?: [string, number][] }
export type ChiffresEtendus = {
  version: 2; calcule_le: string; mois: string[]; particuliers: number[]; agences: AgenceBrute[]
  ca_annee?: { mois: string; ht: number }[]; ca_jours?: [string, number][]; historique_depuis?: string; os_recents?: string[]; sous_traitants?: SousTraitantStc[]
}

/** Lit la passerelle ; null si rien n'est encore déposé (ou ancien format). */
export function lireChiffres(valeur: string | null): ChiffresEtendus | null {
  if (!valeur) return null
  try {
    const c = JSON.parse(valeur) as ChiffresEtendus
    return c && c.version === 2 && Array.isArray(c.agences) ? c : null
  } catch { return null }
}

/** Les sous-traitants de STC Bâtiment (e-mails, paiements, missions). Depuis le 26/11/2026 la synchro les range à part,
 *  dans parametres.chiffres_stc_st, que seuls les administrateurs lisent ; tant qu'elle n'est pas repassée, ils sont
 *  encore dans chiffres_stc. null : rien de lisible. */
export function lireSousTraitantsStc(valeurSt: string | null, brut: ChiffresEtendus | null): SousTraitantStc[] | null {
  if (valeurSt) {
    try {
      const l = JSON.parse(valeurSt) as unknown
      if (Array.isArray(l)) return l as SousTraitantStc[]
    } catch { /* l'ancien emplacement */ }
  }
  return brut?.sous_traitants ?? null
}

/** « AAAA-MM-JJ » à l'heure du poste (Paris). */
export const jourIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
export const moisIso = (d: Date) => jourIso(d).slice(0, 7)
const jourDe = (s: string) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)))

/** Les compteurs d'une agence sur les 30 jours (et les 30 d'avant) qui précèdent l'instant `t`. Le facturé se lit au jour. */
export function compteursA(a: Pick<AgenceBrute, "os" | "factures">, t: Date): { os_30: number; os_30_60: number; facture_30: number } {
  const ms = t.getTime()
  let os_30 = 0, os_30_60 = 0
  for (const o of a.os ?? []) {
    const x = new Date(o).getTime()
    if (x > ms) continue
    if (x > ms - 30 * JOUR) os_30++
    else if (x > ms - 60 * JOUR) os_30_60++
  }
  // Une facture du jour J compte si J tombe dans les 30 jours qui finissent à t (t exclu s'il est minuit pile).
  const fin = jourIso(new Date(ms - 1)), debut = jourIso(new Date(ms - 30 * JOUR))
  const facture_30 = (a.factures ?? []).reduce((s, [j, ht]) => (j >= debut && j <= fin ? s + Number(ht || 0) : s), 0)
  return { os_30, os_30_60, facture_30: Math.round(facture_30 * 100) / 100 }
}

/** Active à l'instant t, selon la règle validée. */
export const activeA = (a: AgenceBrute, t: Date, s: SeuilsActive): boolean => statutAgence({ ...a, ...compteursA(a, t), mois: [] }, s).active

/** Les fins de mois à juger : le 1er (minuit) du mois suivant, du mois `de` (AAAA-MM) au mois d'avant `maintenant`, puis maintenant. */
export function finsDeMois(deMois: string, maintenant: Date): { mois: string; fin: Date }[] {
  const out: { mois: string; fin: Date }[] = []
  let d = new Date(Number(deMois.slice(0, 4)), Number(deMois.slice(5, 7)) - 1, 1)
  const cour = moisIso(maintenant)
  while (moisIso(d) < cour) { const suivant = new Date(d.getFullYear(), d.getMonth() + 1, 1); out.push({ mois: moisIso(d), fin: suivant }); d = suivant }
  out.push({ mois: cour, fin: maintenant })
  return out
}

export type MoisMouvement = { mois: string; actives: number; nouvelles: string[]; revenues: string[]; decrochees: string[] }
/**
 * Les mouvements des agences actives, mois par mois. On juge chaque fin de mois dès que 60 jours d'historique sont
 * disponibles ; on rend les `n` derniers mois (le mois en cours compris, jugé maintenant avec `activesMaintenant`).
 */
export function mouvementsAgences(agences: AgenceBrute[], historiqueDepuis: string, maintenant: Date, s: SeuilsActive, activesMaintenant: ReadonlySet<string>, n = 6): { mois: MoisMouvement[]; dejaActives: Set<string> } {
  const h = jourDe(historiqueDepuis)
  const premierJugeable = new Date(h.getFullYear(), h.getMonth() + 2, 1) // 60 jours d'historique avant la fin
  const fins = finsDeMois(moisIso(new Date(premierJugeable.getFullYear(), premierJugeable.getMonth() - 1, 1)), maintenant)
  const etats = fins.map((f, i) => i === fins.length - 1 ? new Set(activesMaintenant) : new Set(agences.filter((a) => activeA(a, f.fin, s)).map((a) => a.nom)))
  const deja = new Set<string>()
  const mois: MoisMouvement[] = []
  etats.forEach((e, i) => {
    if (i > 0) {
      const avant = etats[i - 1]
      const entrees = [...e].filter((x) => !avant.has(x))
      mois.push({
        mois: fins[i].mois, actives: e.size,
        nouvelles: entrees.filter((x) => !deja.has(x)), revenues: entrees.filter((x) => deja.has(x)),
        decrochees: [...avant].filter((x) => !e.has(x)),
      })
    }
    e.forEach((x) => deja.add(x))
  })
  // « Déjà active » pour le statut « Décrochée » : active à une fin de mois d'AVANT le mois en cours.
  const dejaAvant = new Set<string>()
  etats.slice(0, -1).forEach((e) => e.forEach((x) => dejaAvant.add(x)))
  return { mois: mois.slice(-n), dejaActives: dejaAvant }
}

/** Le rythme : l'écart moyen entre deux OS sur les 90 derniers jours, en jours (null sous 2 OS). */
export function intervalleOs(os: string[], maintenant: Date): number | null {
  const t = os.map((o) => new Date(o).getTime()).filter((x) => x <= maintenant.getTime() && x > maintenant.getTime() - 90 * JOUR).sort((a, b) => a - b)
  if (t.length < 2) return null
  return Math.round(((t[t.length - 1] - t[0]) / (t.length - 1) / JOUR) * 10) / 10
}
/** Combien d'OS dans chacun des mois donnés (AAAA-MM). */
export const osParMois = (os: string[], mois: string[]): number[] => mois.map((m) => os.filter((o) => moisIso(new Date(o)) === m).length)

export type StatutCockpit = "surveiller" | "active" | "chute" | "decrochee" | "pas_active"
export type LigneAgenceCockpit = {
  nom: string; statut: StatutCockpit; pourquoi: string; os_30: number; os_30_60: number; os_90: number; facture_30: number
  dernierOsLe: string | null; joursSansOs: number | null; intervalle: number | null; osMois: number[]
}
const joursEntre = (de: Date, a: Date) => Math.round((new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime() - new Date(de.getFullYear(), de.getMonth(), de.getDate()).getTime()) / JOUR)

/** La liste de suivi des agences : statut, rythme, OS mois par mois. */
export function lignesAgences(agences: AgenceBrute[], s: SeuilsActive, dejaActives: ReadonlySet<string>, moisCourbe: string[], maintenant: Date): LigneAgenceCockpit[] {
  const ORDRE: StatutCockpit[] = ["surveiller", "active", "chute", "decrochee", "pas_active"]
  return agences.map((a) => {
    const st = statutAgence(a, s)
    const os = a.os ?? []
    const dernier = a.dernier_os_le ?? (os.length ? os[os.length - 1] : null)
    const joursSansOs = dernier ? joursEntre(new Date(dernier), maintenant) : null
    const intervalle = intervalleOs(os, maintenant)
    const os_90 = os.filter((o) => new Date(o).getTime() > maintenant.getTime() - 90 * JOUR && new Date(o).getTime() <= maintenant.getTime()).length
    const silencieuse = intervalle !== null && intervalle > 0 && joursSansOs !== null && joursSansOs > 2 * intervalle
    const seuilsOk = a.facture_30 >= s.factureMin && a.os_30 >= s.osMin
    const enChute = a.os_30_60 >= CHUTE_JUGEE_DES && a.os_30 < a.os_30_60 * (s.chutePct / 100)
    const statut: StatutCockpit = st.active ? (silencieuse ? "surveiller" : "active") : seuilsOk && enChute ? "chute" : dejaActives.has(a.nom) ? "decrochee" : "pas_active"
    const ryt = intervalle === null ? "" : String(intervalle).replace(".", ",")
    const pourquoi = statut === "surveiller" ? `${joursSansOs} jours sans OS, d'habitude un tous les ${ryt} jours`
      : statut === "active" ? `≥ ${s.factureMin.toLocaleString("fr-FR")} € facturés et ≥ ${s.osMin} OS sur 30 jours, pas en chute`
      : st.raison
    return { nom: a.nom, statut, pourquoi, os_30: a.os_30, os_30_60: a.os_30_60, os_90, facture_30: a.facture_30, dernierOsLe: dernier, joursSansOs, intervalle, osMois: osParMois(os, moisCourbe) }
  }).sort((x, y) => ORDRE.indexOf(x.statut) - ORDRE.indexOf(y.statut) || y.facture_30 - x.facture_30 || y.os_30 - x.os_30)
}

// ── Les OS reçus (toutes agences, avec ou sans gestionnaire) ──
const lundiDe = (d: Date) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
export type OsRecus = { semaines: { lundi: Date; n: number }[]; semaine: number; semaineAvant: number; jour: number; moyenneJourOuvre: number }
/**
 * Les OS par semaine (n semaines, la semaine en cours comprise), la semaine en cours comparée à la précédente À LA
 * MÊME HEURE (lundi 0 h → maintenant − 7 jours), ceux du jour, la moyenne par jour ouvré des 4 dernières semaines closes.
 */
export function osRecus(os: string[], maintenant: Date, n = 12): OsRecus {
  const l = lundiDe(maintenant)
  const lundis = Array.from({ length: n }, (_, i) => new Date(l.getFullYear(), l.getMonth(), l.getDate() - 7 * (n - 1 - i)))
  const t = os.map((o) => new Date(o).getTime()).filter((x) => x <= maintenant.getTime())
  const entre = (a: number, b: number) => t.filter((x) => x >= a && x < b).length
  const semaines = lundis.map((d, i) => ({ lundi: d, n: entre(d.getTime(), i + 1 < lundis.length ? lundis[i + 1].getTime() : maintenant.getTime() + 1) }))
  const lAvant = new Date(l.getFullYear(), l.getMonth(), l.getDate() - 7)
  const debutJour = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate()).getTime()
  const closes = semaines.slice(-5, -1) // les 4 dernières semaines closes
  const totalCloses = closes.reduce((x, s) => x + s.n, 0)
  return {
    semaines, semaine: semaines[semaines.length - 1].n,
    semaineAvant: entre(lAvant.getTime(), maintenant.getTime() - 7 * JOUR + 1),
    jour: entre(debutJour, maintenant.getTime() + 1),
    moyenneJourOuvre: closes.length ? totalCloses / (closes.length * 5) : 0,
  }
}

// ── Le chiffre d'affaires ──
/** Le facturé du mois en cours et celui du mois d'avant SUR LES MÊMES JOURS (du 1er au même quantième). */
export function caMoisCompare(caJours: [string, number][], maintenant: Date): { mois: number; avantMemesJours: number; jusquAu: number } {
  const debut = jourIso(new Date(maintenant.getFullYear(), maintenant.getMonth(), 1)), fin = jourIso(maintenant)
  const finMoisAvant = new Date(maintenant.getFullYear(), maintenant.getMonth(), 0)
  const q = Math.min(maintenant.getDate(), finMoisAvant.getDate())
  const debutAvant = jourIso(new Date(finMoisAvant.getFullYear(), finMoisAvant.getMonth(), 1)), finAvant = jourIso(new Date(finMoisAvant.getFullYear(), finMoisAvant.getMonth(), q))
  let mois = 0, avant = 0
  for (const [j, ht] of caJours) {
    if (j >= debut && j <= fin) mois += Number(ht || 0)
    else if (j >= debutAvant && j <= finAvant) avant += Number(ht || 0)
  }
  return { mois: Math.round(mois * 100) / 100, avantMemesJours: Math.round(avant * 100) / 100, jusquAu: q }
}

// ── Les sous-traitants ──
const missionsDe = (st: SousTraitantStc): [string, number][] => (st.missions ?? []).map((m) => (Array.isArray(m) ? [String(m[0]), Number(m[1]) || 0] : [String(m), 0]) as [string, number]).sort((x, y) => x[0].localeCompare(y[0]))
/** Les missions des 30 jours qui précèdent t (décalées de `decalage` jours) : la mission du jour J compte si J ∈ ]t − 30 j ; t]. */
function missionsA(m: [string, number][], t: Date, decalage = 0): { n: number; montant: number } {
  const fin = jourIso(new Date(t.getTime() - 1 - decalage * JOUR)), debut = jourIso(new Date(t.getTime() - (30 + decalage) * JOUR))
  const l = m.filter(([j]) => j >= debut && j <= fin)
  return { n: l.length, montant: Math.round(l.reduce((s, [, x]) => s + x, 0) * 100) / 100 }
}
/** Actif à l'instant t : au moins une mission sur 30 jours ET compte ouvert. */
export const stActifA = (st: SousTraitantStc, t: Date) => st.compte_actif && missionsA(missionsDe(st), t).n > 0

export type MoisSt = { mois: string; actifs: number; nouveaux: string[]; revenus: string[]; sortis: string[] }
/** Les mouvements des sous-traitants mois par mois (n derniers mois, le mois en cours jugé maintenant). */
export function mouvementsSt(sts: SousTraitantStc[], maintenant: Date, n = 6): MoisSt[] {
  const fins = finsDeMois(moisIso(new Date(maintenant.getFullYear(), maintenant.getMonth() - n, 1)), maintenant)
  const etats = fins.map((f) => new Set(sts.filter((s) => stActifA(s, f.fin)).map((s) => s.nom)))
  const premiere = new Map(sts.map((s) => [s.nom, missionsDe(s)[0]?.[0] ?? null]))
  return fins.slice(1).map((f, k) => {
    const e = etats[k + 1], avant = etats[k]
    const entrees = [...e].filter((x) => !avant.has(x))
    return {
      mois: f.mois, actifs: e.size,
      nouveaux: [...e].filter((x) => premiere.get(x)?.slice(0, 7) === f.mois),
      revenus: entrees.filter((x) => (premiere.get(x) ?? "9") < `${f.mois}-01`),
      sortis: [...avant].filter((x) => !e.has(x)),
    }
  })
}

export type StatutSt = "sorti" | "nouveau" | "revenu" | "actif" | "ferme" | "jamais" | "inactif"
export type LigneSt = {
  nom: string; email: string; statut: StatutSt; compteActif: boolean; metier: string; secteurs: string[]
  missions30: number; missions30Avant: number; montant30: number; derniere: string | null; premiere: string | null; total: number; paye30: number; paye30Avant: number
}
/** La liste des sous-traitants, rangée : sortis ce mois, nouveaux, revenus, actifs, comptes fermés, jamais missionnés, inactifs. */
export function lignesSt(sts: SousTraitantStc[], maintenant: Date): LigneSt[] {
  const mois = moisIso(maintenant)
  const finMoisAvant = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1)
  const ORDRE: StatutSt[] = ["sorti", "nouveau", "revenu", "actif", "ferme", "jamais", "inactif"]
  return sts.map((s) => {
    const m = missionsDe(s)
    const m30 = missionsA(m, maintenant), m60 = missionsA(m, maintenant, 30)
    const actif = s.compte_actif && m30.n > 0
    const premiere = m[0]?.[0] ?? null
    const statut: StatutSt = actif ? (premiere?.slice(0, 7) === mois ? "nouveau" : stActifA(s, finMoisAvant) ? "actif" : "revenu")
      : stActifA(s, finMoisAvant) ? "sorti" : m30.n > 0 ? "ferme" : s.compte_actif && !m.length ? "jamais" : "inactif"
    return {
      nom: s.nom, email: (s.email ?? "").toLowerCase(), statut, compteActif: s.compte_actif, metier: s.metier ?? "", secteurs: s.secteurs ?? [],
      missions30: m30.n, missions30Avant: m60.n, montant30: m30.montant, derniere: m[m.length - 1]?.[0] ?? null, premiere, total: m.length,
      paye30: Number(s.paye_30 || 0), paye30Avant: Number(s.paye_30_60 || 0),
    }
  }).sort((x, y) => ORDRE.indexOf(x.statut) - ORDRE.indexOf(y.statut) || y.missions30 - x.missions30 || (y.derniere ?? "").localeCompare(x.derniere ?? ""))
}
export const estActif = (l: Pick<LigneSt, "statut">) => l.statut === "actif" || l.statut === "nouveau" || l.statut === "revenu"
