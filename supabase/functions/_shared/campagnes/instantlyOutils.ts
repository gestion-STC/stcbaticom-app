// L'ENVOI DES MAILS DE PROSPECTION PAR INSTANTLY (09/11/2026) : ce qui se calcule sans rien appeler. Copie exacte côté
// serveur (_shared/campagnes/instantlyOutils.ts), vérifiée par un test. Fichier PUR.

/** Demandée par Mahdi le 10/11/2026 : le mail dit que les clics sont suivis. */
export const PHRASE_SUIVI = "Nous suivons les clics sur ces liens et pouvons vous recontacter si le sujet vous intéresse."
export const SIGNATURE_PROSPECTION = "L'équipe STC Bâtiment\nSTC Bâtiment · 7 rue Oscar Niemeyer, 78280 Guyancourt"

/** Les boîtes d'une base : chacune garde les siennes ; si aucune ne porte le bon nom, toutes servent. */
export function boitesDe(baseId: string, emails: string[]): string[] {
  const noms = baseId === "artisans" ? ["artisans"] : ["partenaire", "partenaires", "interventions"]
  const miennes = emails.filter((e) => noms.includes(e.split("@")[0].toLowerCase()))
  return miennes.length ? miennes : emails
}

/** Une boîte utilisable : active et configurée. */
export function boitePrete(b: { status?: number | null; setup_pending?: boolean | null }): boolean {
  return b.status === 1 && !b.setup_pending
}

/**
 * L'horaire de la campagne pour Instantly. Instantly ne connaît pas « Europe/Paris » :
 * Europe/Belgrade suit la même heure, été comme hiver. Les jours vont de 0 (dimanche) à 6.
 */
export function horaireInstantly(r: { jours: number[]; heureMin: number; heureMax: number }) {
  const heure = (h: number) => (h >= 24 ? "23:59" : `${String(h).padStart(2, "0")}:00`)
  return {
    schedules: [{ name: "Baticom", timing: { from: heure(r.heureMin), to: heure(r.heureMax) }, days: Object.fromEntries(r.jours.map((j) => [String(j % 7), true])), timezone: "Europe/Belgrade" }],
  }
}

const echapper = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const estHtml = (s: string) => /<(html|body|table|div|p|a|br)\b/i.test(s)
const liens = (s: string) => echapper(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
// Une image ajoutée dans le texte reste une image ; tout le reste est du texte.
const texteEnHtml = (s: string) => s.split(/(<img\b[^>]*>)/i).map((morceau, i) => (i % 2 ? morceau : liens(morceau))).join("").replace(/\n/g, "<br/>")

/** Le corps prêt à partir : en HTML, avec la signature, l'adresse postale de STC et le lien de désinscription, jamais en double. */
export function corpsAvecMentions(texte: string, desinscription?: string, suivi = false): string {
  const html = estHtml(texte) ? texte : texteEnHtml(texte)
  const mentions = [suivi && !texte.includes(PHRASE_SUIVI) ? PHRASE_SUIVI : "", texte.includes("78280") ? "" : SIGNATURE_PROSPECTION.replace(/\n/g, "<br/>"), desinscription ? `Pour ne plus recevoir nos messages : <a href="${desinscription}">se désinscrire</a>` : ""].filter(Boolean).join("<br/>")
  if (!mentions) return html
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `<p>${mentions}</p></body>`)
  return `${html}<br/><br/>${mentions}`
}

/** Ce qu'une série de boîtes peut envoyer par jour sans abîmer leur réputation. */
export const MAILS_PAR_BOITE = 30
export const capaciteJour = (boites: number) => boites * MAILS_PAR_BOITE

/** Trop de rebonds : on arrête avant d'abîmer les boîtes. Pas de décision sur moins de 30 envois. */
export const ENVOIS_MIN_ARRET = 30
export const TAUX_REBONDS_ARRET = 0.03
export function doitArreter(envoyes: number, rebonds: number): boolean {
  return envoyes >= ENVOIS_MIN_ARRET && rebonds / envoyes > TAUX_REBONDS_ARRET
}
