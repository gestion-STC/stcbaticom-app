// Les chiffres d'une campagne d'avis, hors avis notés sur la page (chargés à part). Fichier PUR (25/11/2026).
// « Partis sur Google » : le clic vers la page d'avis Google (noté une fois par formulaire-campagne). « Désinscriptions » :
// l'événement posé par le lien « ne plus recevoir », ou une inscription sortie « désinscrit ».
import type { Envoi, Evenement, Inscription } from "./modele"

export function mesureAvis(campagneId: string, inscriptions: Inscription[], envois: Envoi[], evenements: Evenement[]) {
  const evs = evenements.filter((e) => e.campagneId === campagneId)
  const google = new Set(evs.filter((e) => e.type === "clic" && e.lien === "google").map((e) => e.contactId)).size
  const desinscrits = new Set([...evs.filter((e) => e.type === "desinscription").map((e) => e.contactId), ...inscriptions.filter((i) => i.campagneId === campagneId && i.statut === "desinscrit").map((i) => i.contactId)]).size
  const touches = new Set(envois.filter((e) => e.campagneId === campagneId && e.statut === "envoye").map((e) => e.contactId)).size
  return { entres: inscriptions.filter((i) => i.campagneId === campagneId).length, touches, google, desinscrits }
}
