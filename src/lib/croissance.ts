// LE DASHBOARD CROISSANCE (Mahdi, 11/11/2026) : « suivre la prospection, le démarchage, le recrutement sous-traitant,
// pour voir à quelle cadence on avance ». Les calculs, sans rien lire ni afficher. Fichier PUR, testé.

export type Marche = { libelle: string; valeur: number }

const lundi = (d: Date) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
/** Les lundis des N dernières semaines, la plus ancienne d'abord (la semaine en cours comprise). */
export function lundisRecents(maintenant: Date, n = 12): Date[] {
  const l = lundi(maintenant)
  return Array.from({ length: n }, (_, i) => new Date(l.getFullYear(), l.getMonth(), l.getDate() - 7 * (n - 1 - i)))
}
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
/** Ce mois-ci et le mois dernier. */
export function moisCompare(dates: (string | null | undefined)[], maintenant: Date): { mois: number; avant: number } {
  const debut = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1), avant = new Date(maintenant.getFullYear(), maintenant.getMonth() - 1, 1)
  let mois = 0, av = 0
  for (const d of dates) { if (!d) continue; const t = new Date(d); if (t >= debut) mois++; else if (t >= avant) av++ }
  return { mois, avant: av }
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

/** Combien de semaines pour épuiser une réserve à ce rythme (null : pas de rythme). */
export const semainesRestantes = (reserve: number, parSemaineMoyen: number): number | null => (parSemaineMoyen > 0 ? Math.ceil(reserve / parSemaineMoyen) : null)
/** Le taux de passage d'une marche à la suivante. */
export const tauxPassage = (de: number, a: number): number | null => (de > 0 ? a / de : null)

// ── LE COCKPIT (Mahdi, 11/11/2026) : « je veux faire 200 000 ou 300 000 € par mois, qu'il me dise combien d'agences,
// combien de sous-traitants, l'objectif par semaine, et si on est sur la bonne croissance ». ──
export type ReglageCockpit = { objectifMensuel: number; moisPourYArriver: number; caParClient: number; caParArtisan: number }
export const COCKPIT_DEPART: ReglageCockpit = { objectifMensuel: 200_000, moisPourYArriver: 12, caParClient: 4_000, caParArtisan: 12_000 }
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

// ── LES VRAIS CHIFFRES (Mahdi, 11/11/2026) : « compter seulement les agences actives sur le logiciel, et le vrai chiffre
// d'affaires ». Lus dans STC Bâtiment (chiffres_pour_baticom) par la synchro horaire, rangés dans parametres.chiffres_stc. ──
export type ChiffresStc = {
  calcule_le: string; fenetre_jours: number; agences_actives: number
  mois: { mois: string; ca_agences: number; ca_particuliers: number }[]
  agences: { nom: string; os_90j: number; dernier_os_le: string; ca_3_mois: number }[]
}
export type ReelStc = {
  agencesActives: number; fenetreJours: number; calculeLe: Date; mois: string[]
  /** Moyennes mensuelles du facturé HT net, sur les mois complets lus. */
  caMensuel: number; caAgencesMensuel: number; caParticuliersMensuel: number
  /** Le chiffre d'affaires mensuel moyen d'une agence active (ce qu'elles ont facturé ÷ mois ÷ nombre d'agences actives). */
  caParAgence: number
  agences: ChiffresStc["agences"]
}
/** Lit parametres.chiffres_stc ; null si la passerelle n'a encore rien déposé. */
export function lireReelStc(valeur: string | null): ReelStc | null {
  if (!valeur) return null
  try {
    const c = JSON.parse(valeur) as ChiffresStc
    if (typeof c.agences_actives !== "number" || !Array.isArray(c.mois) || !c.mois.length) return null
    const n = c.mois.length, somme = (f: (m: ChiffresStc["mois"][number]) => number) => c.mois.reduce((a, m) => a + Number(f(m) || 0), 0) / n
    const agences = Array.isArray(c.agences) ? c.agences : []
    const caActives = agences.reduce((a, x) => a + Number(x.ca_3_mois || 0), 0)
    return {
      agencesActives: c.agences_actives, fenetreJours: c.fenetre_jours || 90, calculeLe: new Date(c.calcule_le), mois: c.mois.map((m) => m.mois),
      caMensuel: somme((m) => m.ca_agences + m.ca_particuliers), caAgencesMensuel: somme((m) => m.ca_agences), caParticuliersMensuel: somme((m) => m.ca_particuliers),
      caParAgence: c.agences_actives > 0 ? caActives / n / c.agences_actives : 0, agences,
    }
  } catch { return null }
}

/** De l'objectif de chiffre d'affaires mensuel à ce qu'il faut sortir chaque semaine. Les taux viennent des entonnoirs.
 *  Avec les vrais chiffres : le chiffre d'affaires moyen d'une agence est le vrai, celui des particuliers est supposé
 *  constant (les agences portent le reste de l'objectif), et le chiffre d'affaires estimé est le facturé réel. */
export function planCroissance(r: ReglageCockpit, etat: {
  clientsActuels: number; artisansActifs: number
  /** Agences contactées → clients ; artisans contactés → actifs (0 à 1). */
  tauxClient: number | null; tauxArtisan: number | null
  /** Ce qu'on fait aujourd'hui, en moyenne par semaine (4 dernières semaines). */
  clientsParSemaine: number; artisansParSemaine: number; agencesAppeleesParSemaine: number
}, reel?: ReelStc | null): { clientsNecessaires: number; artisansNecessaires: number; caEstime: number; caParClient: number; premiersOsParMois: number; leviers: LevierCockpit[]; global: Trajectoire } {
  const semaines = Math.max(1, r.moisPourYArriver * SEMAINES_PAR_MOIS)
  const caParClient = reel ? reel.caParAgence : r.caParClient
  const aPorter = reel ? Math.max(0, r.objectifMensuel - reel.caParticuliersMensuel) : r.objectifMensuel
  const clientsNecessaires = caParClient > 0 ? Math.ceil(aPorter / caParClient) : 0
  const artisansNecessaires = r.caParArtisan > 0 ? Math.ceil(r.objectifMensuel / r.caParArtisan) : 0
  const clientsSemaine = Math.max(0, clientsNecessaires - etat.clientsActuels) / semaines
  const artisansSemaine = Math.max(0, artisansNecessaires - etat.artisansActifs) / semaines
  const agencesSemaine = etat.tauxClient && etat.tauxClient > 0 ? clientsSemaine / etat.tauxClient : 0
  const arrondi = (x: number) => Math.round(x * 100) / 100
  const leviers: LevierCockpit[] = [
    { libelle: "Nouveaux clients", ilFaut: arrondi(clientsSemaine), onFait: arrondi(etat.clientsParSemaine), unite: "par semaine", trajectoire: trajectoire(etat.clientsParSemaine, clientsSemaine) },
    { libelle: "Agences à appeler", ilFaut: Math.ceil(agencesSemaine), onFait: etat.agencesAppeleesParSemaine, unite: "par semaine", trajectoire: etat.tauxClient ? trajectoire(etat.agencesAppeleesParSemaine, agencesSemaine) : "inconnue" },
    { libelle: "Nouveaux sous-traitants actifs", ilFaut: arrondi(artisansSemaine), onFait: arrondi(etat.artisansParSemaine), unite: "par semaine", trajectoire: trajectoire(etat.artisansParSemaine, artisansSemaine) },
  ]
  const ordre: Trajectoire[] = ["retard", "juste", "bonne", "inconnue"]
  const global = ordre.find((t) => leviers.some((l) => l.trajectoire === t)) ?? "inconnue"
  return { clientsNecessaires, artisansNecessaires, caEstime: reel ? reel.caMensuel : etat.clientsActuels * r.caParClient, caParClient, premiersOsParMois: Math.ceil(clientsSemaine * SEMAINES_PAR_MOIS), leviers, global: global === "inconnue" && leviers.every((l) => l.trajectoire !== "inconnue") ? "bonne" : global }
}
