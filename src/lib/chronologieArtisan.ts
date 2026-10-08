// La chronologie d'une fiche artisan : tout ce qui lui est arrivé, dans
// l'ordre — démarrage, envois (réussis, rejoués, en erreur, sautés,
// abandonnés), clics, messages échangés, dépôt, désinscription, fin.
// Pure : testée dans chronologieArtisan.test.ts, affichée par FicheArtisan.
import type { ClicST, EnvoiST, EtapeST, SousTraitant } from "../recrutement"
import type { MessageDeFiche } from "./machineDb"

export type Evenement = { quand: string; role: "ok" | "erreur" | "clic" | "message" | "etat" | "sms"; texte: string; detail?: string }

export const dateHeure = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })

function libelleEtape(e: EtapeST | undefined, canal: string): string {
  if (!e) return canal === "sms" ? "SMS" : "E-mail"
  return `${e.canal === "sms" ? "SMS" : "E-mail"} J+${e.delaiJours}${e.objet ? ` · ${e.objet}` : ""}`
}

const CANAL_DESINSCRIPTION: Record<string, string> = {
  lien: "par le lien de désinscription",
  reponse_email: "par une réponse e-mail",
  plainte: "signalé comme indésirable",
  ecran: "depuis l'écran",
}

export function chronologie(st: SousTraitant, envois: EnvoiST[], clics: ClicST[], messages: MessageDeFiche[], etapes: EtapeST[]): Evenement[] {
  const parEtape = new Map(etapes.map((e) => [e.id ?? "", e]))
  const ev: Evenement[] = []
  if (st.demarreLe) {
    ev.push({ quand: st.demarreLe, role: "etat", texte: st.recaleLe ? "Démarré (calendrier recalé)" : "Démarré", detail: st.statutMotif?.startsWith("campagne") ? st.statutMotif : undefined })
  }
  for (const e of envois) {
    const nom = libelleEtape(parEtape.get(e.etapeId), e.canal)
    if (e.statut === "envoye") {
      const suite = [e.tentative > 1 ? `rejoué (tentative ${e.tentative})` : "", e.delivreLe ? "délivré" : "", e.ouvertLe ? `ouvert le ${dateHeure(e.ouvertLe)}` : ""].filter(Boolean).join(" · ")
      ev.push({ quand: e.envoyeLe, role: e.canal === "sms" ? "sms" : "ok", texte: `${nom} envoyé`, detail: suite || undefined })
    } else if (e.statut === "erreur") {
      ev.push({ quand: e.envoyeLe, role: "erreur", texte: `${nom} en erreur`, detail: `${e.cause || e.erreur}${e.rejouerApres ? ` · rejeu prévu ${dateHeure(e.rejouerApres)}` : ""}` })
    } else if (e.statut === "saute") {
      ev.push({ quand: e.envoyeLe, role: "etat", texte: `${nom} sauté`, detail: e.cause || e.erreur })
    } else {
      ev.push({ quand: e.envoyeLe, role: "erreur", texte: `${nom} abandonné`, detail: e.cause || e.erreur })
    }
  }
  for (const c of clics) {
    ev.push({ quand: c.cliqueLe, role: "clic", texte: c.destination === "bareme" ? "A consulté le barème" : c.destination === "stop" ? "A cliqué « se désinscrire »" : "A cliqué « candidater »" })
  }
  for (const m of messages) {
    ev.push({ quand: m.date, role: "message", texte: m.sens === "entrant" ? `A répondu : ${m.objet || "(sans objet)"}` : `E-mail envoyé depuis la boîte : ${m.objet}`, detail: m.sens === "entrant" ? m.extrait : undefined })
  }
  if (st.deposeLe) ev.push({ quand: st.deposeLe, role: "etat", texte: "Dossier déposé sur le site", detail: "séquence arrêtée" })
  if (st.desinscritLe) ev.push({ quand: st.desinscritLe, role: "etat", texte: "Désinscrit", detail: CANAL_DESINSCRIPTION[st.desinscritCanal ?? ""] ?? st.desinscritCanal })
  if (st.injoignableLe) ev.push({ quand: st.injoignableLe, role: "erreur", texte: "Injoignable", detail: st.derniereErreur })
  if (st.termineLe) ev.push({ quand: st.termineLe, role: "etat", texte: "Séquence terminée", detail: st.statutMotif })
  return ev.sort((a, b) => (a.quand < b.quand ? -1 : 1))
}
