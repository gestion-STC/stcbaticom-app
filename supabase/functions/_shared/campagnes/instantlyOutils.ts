// L'ENVOI DES MAILS DE PROSPECTION PAR INSTANTLY (09/11/2026) : ce qui se calcule sans rien appeler. Copie exacte côté
// serveur (_shared/campagnes/instantlyOutils.ts), vérifiée par un test. Fichier PUR.

export const SIGNATURE_PROSPECTION = "L'équipe STC Bâtiment\nSTC Bâtiment · 7 rue Oscar Niemeyer, 78280 Guyancourt"

/** Les boîtes d'une base : chacune garde les siennes ; si aucune ne porte le bon nom, toutes servent. */
export function boitesDe(baseId: string, emails: string[]): string[] {
  const noms = baseId === "artisans" ? ["artisans"] : ["partenaires", "interventions"]
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
const texteEnHtml = (s: string) => echapper(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, "<br/>")

/** Le corps prêt à partir : en HTML, avec la signature et l'adresse postale de STC, jamais en double. */
export function corpsAvecMentions(texte: string): string {
  const signature = SIGNATURE_PROSPECTION.replace(/\n/g, "<br/>")
  const html = estHtml(texte) ? texte : texteEnHtml(texte)
  if (texte.includes("78280")) return html
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `<p>${signature}</p></body>`)
  return `${html}<br/><br/>${signature}`
}
