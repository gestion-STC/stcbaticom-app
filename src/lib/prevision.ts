// LE PRÉVISIONNEL À 6 MOIS (demande du gérant, 26/11/2026) : « en fonction de notre cadence, est-on en retard ou dans
// les clous ? ». Fichier PUR, testé (prevision.test.ts). Il enchaîne les VRAIES fonctions du logiciel (croissance.ts),
// comme l'ancien dashboard Croissance : planCroissance → previsionCroissance ; cadence = moyenne des 4 dernières
// semaines closes de premiers OS. Les jalons : le même calcul arrêté au même quantième de chaque mois jusqu'à l'échéance ;
// la cible = la ligne droite d'aujourd'hui à l'objectif (CA) et aux agences nécessaires, à l'échéance.
import { echeanceDe, parSemaine, planCroissance, previsionCroissance, trajectoire, type Prevision, type ReelStc, type ReglageCockpit, type Trajectoire } from "./croissance"
import { lundisRecents } from "./cockpitTelepro"

export type EntreesPrevision = {
  reglage: ReglageCockpit
  reel: ReelStc | null
  /** Les dates de premier OS (AAAA-MM-JJ) d'au moins les 12 dernières semaines. */
  premiersOsDates: string[]
  /** L'entonnoir de toute la base : agences contactées, agences clientes (taux de la base). */
  entonnoir: { contactees: number; clients: number }
  /** Les 28 derniers jours : agences distinctes appelées, appels sortants, joints, premiers OS. */
  fenetre28j: { agencesDistinctes: number; appels: number; joints: number; premiersOs: number }
}
export type Jalon = { date: Date; ca: number; actives: number; caCible: number; activesCible: number }
export type Levier = { libelle: string; base: string; ilFaut: number; onFait: number; trajectoire: Trajectoire; decimales?: boolean }
export type PrevisionCockpit = {
  maintenant: Date; reglage: ReglageCockpit; echeance: Date; reel: ReelStc | null
  plan: ReturnType<typeof planCroissance>; prevu: Prevision; cadence: number; nouveaux: number[]; jalons: Jalon[]; leviers: Levier[]
  global: Trajectoire; retardPct: number; atteint: Date | null; clientsSemaine: number; appelsNecessaires: number | null; clientsActuels: number
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

export function calculerPrevision(e: EntreesPrevision, maintenant: Date): PrevisionCockpit {
  const { reglage, reel } = e
  const echeance = echeanceDe(reglage)
  const nouveaux = parSemaine(e.premiersOsDates, lundisRecents(maintenant, 12))
  const cadence = nouveaux.slice(-5, -1).reduce((a, b) => a + b, 0) / 4
  const clientsActuels = reel ? reel.agencesActives : e.entonnoir.clients
  const agencesParSemaine = Math.round(e.fenetre28j.agencesDistinctes / 4)
  const tauxClient = e.entonnoir.contactees ? e.entonnoir.clients / e.entonnoir.contactees : null
  const plan = planCroissance(reglage, { clientsActuels, tauxClient, clientsParSemaine: cadence, agencesAppeleesParSemaine: agencesParSemaine }, reel, maintenant)
  const prevu = previsionCroissance(reglage, { clientsActuels, clientsParSemaine: cadence }, plan, maintenant)

  const total = Math.max(1, echeance.getTime() - maintenant.getTime())
  const jalons: Jalon[] = Array.from({ length: 6 }, (_, i) => new Date(echeance.getFullYear(), echeance.getMonth() - 5 + i, echeance.getDate()))
    .filter((d) => d.getTime() > maintenant.getTime())
    .map((d) => {
      const x = previsionCroissance({ ...reglage, echeance: iso(d) }, { clientsActuels, clientsParSemaine: cadence }, plan, maintenant)
      const f = Math.min(1, (d.getTime() - maintenant.getTime()) / total)
      return { date: d, ca: x.caPrevu, actives: x.clientsPrevus, caCible: plan.caEstime + (reglage.objectifMensuel - plan.caEstime) * f, activesCible: Math.round(clientsActuels + (plan.clientsNecessaires - clientsActuels) * f) }
    })

  // Les leviers, par semaine : les deux du logiciel (planCroissance), puis appels et joints qui en découlent aux taux
  // réels des 28 derniers jours (premiers OS / appels, premiers OS / joints).
  const F = e.fenetre28j
  const clientsSemaine = plan.leviers[0].ilFaut
  const appelsParClient = F.premiersOs ? F.appels / F.premiersOs : null
  const jointsParClient = F.premiersOs ? F.joints / F.premiersOs : null
  const appelsFait = Math.round(F.appels / 4), jointsFait = Math.round((F.joints / 4) * 10) / 10
  const leviers: Levier[] = [
    { libelle: "Nouveaux clients (premiers OS)", base: "moyenne des 4 dernières semaines closes", ilFaut: plan.leviers[0].ilFaut, onFait: plan.leviers[0].onFait ?? 0, trajectoire: plan.leviers[0].trajectoire, decimales: true },
    { libelle: "Agences appelées", base: `taux de la base : ${e.entonnoir.clients} clientes / ${e.entonnoir.contactees} contactées`, ilFaut: plan.leviers[1].ilFaut, onFait: plan.leviers[1].onFait ?? 0, trajectoire: plan.leviers[1].trajectoire },
    ...(appelsParClient ? [{ libelle: "Appels sortants", base: `28 j : 1 premier OS pour ${Math.round(appelsParClient)} appels`, ilFaut: Math.ceil(clientsSemaine * appelsParClient), onFait: appelsFait, trajectoire: trajectoire(appelsFait, clientsSemaine * appelsParClient) }] : []),
    ...(jointsParClient ? [{ libelle: "Gestionnaires joints", base: `28 j : 1 premier OS pour ${Math.round(jointsParClient)} joints`, ilFaut: Math.ceil(clientsSemaine * jointsParClient), onFait: jointsFait, trajectoire: trajectoire(jointsFait, clientsSemaine * jointsParClient) }] : []),
  ]
  const ratio = clientsSemaine > 0 ? cadence / clientsSemaine : 1
  return {
    maintenant, reglage, echeance, reel, plan, prevu, cadence, nouveaux, jalons, leviers, clientsActuels,
    global: plan.global, retardPct: Math.max(0, Math.round((1 - ratio) * 100)),
    atteint: prevu.semainesPourObjectif === null ? null : new Date(maintenant.getTime() + prevu.semainesPourObjectif * 7 * 86_400_000),
    clientsSemaine, appelsNecessaires: appelsParClient ? Math.ceil(clientsSemaine * appelsParClient) : null,
  }
}

const dec = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 2 })
const euros = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`
const moisAnnee = (d: Date) => d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
/** La phrase de lecture, une seule pour les deux écrans. */
export function phrasePrevision(P: PrevisionCockpit): string {
  return `À notre cadence (${dec(P.cadence)} nouveau client / semaine), on sera à ${euros(P.prevu.caPrevu)} / mois en ${moisAnnee(P.echeance)} (${P.prevu.pctObjectif} % de l'objectif). `
    + `Pour tenir l'objectif, il faut ${dec(P.clientsSemaine)} ${P.clientsSemaine >= 2 ? "nouveaux clients" : "nouveau client"} / semaine`
    + (P.appelsNecessaires ? `, soit ${P.appelsNecessaires.toLocaleString("fr-FR")} appels / semaine au taux des 28 derniers jours.` : ".")
}
/** Le titre du verdict : « En retard de 62 % », « Juste », « Dans les clous ». */
export function titreVerdict(P: PrevisionCockpit): string {
  return P.global === "retard" ? `En retard de ${P.retardPct}\u00a0%` : P.global === "juste" ? "Juste" : P.global === "bonne" ? "Dans les clous" : "Inconnu"
}
