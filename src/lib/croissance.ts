// LE DASHBOARD CROISSANCE (Mahdi, 11/11/2026) : « suivre la prospection, le démarchage, le recrutement sous-traitant,
// pour voir à quelle cadence on avance ». Les calculs, sans rien lire ni afficher. Fichier PUR, testé.

export type Marche = { libelle: string; valeur: number }

/** Combien de dates tombent dans chaque semaine. */
export function parSemaine(dates: (string | null | undefined)[], lundis: Date[]): number[] {
  const out = lundis.map(() => 0)
  const fin = lundis.length ? new Date(lundis[lundis.length - 1].getTime() + 7 * 86_400_000) : new Date(0)
  for (const d of dates) {
    if (!d) continue
    const t = new Date(d)
    if (t < lundis[0] || t >= fin) continue
    let i = lundis.length - 1
    while (i > 0 && t < lundis[i]) i--
    out[i]++
  }
  return out
}
export type AgenceCroissance = { etape: string; tentatives: number | null; joint_fois: number | null; premier_os_le: string | null }
/** Le démarchage, de la base au client. */
export function entonnoirDemarchage(l: AgenceCroissance[]): Marche[] {
  const client = (a: AgenceCroissance) => Boolean(a.premier_os_le) || a.etape === "client"
  const rdv = (a: AgenceCroissance) => client(a) || a.etape === "rdv_planifie"
  const interesse = (a: AgenceCroissance) => rdv(a) || a.etape === "interesse"
  return [
    { libelle: "Agences dans la base", valeur: l.length },
    { libelle: "Contactées", valeur: l.filter((a) => (a.tentatives ?? 0) > 0 || (a.joint_fois ?? 0) > 0 || interesse(a)).length },
    { libelle: "Gestionnaire joint", valeur: l.filter((a) => (a.joint_fois ?? 0) > 0 || interesse(a)).length },
    { libelle: "Intéressées", valeur: l.filter(interesse).length },
    { libelle: "RDV", valeur: l.filter(rdv).length },
    { libelle: "Clients (premier OS)", valeur: l.filter(client).length },
  ]
}

export type ArtisanCroissance = { statut: string; nb_envois_ok: number | null; nb_appels: number | null; nb_joints: number | null; nb_clics: number | null; suivi: string | null; depose_le: string | null; contrat_statut: string | null; contrat_signe_le: string | null; acces_ouvert_le: string | null }
/** Le recrutement, de la base à l'accès ouvert. Chaque marche est comprise dans la précédente (les joints au
 *  téléphone sont dans le tableau de l'équipe : un intéressé ne passe pas toujours par un appel). */
export function entonnoirRecrutement(l: ArtisanCroissance[]): Marche[] {
  const acces = (a: ArtisanCroissance) => Boolean(a.acces_ouvert_le)
  const contrat = (a: ArtisanCroissance) => acces(a) || Boolean(a.contrat_signe_le) || a.contrat_statut === "signe"
  const depose = (a: ArtisanCroissance) => contrat(a) || Boolean(a.depose_le) || a.statut === "depose"
  const interesse = (a: ArtisanCroissance) => depose(a) || (a.nb_clics ?? 0) > 0 || a.suivi === "va_deposer"
  return [
    { libelle: "Artisans dans la base", valeur: l.length },
    { libelle: "Contactés", valeur: l.filter((a) => (a.nb_envois_ok ?? 0) > 0 || (a.nb_appels ?? 0) > 0 || interesse(a)).length },
    { libelle: "Intéressés", valeur: l.filter(interesse).length },
    { libelle: "Dossier déposé", valeur: l.filter(depose).length },
    { libelle: "Contrat signé", valeur: l.filter(contrat).length },
    { libelle: "Accès ouvert", valeur: l.filter(acces).length },
  ]
}

// ── LE COCKPIT (Mahdi, 11/11/2026) : « je veux faire 200 000 ou 300 000 € par mois, qu'il me dise combien d'agences,
// combien de sous-traitants, l'objectif par semaine, et si on est sur la bonne croissance ». ──
// 26/11/2026 : le levier « sous-traitants actifs » est retiré (toujours à 0, il mettait le cockpit « En retard » à tort).
// 26/11/2026 : l'échéance est une DATE FIXE (`echeance`, AAAA-MM-JJ). « D'ici N mois » reculait chaque jour.
export type ReglageCockpit = { objectifMensuel: number; moisPourYArriver: number; echeance?: string; caParClient: number; factureMin: number; osMin: number; chutePct: number }
export const COCKPIT_DEPART: ReglageCockpit = { objectifMensuel: 200_000, moisPourYArriver: 12, caParClient: 4_000, factureMin: 1_000, osMin: 2, chutePct: 50 }
/** La date où le réglage actuel (sans `echeance`) a été enregistré : le 11/11/2026. L'échéance par défaut en part. */
export const REGLAGE_ENREGISTRE_LE = "2026-11-11"
const lireJour = (s: string): Date | null => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (!m) return null; const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])); return Number.isNaN(d.getTime()) ? null : d }
/** L'échéance de l'objectif : la date réglée, sinon le 11/11/2026 + moisPourYArriver mois (6 mois → 11/05/2027). */
export function echeanceDe(r: Pick<ReglageCockpit, "echeance" | "moisPourYArriver">): Date {
  const reglee = r.echeance ? lireJour(r.echeance) : null
  if (reglee) return reglee
  const base = lireJour(REGLAGE_ENREGISTRE_LE)!
  return new Date(base.getFullYear(), base.getMonth() + Math.max(1, Math.round(r.moisPourYArriver || 1)), base.getDate())
}
/** Les semaines qui restent jusqu'à l'échéance (au moins 1). */
export const semainesJusquA = (echeance: Date, maintenant: Date): number => Math.max(1, (echeance.getTime() - maintenant.getTime()) / (7 * 86_400_000))
export type Trajectoire = "bonne" | "juste" | "retard" | "inconnue"
export type LevierCockpit = { libelle: string; ilFaut: number; onFait: number | null; unite: string; trajectoire: Trajectoire }

const SEMAINES_PAR_MOIS = 52 / 12
/** La trajectoire : au moins le rythme demandé = bonne ; 70 % = juste ; en dessous = en retard. */
export function trajectoire(onFait: number | null, ilFaut: number): Trajectoire {
  if (onFait === null) return "inconnue"
  if (ilFaut <= 0) return "bonne"
  const r = onFait / ilFaut
  return r >= 1 ? "bonne" : r >= 0.7 ? "juste" : "retard"
}

// ── LES VRAIS CHIFFRES (Mahdi, 11/11/2026, algorithme validé) : lus dans STC Bâtiment (chiffres_pour_baticom, chiffres
// BRUTS de chaque agence) par la synchro horaire, rangés dans parametres.chiffres_stc. Les règles sont ici :
//   1. ACTIVE aujourd'hui = sur les 30 derniers jours, au moins 1 000 € facturés ET au moins 2 OS, ET pas en chute
//      (au moins la moitié des OS des 30 jours d'avant, jugé seulement si elle en avait envoyé au moins 4) ;
//   2. CE QUE RAPPORTE une agence active = moyenne du facturé des « mois où elle tourne » (au moins 1 000 € dans le mois),
//      sur les 6 derniers mois complets, toutes agences confondues, même celles qui ne sont plus actives. ──
export type AgenceStc = { nom: string; os_30: number; os_30_60: number; facture_30: number; dernier_os_le: string | null; mois: number[] }
/** `ca_annee` (26/11/2026, optionnel) : le facturé HT net de chaque mois, de janvier au mois EN COURS inclus (partiel), toutes factures. */
export type ChiffresStc = { version: 2; calcule_le: string; mois: string[]; particuliers: number[]; agences: AgenceStc[]; ca_annee?: { mois: string; ht: number }[] }
export type SeuilsActive = { factureMin: number; osMin: number; chutePct: number }
export const SEUILS_DEPART: SeuilsActive = { factureMin: 1_000, osMin: 2, chutePct: 50 }
/** En dessous de ce nombre d'OS le mois d'avant, on ne juge pas la chute (une petite agence varie de 1 à 2 OS). */
export const CHUTE_JUGEE_DES = 4

export type StatutAgence = { active: boolean; raison: string; moisActifs: number; moyenneQuandElleTourne: number | null }
/** Active ou pas, et pourquoi, en une phrase courte. */
export function statutAgence(a: AgenceStc, s: SeuilsActive): StatutAgence {
  const tourne = a.mois.filter((m) => m >= s.factureMin)
  const moy = tourne.length ? tourne.reduce((x, y) => x + y, 0) / tourne.length : null
  const enChute = a.os_30_60 >= CHUTE_JUGEE_DES && a.os_30 < a.os_30_60 * (s.chutePct / 100)
  const raison = a.facture_30 < s.factureMin ? `moins de ${s.factureMin.toLocaleString("fr-FR")} € facturés sur 30 jours`
    : a.os_30 < s.osMin ? `moins de ${s.osMin} OS sur 30 jours`
    : enChute ? `en chute : ${a.os_30} OS contre ${a.os_30_60} le mois d'avant` : ""
  return { active: !raison, raison, moisActifs: tourne.length, moyenneQuandElleTourne: moy }
}

export type ReelStc = {
  calculeLe: Date; mois: string[]
  agences: (AgenceStc & StatutAgence)[]
  agencesActives: number
  /** Ce que rapporte une agence active : moyenne des mois où elle tourne (règle 2) ; et sur combien de mois. */
  caParAgence: number; moisActifs: number
  /** Facturé HT par mois, MOYENNE DES 3 DERNIERS MOIS CLOS (base du prévisionnel, pas le réel) ; part des particuliers (moyenne des 6 mois). */
  caMensuel: number; caParticuliersMensuel: number
  /** Le facturé HT de chaque mois lu (agences et particuliers), pour les courbes de l'année. */
  caParMois: number[]
  /** Le facturé de l'année, mois par mois jusqu'au mois en cours (partiel) ; null si STC Bâtiment ne l'envoie pas encore. */
  caAnnee: { mois: string; ht: number }[] | null
}
/** Lit parametres.chiffres_stc et applique les règles ; null si la passerelle n'a encore rien déposé (ou ancien format). */
export function lireReelStc(valeur: string | null, s: SeuilsActive = SEUILS_DEPART): ReelStc | null {
  if (!valeur) return null
  try {
    const c = JSON.parse(valeur) as ChiffresStc
    if (c.version !== 2 || !Array.isArray(c.agences) || !Array.isArray(c.mois) || !c.mois.length) return null
    const agences = c.agences.map((a) => ({ ...a, mois: a.mois.map(Number), ...statutAgence({ ...a, mois: a.mois.map(Number) }, s) }))
    const tourne = agences.flatMap((a) => a.mois.filter((m) => m >= s.factureMin))
    const somme = (l: number[]) => l.reduce((x, y) => x + Number(y || 0), 0)
    const trois = c.mois.length >= 3 ? 3 : c.mois.length
    const derniers = (l: number[]) => l.slice(-trois)
    const caTrois = somme(derniers(c.particuliers)) + somme(agences.flatMap((a) => derniers(a.mois)))
    return {
      calculeLe: new Date(c.calcule_le), mois: c.mois, agences,
      agencesActives: agences.filter((a) => a.active).length,
      caParAgence: tourne.length ? somme(tourne) / tourne.length : 0, moisActifs: tourne.length,
      caMensuel: caTrois / trois, caParticuliersMensuel: somme(c.particuliers) / c.particuliers.length,
      caParMois: c.mois.map((_, i) => Number(c.particuliers[i] || 0) + agences.reduce((x, a) => x + Number(a.mois[i] || 0), 0)),
      caAnnee: Array.isArray(c.ca_annee) && c.ca_annee.length
        ? c.ca_annee.filter((x) => x && /^\d{4}-\d{2}$/.test(String(x.mois))).map((x) => ({ mois: String(x.mois), ht: Number(x.ht) || 0 })).sort((a, b) => a.mois.localeCompare(b.mois))
        : null,
    }
  } catch { return null }
}

/** De l'objectif de chiffre d'affaires mensuel à ce qu'il faut sortir chaque semaine. Les taux viennent des entonnoirs.
 *  Avec les vrais chiffres : le chiffre d'affaires moyen d'une agence est le vrai, celui des particuliers est supposé
 *  constant (les agences portent le reste de l'objectif), et le chiffre d'affaires estimé est le facturé réel. */
export function planCroissance(r: ReglageCockpit, etat: {
  clientsActuels: number
  /** Agences contactées → clients (0 à 1). */
  tauxClient: number | null
  /** Ce qu'on fait aujourd'hui, en moyenne par semaine (4 dernières semaines). */
  clientsParSemaine: number; agencesAppeleesParSemaine: number
}, reel: ReelStc | null | undefined, maintenant: Date): { clientsNecessaires: number; caEstime: number; caParClient: number; premiersOsParMois: number; leviers: LevierCockpit[]; global: Trajectoire } {
  const semaines = semainesJusquA(echeanceDe(r), maintenant)
  const caParClient = reel ? reel.caParAgence : r.caParClient
  const aPorter = reel ? Math.max(0, r.objectifMensuel - reel.caParticuliersMensuel) : r.objectifMensuel
  const clientsNecessaires = caParClient > 0 ? Math.ceil(aPorter / caParClient) : 0
  const clientsSemaine = Math.max(0, clientsNecessaires - etat.clientsActuels) / semaines
  const agencesSemaine = etat.tauxClient && etat.tauxClient > 0 ? clientsSemaine / etat.tauxClient : 0
  const arrondi = (x: number) => Math.round(x * 100) / 100
  const leviers: LevierCockpit[] = [
    { libelle: "Nouveaux clients", ilFaut: arrondi(clientsSemaine), onFait: arrondi(etat.clientsParSemaine), unite: "par semaine", trajectoire: trajectoire(etat.clientsParSemaine, clientsSemaine) },
    { libelle: "Agences à appeler", ilFaut: Math.ceil(agencesSemaine), onFait: etat.agencesAppeleesParSemaine, unite: "par semaine", trajectoire: etat.tauxClient ? trajectoire(etat.agencesAppeleesParSemaine, agencesSemaine) : "inconnue" },
  ]
  const ordre: Trajectoire[] = ["retard", "juste", "bonne", "inconnue"]
  const global = ordre.find((t) => leviers.some((l) => l.trajectoire === t)) ?? "inconnue"
  return { clientsNecessaires, caEstime: reel ? reel.caMensuel : etat.clientsActuels * r.caParClient, caParClient, premiersOsParMois: Math.ceil(clientsSemaine * SEMAINES_PAR_MOIS), leviers, global: global === "inconnue" && leviers.every((l) => l.trajectoire !== "inconnue") ? "bonne" : global }
}

// ── LE PRÉVISIONNEL (Mahdi, 12/11/2026) : « par rapport à notre cadence actuelle, où on en est, et à quel chiffre
// d'affaires on arrive sous le délai ». On part du chiffre d'affaires d'aujourd'hui et on ajoute ce que rapporteront
// les nouveaux clients gagnés au rythme des 4 dernières semaines, jusqu'à l'échéance. Aucune agence perdue n'est
// retranchée : c'est le rythme d'entrée qui est prolongé. ──
export type Prevision = {
  /** Agences actives à l'échéance, au rythme actuel. */
  clientsPrevus: number
  /** Chiffre d'affaires mensuel à l'échéance, sa part de l'objectif (en %), et ce qu'il manquerait (0 si atteint). */
  caPrevu: number; pctObjectif: number; manque: number
  /** Dans combien de semaines l'objectif est atteint à ce rythme : 0 = déjà atteint, null = jamais (rythme nul). */
  semainesPourObjectif: number | null
}
export function previsionCroissance(r: ReglageCockpit, etat: { clientsActuels: number; clientsParSemaine: number }, plan: { caEstime: number; caParClient: number }, maintenant: Date): Prevision {
  const semaines = semainesJusquA(echeanceDe(r), maintenant)
  const gainParSemaine = Math.max(0, etat.clientsParSemaine) * plan.caParClient
  const caPrevu = plan.caEstime + gainParSemaine * semaines
  const resteAujourdhui = r.objectifMensuel - plan.caEstime
  return {
    clientsPrevus: Math.round(etat.clientsActuels + Math.max(0, etat.clientsParSemaine) * semaines),
    caPrevu, pctObjectif: r.objectifMensuel > 0 ? Math.round((caPrevu / r.objectifMensuel) * 100) : 0,
    manque: Math.max(0, r.objectifMensuel - caPrevu),
    semainesPourObjectif: resteAujourdhui <= 0 ? 0 : gainParSemaine > 0 ? Math.ceil(resteAujourdhui / gainParSemaine) : null,
  }
}
