// LA MESURE D'UNE CAMPAGNE (09/11/2026) : l'entonnoir de SON parcours, avec les vrais chiffres, et ce que coûtent
// un lead et un gagné. Une étape compte tous ceux qui l'ont passée, même s'ils ont sauté celles d'avant. Fichier PUR.
import type { ConfigCampagne } from "./configCampagne"
import type { Envoi, Evenement, Inscription } from "./modele"

export type PositionCampagne = { campagneId: string; atteintes: string[]; estLead: boolean; etape: string }
export type LigneMesure = { libelle: string; n: number; part: number | null; badge?: "LEAD" | "GAGNÉ" }
export type Mesure = { lignes: LigneMesure[]; leads: number; gagnes: number; sms: number; coutSms: number; coutIA: number; coutParLead: number | null; coutParGagne: number | null }

const arrondi = (x: number) => Math.round(x * 100) / 100

export function mesureCampagne(cfg: ConfigCampagne, campagneId: string, coutUnitaireSms: number, inscriptions: Inscription[], envois: Envoi[], evenements: Evenement[], positions: PositionCampagne[], coutIA = 0): Mesure {
  const q = cfg.qualification
  const miens = positions.filter((p) => p.campagneId === campagneId)
  const partis = envois.filter((e) => e.campagneId === campagneId && e.statut === "envoye")
  const distincts = (type: Evenement["type"]) => new Set(evenements.filter((e) => e.campagneId === campagneId && e.type === type).map((e) => e.contactId)).size
  const iGagne = q.etapes.findIndex((e) => e.id === q.gagneA)
  const derniere = (p: PositionCampagne) => q.etapes.reduce((m, e, i) => (p.atteintes.includes(e.id) ? i : m), -1)
  const brutes: Omit<LigneMesure, "part">[] = [
    { libelle: "Contacts dans la campagne", n: inscriptions.filter((i) => i.campagneId === campagneId).length },
    { libelle: "Touchés", n: new Set(partis.map((e) => e.contactId)).size },
    { libelle: "Ouvert", n: distincts("ouvert") },
    { libelle: "Cliqué", n: distincts("clic") },
    ...q.etapes.slice(0, iGagne >= 0 ? iGagne + 1 : undefined).map((e, i) => ({
      libelle: e.nom, n: miens.filter((p) => derniere(p) >= i).length,
      badge: e.id === q.leadA ? "LEAD" as const : e.id === q.gagneA ? "GAGNÉ" as const : undefined,
    })),
  ]
  const lignes = brutes.map((l, i) => { const avant = i ? brutes[i - 1].n : 0; return { ...l, part: i && avant ? Math.round((l.n / avant) * 100) : null } })
  const leads = miens.filter((p) => p.estLead).length, gagnes = miens.filter((p) => p.etape === "gagnes").length
  const sms = partis.filter((e) => e.canal === "sms").length, coutSms = arrondi(sms * coutUnitaireSms)
  const total = coutSms + coutIA
  return { lignes, leads, gagnes, sms, coutSms, coutIA: arrondi(coutIA), coutParLead: leads ? arrondi(total / leads) : null, coutParGagne: gagnes ? arrondi(total / gagnes) : null }
}
