// LA MESURE D'UNE CAMPAGNE (09/11/2026) : l'entonnoir de SON parcours, avec les vrais chiffres, et ce que coûtent
// un lead et un gagné. Une étape compte tous ceux qui l'ont passée, même s'ils ont sauté celles d'avant. Fichier PUR.
//
// Lot 3 (27/11/2026, décision 8 du gérant) : les leads et les gagnés sont ceux du Suivi (indicateurs.ts : rattachement
// daté à la campagne, robots exclus, gagné après l'entrée). Avant, Mesure rangeait chaque contact dans sa DERNIÈRE campagne
// sans regarder les dates : « machine » affichait 13 leads et 0 gagné ici, 69 et 12 au Suivi. Les étapes du parcours
// entre le lead et le gagné ne comptent plus que les leads de cette campagne.
import type { ConfigCampagne } from "./configCampagne"
import type { Envoi, Evenement, Inscription } from "./modele"
import { envoiParti, envoisConfirmes } from "./abTest"

export type PositionCampagne = { campagneId: string; atteintes: string[]; estLead: boolean; etape: string; contactId?: string }
/** Les leads et les gagnés de la campagne, tels que le Suivi les compte (indicateurs.ts, conversion). */
export type ChiffresSuivi = { leads: number; gagnes: number; contactsLeads: string[] }
export type LigneMesure = { libelle: string; n: number; part: number | null; badge?: "LEAD" | "GAGNÉ" }
export type Mesure = { lignes: LigneMesure[]; leads: number; gagnes: number; sms: number; coutSms: number; coutIA: number; coutParLead: number | null; coutParGagne: number | null }

const arrondi = (x: number) => Math.round(x * 100) / 100

export function mesureCampagne(cfg: ConfigCampagne, campagneId: string, coutUnitaireSms: number, inscriptions: Inscription[], envois: Envoi[], evenements: Evenement[], positions: PositionCampagne[], coutIA: number, /** Ses mails passent par Instantly (indicateurs.ts, parInstantly). */ instantly: boolean, suivi: ChiffresSuivi): Mesure {
  const q = cfg.qualification
  const leadsIci = new Set(suivi.contactsLeads)
  const miens = positions.filter((p) => p.campagneId === campagneId && p.contactId !== undefined && leadsIci.has(p.contactId))
  // « Touchés » : un envoi confirmé parti, la même règle que le Suivi et la liste (26/11/2026 : ici 60, là 30).
  const confirmes = envoisConfirmes(evenements.filter((e) => e.campagneId === campagneId))
  const partis = envois.filter((e) => e.campagneId === campagneId && envoiParti(e, instantly, confirmes))
  const distincts = (type: Evenement["type"]) => new Set(evenements.filter((e) => e.campagneId === campagneId && e.type === type).map((e) => e.contactId)).size
  const iGagne = q.etapes.findIndex((e) => e.id === q.gagneA), iFin = iGagne >= 0 ? iGagne : q.etapes.length - 1
  const derniere = (p: PositionCampagne) => q.etapes.reduce((m, e, i) => (p.atteintes.includes(e.id) ? i : m), -1)
  const brutes: Omit<LigneMesure, "part">[] = [
    { libelle: "Contacts dans la campagne", n: inscriptions.filter((i) => i.campagneId === campagneId).length },
    { libelle: "Touchés", n: new Set(partis.map((e) => e.contactId)).size },
    { libelle: "Ouvert", n: distincts("ouvert") },
    { libelle: "Cliqué", n: distincts("clic") },
    { libelle: "Leads", n: suivi.leads, badge: "LEAD" as const },
    // Les étapes du parcours après la 1re (l'intérêt détecté, c'est le lead) et avant le gagné (sans étape gagnée : la
    // dernière, le dossier déposé des artisans, que le Suivi compte comme gagné), parmi les leads d'ici.
    ...q.etapes.map((e, i) => ({ e, i })).filter(({ i }) => i > 0 && i < iFin).map(({ e, i }) => ({ libelle: e.nom, n: miens.filter((p) => derniere(p) >= i).length })),
    { libelle: "Gagnés", n: suivi.gagnes, badge: "GAGNÉ" as const },
  ]
  const lignes = brutes.map((l, i) => { const avant = i ? brutes[i - 1].n : 0; return { ...l, part: i && avant ? Math.round((l.n / avant) * 100) : null } })
  const leads = suivi.leads, gagnes = suivi.gagnes
  const sms = partis.filter((e) => e.canal === "sms").length, coutSms = arrondi(sms * coutUnitaireSms)
  const total = coutSms + coutIA
  return { lignes, leads, gagnes, sms, coutSms, coutIA: arrondi(coutIA), coutParLead: leads ? arrondi(total / leads) : null, coutParGagne: gagnes ? arrondi(total / gagnes) : null }
}
