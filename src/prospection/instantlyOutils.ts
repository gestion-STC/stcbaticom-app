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
/** Un lien se lit en mots : [Mon texte](adresse), sinon « Cliquez ici ». L'adresse technique ne s'affiche jamais. */
export const LIBELLE_LIEN = "Cliquez ici"
const liens = (s: string) => echapper(s).replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)/g, (_tout, texte: string | undefined, url: string | undefined, nu: string | undefined) => (url ? `<a href="${url}">${texte}</a>` : `<a href="${nu}">${LIBELLE_LIEN}</a>`))
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

/**
 * Les variables d'un texte. {{secteur|votre secteur}} : la valeur de la fiche, sinon le repli écrit après la barre.
 * Sans valeur ni repli, la variable disparaît avec son espace : « Bonjour {{prenom}}, » devient « Bonjour, ».
 * Une variable inconnue (les liens) reste telle quelle.
 */
export function remplirVariables(s: string, valeurs: Record<string, string>): string {
  return s.replace(/([ \u00a0]*)\{\{([a-z_]+)(?:\|([^}]*))?\}\}/g, (tout, espaces: string, cle: string, repli?: string) => {
    if (!(cle in valeurs)) return tout
    const v = valeurs[cle].trim() || (repli ?? "").trim()
    return v ? `${espaces}${v}` : ""
  })
}
export const remplirContact = (s: string, personne: string) => remplirVariables(s, { contact: personne })

/** Les valeurs d'une fiche, pour ses variables. */
export function valeursDe(k: { nom: string; personne: string; champs: Record<string, string> }): Record<string, string> {
  const c = k.champs
  return { contact: k.personne, prenom: c.prenom ?? "", entreprise: k.nom, agence: k.nom, secteur: c.secteur ?? "", enseigne: c.enseigne === "Indépendante" ? "" : c.enseigne ?? "", metier: c.metier ?? "", zone: c.zone ?? "" }
}

/** Ce qu'une série de boîtes peut envoyer par jour sans abîmer leur réputation. */
export const MAILS_PAR_BOITE = 30
export const capaciteJour = (boites: number) => boites * MAILS_PAR_BOITE

/** Les conseils avant d'envoyer : jamais un blocage (Mahdi, 10/11/2026 : « des conseils »). */
export const JOURS_CHAUFFE = 14
export function conseilsEnvoi(boites: { depuis?: string | null }[], parJour: number, maintenant: string): string[] {
  if (!boites.length) return ["Conseil : aucune boîte d'envoi n'est prête pour cette cible."]
  const out: string[] = []
  const capacite = capaciteJour(boites.length)
  if (parJour > capacite) out.push(`Conseil : ${MAILS_PAR_BOITE} envois par boîte et par jour, soit ${capacite} pour cette cible. Tes campagnes en prévoient ${parJour}.`)
  const jours = boites.flatMap((b) => (b.depuis ? [Math.floor((new Date(maintenant).getTime() - new Date(b.depuis).getTime()) / 86_400_000)] : []))
  if (jours.length && Math.min(...jours) < JOURS_CHAUFFE) out.push(`Conseil : ces boîtes chauffent depuis ${Math.min(...jours)} jour${Math.min(...jours) > 1 ? "s" : ""}. Mieux vaut attendre ${JOURS_CHAUFFE} jours avant de lancer.`)
  return out
}

/** Trop de rebonds : on arrête avant d'abîmer les boîtes. Pas de décision sur moins de 30 envois. */
export const ENVOIS_MIN_ARRET = 30
export const TAUX_REBONDS_ARRET = 0.03
export function doitArreter(envoyes: number, rebonds: number): boolean {
  return envoyes >= ENVOIS_MIN_ARRET && rebonds / envoyes > TAUX_REBONDS_ARRET
}
