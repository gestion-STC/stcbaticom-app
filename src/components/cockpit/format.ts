// LE COCKPIT : les formats des chiffres et les libellés partagés par les écrans (fichier sans composant).
import type { Trajectoire } from "../../lib/croissance"
import type { StatutSt } from "../../lib/cockpitStc"

export const fr = (n: number) => Math.round(n).toLocaleString("fr-FR")
export const euros = (n: number) => `${fr(n)} €`
export const k = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toLocaleString("fr-FR", { maximumFractionDigits: n >= 100_000 ? 0 : 1 })} k` : fr(n))
export const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : "—")
const MOIS_COURT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]
export const moisCourt = (m: string) => MOIS_COURT[Number(m.slice(5, 7)) - 1]

export const VERDICT: Record<Trajectoire, { texte: string; ton: string; fond: string; point: string }> = {
  bonne: { texte: "Dans les clous", ton: "text-ok", fond: "bg-ok-fond", point: "bg-ok" },
  juste: { texte: "Juste", ton: "text-attention", fond: "bg-attention-fond", point: "bg-attention" },
  retard: { texte: "En retard", ton: "text-alerte", fond: "bg-alerte-fond", point: "bg-alerte" },
  inconnue: { texte: "Inconnu", ton: "text-encre-2", fond: "bg-fond-3", point: "bg-encre-3" },
}

export const STATUT_ST: Record<StatutSt, { texte: string; point: string; ton: string; pourquoi: string }> = {
  sorti: { texte: "Sorti ce mois", point: "bg-alerte", ton: "font-medium text-alerte", pourquoi: "actif à la fin du mois dernier, plus aucune mission depuis 30 jours" },
  nouveau: { texte: "Nouveau", point: "bg-ok", ton: "font-medium text-ok", pourquoi: "première mission de son histoire ce mois-ci" },
  revenu: { texte: "Revenu", point: "bg-info", ton: "text-encre", pourquoi: "pas actif à la fin du mois dernier, de nouveau une mission ce mois-ci" },
  actif: { texte: "Actif", point: "bg-ok", ton: "text-encre", pourquoi: "au moins une mission envoyée sur 30 jours, compte ouvert" },
  ferme: { texte: "Compte fermé", point: "bg-alerte/50", ton: "text-encre-2", pourquoi: "une mission sur 30 jours, mais son compte STC est fermé" },
  jamais: { texte: "Jamais missionné", point: "bg-encre-3", ton: "text-encre-2", pourquoi: "compte ouvert dans STC, aucune mission envoyée à ce jour" },
  inactif: { texte: "Inactif", point: "bg-encre-3", ton: "text-encre-2", pourquoi: "aucune mission sur 30 jours" },
}
export const REGLE_ST = "Actif = au moins une mission envoyée à l'artisan sur les 30 derniers jours (demandes, hors brouillons, retirées et refusées), compte ouvert. Nouveau = sa toute première mission dans le mois. Revenu = actif, pas actif à la fin du mois d'avant mais déjà missionné. Sorti = actif à la fin du mois d'avant, plus aucune mission depuis 30 jours."

