// LES CAMPAGNES DU DASHBOARD (26/11/2026) : les mêmes chiffres que la liste des campagnes et le Suivi. Fichier PUR, testé.
// Avant, le Dashboard comptait avec sa propre règle (un lead seulement s'il venait d'un clic, chaque clic compté) : la
// campagne « histoires » y affichait 1 lead, contre 2 au Suivi et dans la liste. Désormais tout passe par indicateurs() :
//   · envoyés = touchés (au moins un envoi PARTI : confirmé chez Instantly, envoyé ailleurs ; hors envois de test) ;
//   · ouverts = contacts distincts qui ont ouvert (null si la campagne n'envoie que des SMS) ;
//   · clics   = contacts distincts qui ont cliqué, hors robots de sécurité ;
//   · leads   = les leads de la campagne (hors leads fermés « robot »), rattachés comme au Suivi.
import type { EtatProspection } from "../prospection/depot"
import type { Base } from "../prospection/modele"
import { indicateurs } from "../prospection/indicateurs"

export type CampagneCockpit = { id: string; nom: string; base: string; envoyes: number; ouverts: number | null; clics: number; leads: number }

export function lignesCampagnesCockpit(etat: EtatProspection, base: (id: string) => Base | undefined): CampagneCockpit[] {
  return etat.campagnes
    .filter((c) => c.statut === "active")
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
    .flatMap((c) => {
      const b = base(c.baseId)
      if (!b) return []
      const i = indicateurs(c, b, etat.contacts, etat.inscriptions, etat.envois, etat.evenements, etat.leads, etat.appels)
      const mesurable = etat.envois.some((e) => e.campagneId === c.id && e.canal !== "sms")
      return [{ id: c.id, nom: c.nom, base: c.baseId, envoyes: i.engagement.touches, ouverts: mesurable ? i.engagement.ouvreurs : null, clics: i.engagement.cliqueurs, leads: i.conversion.leads }]
    })
}
