// LA MONTÉE EN CHARGE ET L'ALERTE D'OUVERTURE (Mahdi, 10/11/2026). Copie exacte côté serveur, vérifiée par un test. Fichier PUR.

export type Montee = { actif: boolean; depart: number; palier: number; tousLesJours: number }
export const MONTEE_DEFAUT: Montee = { actif: true, depart: 10, palier: 5, tousLesJours: 3 }

/** Les envois permis aujourd'hui : on démarre doucement, on monte par paliers, et on redescend d'un palier si les boîtes souffrent. */
export function envoisDuJour(m: Montee, cible: number, lanceeLe: string, maintenant: Date, boitesSaines: boolean): number {
  const jours = Math.max(0, Math.floor((maintenant.getTime() - new Date(lanceeLe).getTime()) / 86_400_000))
  const paliers = Math.floor(jours / Math.max(1, m.tousLesJours)) - (boitesSaines ? 0 : 1)
  return Math.max(1, Math.min(cible, m.depart + Math.max(0, paliers) * m.palier))
}

/** Des boîtes saines : pas assez d'envois pour juger, ou moins de 2 % de rebonds. */
export const boitesSaines = (envoyes: number, rebonds: number) => envoyes < 20 || rebonds / envoyes < 0.02

export type AlerteOuverture = { actif: boolean; fois: number; jours: number }
export const ALERTE_DEFAUT: AlerteOuverture = { actif: false, fois: 2, jours: 7 }
export const ETAPE_ALERTE = "alerte-ouverture"

/** Ceux à appeler : assez d'ouvertures récentes, pas de réponse, encore dans la campagne, et pas déjà signalés. */
export function aAppelerSurOuverture(a: AlerteOuverture, inscriptions: { contactId: string; statut: string }[], evenements: { contactId: string; type: string; le: string }[], deja: ReadonlySet<string>, maintenant: Date): string[] {
  const depuis = maintenant.getTime() - a.jours * 86_400_000
  return inscriptions.filter((i) => (i.statut === "en_cours" || i.statut === "terminee") && !deja.has(i.contactId)).map((i) => i.contactId).filter((id) => {
    const miens = evenements.filter((e) => e.contactId === id)
    return !miens.some((e) => e.type === "reponse") && miens.filter((e) => e.type === "ouvert" && new Date(e.le).getTime() >= depuis).length >= a.fois
  })
}
