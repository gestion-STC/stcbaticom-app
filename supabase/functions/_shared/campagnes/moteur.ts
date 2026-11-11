// ── LE MOTEUR DES CAMPAGNES : un passage (07/11/2026) ──
// Fonction PURE : on lui donne l'état, l'heure et un fabricant d'identifiants, elle rend ce qu'il faut écrire.
// Le même code tournera côté serveur (toutes les 10 min) ; la maquette l'appelle à chaque « avancer le temps ».
// Règles reprises de la machine sous-traitants (sequenceur-st) : plafond de nouveaux contacts par jour, plage
// horaire et jours ouvrés, 48 h entre deux touches, un SMS sans mobile ou un mail sans adresse est « sauté ».
import type { Campagne, Contact, Envoi, Etape, Evenement, Id, Inscription, Lead, Tache, Variante } from "./modele.ts"
import { estEligible } from "./modele.ts"

export type Ecritures = { inscriptions: Inscription[]; majInscriptions: Inscription[]; envois: Envoi[]; taches: Tache[] }
type Etat = { campagne: Campagne; contacts: Contact[]; inscriptions: Inscription[]; envois: Envoi[]; evenements: Evenement[] }

const JOUR = 86_400_000
// L'heure et le jour de PARIS, où que tourne le code (le serveur est en heure universelle).
const paris = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", ...o }).format(d)
export const heureParis = (d: Date) => Number(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "numeric", hourCycle: "h23" }).formatToParts(d).find((p) => p.type === "hour")?.value ?? 0)
const JOURS_FR = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
/** Jour ISO de la semaine à Paris (1 = lundi … 7 = dimanche). */
export const jourParis = (d: Date) => JOURS_FR.indexOf(paris(d, { weekday: "long" })) + 1
const jourDe = (iso: string) => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date(iso))

/** Les jours fériés en France (Mahdi, 11/11/2026) : rien ne part ces jours-là, les envois prévus partent le jour ouvré suivant. */
function paques(annee: number): Date {
  const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(annee, mois - 1, jour))
}
/** `jour` au format AAAA-MM-JJ (le jour à Paris). */
export function estFerie(jour: string): boolean {
  if (["01-01", "05-01", "05-08", "07-14", "08-15", "11-01", "11-11", "12-25"].includes(jour.slice(5))) return true
  const p = paques(Number(jour.slice(0, 4)))
  return [1, 39, 50].some((n) => new Date(p.getTime() + n * 86_400_000).toISOString().slice(0, 10) === jour) // lundi de Pâques, Ascension, lundi de Pentecôte
}

export function dansLaPlage(c: Campagne, maintenant: Date): boolean {
  const h = heureParis(maintenant)
  return c.rythme.jours.includes(jourParis(maintenant)) && !estFerie(jourDe(maintenant.toISOString())) && h >= c.rythme.heureMin && h < c.rythme.heureMax
}

/** Une étape qui envoie : la variante du contact (A/B réparti par contact, toujours la même pour lui). */
export function varianteDe(etape: { variantes: Variante[] }, contactId: Id): Variante | null {
  if (!etape.variantes.length) return null
  let h = 0
  for (const ch of contactId) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return etape.variantes[h % etape.variantes.length]
}

function conditionVraie(cond: Extract<Etape, { type: "si" }>["condition"], contact: Contact, evenements: Evenement[]): boolean {
  switch (cond) {
    case "a_ouvert": return evenements.some((e) => e.type === "ouvert")
    case "a_clique": return evenements.some((e) => e.type === "clic")
    case "a_repondu": return evenements.some((e) => e.type === "reponse")
    case "a_mobile": return Boolean(contact.mobile)
    case "a_email": return Boolean(contact.email)
    case "a_accepte": return evenements.some((e) => e.type === "connexion")
  }
}

export function passage(etat: Etat, maintenant: Date, nouvelId: () => Id): Ecritures {
  const { campagne: c } = etat
  const sortie: Ecritures = { inscriptions: [], majInscriptions: [], envois: [], taches: [] }
  if (c.statut !== "active") return sortie
  const iso = maintenant.toISOString()
  const ouvert = dansLaPlage(c, maintenant)

  // 1. Les entrées du jour : jusqu'au plafond, parmi les éligibles qui ne sont dans aucune campagne en cours.
  if (ouvert) {
    const occupes = new Set(etat.inscriptions.filter((i) => i.statut === "en_cours" || i.campagneId === c.id).map((i) => i.contactId))
    const entresAujourdhui = etat.inscriptions.filter((i) => i.campagneId === c.id && jourDe(i.entreeLe) === jourDe(iso)).length
    const place = Math.max(0, c.rythme.parJour - entresAujourdhui)
    const candidats = etat.contacts.filter((k) => !occupes.has(k.id) && k.statut === "libre" && estEligible(k, c, maintenant)).slice(0, place)
    for (const k of candidats) sortie.inscriptions.push({ id: nouvelId(), campagneId: c.id, contactId: k.id, entreeLe: iso, etapeIndex: 0, prochaineLe: iso, statut: "en_cours", sortieLe: null })
  }

  // 2. Les étapes dues. Une seule touche par contact et par passage ; « Attendre » et « Si… » s'enchaînent.
  const parContact = new Map(etat.contacts.map((k) => [k.id, k]))
  const tous = [...etat.inscriptions.filter((i) => i.campagneId === c.id), ...sortie.inscriptions]
  for (const insc of tous) {
    if (insc.statut !== "en_cours" || insc.prochaineLe > iso) continue
    const contact = parContact.get(insc.contactId)
    if (!contact) continue
    const evs = etat.evenements.filter((e) => e.campagneId === c.id && e.contactId === contact.id)
    // Il a répondu, oui ou non : on ne le relance plus (Mahdi, 10/11/2026).
    if (evs.some((e) => e.type === "reponse")) { sortie.majInscriptions.push({ ...insc, statut: "terminee", sortieLe: iso }); continue }
    const derniereTouche = etat.envois.filter((e) => e.inscriptionId === insc.id && e.statut === "envoye").reduce((m, e) => (e.le > m ? e.le : m), "")
    let i = insc.etapeIndex
    let prochaine = insc.prochaineLe
    let statut: Inscription["statut"] = insc.statut
    let touche = false
    for (let garde = 0; garde < c.etapes.length + 1; garde++) {
      const e = c.etapes[i]
      if (!e || e.type === "fin") { statut = "terminee"; break }
      if (e.type === "attendre") { prochaine = new Date(maintenant.getTime() + e.jours * JOUR).toISOString(); i += 1; break }
      if (e.type === "si") {
        if (conditionVraie(e.condition, contact, evs)) i += 1
        else { const k = e.sinonVers ? c.etapes.findIndex((x) => x.id === e.sinonVers) : -1; i = k >= 0 ? k : i + 1 }
        continue
      }
      if (e.type === "appel") {
        sortie.taches.push({ id: nouvelId(), contactId: contact.id, campagneId: c.id, etapeId: e.id, type: "appel", consigne: e.consigne, cible: e.cible, creeLe: iso, faiteLe: null })
        i += 1
        continue
      }
      // Une étape qui envoie : dans la plage horaire, et 48 h après la touche précédente.
      if (touche || !ouvert) break
      if (derniereTouche && maintenant.getTime() - new Date(derniereTouche).getTime() < c.rythme.ecartMinH * 3_600_000) break
      // LinkedIn automatique (11/11/2026) : un envoi par le compte branché, vers le profil de la fiche.
      if (e.type === "linkedin" && (e.linkedin === "invitation" || e.linkedin === "message")) {
        const v = varianteDe(e, contact.id), profil = contact.champs.linkedin ?? ""
        sortie.envois.push({ id: nouvelId(), campagneId: c.id, inscriptionId: insc.id, contactId: contact.id, etapeId: e.id, varianteId: v?.id ?? null, canal: "linkedin", le: iso, statut: profil ? "envoye" : "saute", cause: profil ? "" : "pas de profil LinkedIn" })
        i += 1
        touche = true
        continue
      }
      if (e.type === "linkedin") {
        sortie.taches.push({ id: nouvelId(), contactId: contact.id, campagneId: c.id, etapeId: e.id, type: "linkedin", consigne: e.variantes[0]?.corps ?? "", creeLe: iso, faiteLe: null })
        i += 1
        touche = true
        continue
      }
      const v = varianteDe(e, contact.id)
      const adresse = e.type === "sms" ? contact.mobile : contact.email
      sortie.envois.push({
        id: nouvelId(), campagneId: c.id, inscriptionId: insc.id, contactId: contact.id, etapeId: e.id, varianteId: v?.id ?? null,
        canal: e.type, le: iso, statut: adresse ? "envoye" : "saute", cause: adresse ? "" : e.type === "sms" ? "pas de mobile" : "pas de mail",
      })
      i += 1
      touche = true
    }
    if (i !== insc.etapeIndex || prochaine !== insc.prochaineLe || statut !== insc.statut) {
      const maj = { ...insc, etapeIndex: i, prochaineLe: prochaine, statut, sortieLe: statut === "en_cours" ? null : iso }
      const k = sortie.inscriptions.findIndex((x) => x.id === insc.id)
      if (k >= 0) sortie.inscriptions[k] = maj
      else sortie.majInscriptions.push(maj)
    }
  }
  return sortie
}

/** Les signaux qui font un lead : le contact sort de la séquence et part dans la session de call. */
export function leadsNouveaux(c: Campagne, evenements: Evenement[], inscriptions: Inscription[], leads: Lead[], contacts: Contact[], maintenant: Date, nouvelId: () => Id, lienPrincipal = "le lien principal"): { leads: Lead[]; sorties: Inscription[] } {
  const deja = new Set(leads.filter((l) => l.statut === "a_traiter").map((l) => l.contactId))
  const parContact = new Map(contacts.map((k) => [k.id, k]))
  const out: Lead[] = [], sorties: Inscription[] = []
  const iso = maintenant.toISOString()
  for (const insc of inscriptions) {
    if (insc.campagneId !== c.id || insc.statut !== "en_cours" || deja.has(insc.contactId)) continue
    const evs = evenements.filter((e) => e.campagneId === c.id && e.contactId === insc.contactId)
    let signal = ""
    if (c.signaux.includes("reponse") && evs.some((e) => e.type === "reponse")) signal = "A répondu au mail"
    else if (c.signaux.includes("clic_lien_principal") && evs.some((e) => e.type === "clic" && e.lien === "principal")) signal = `A cliqué « ${lienPrincipal} »`
    else if (c.signaux.includes("clic_lien") && evs.some((e) => e.type === "clic")) signal = "A cliqué un lien"
    else if (c.signaux.includes("ouvertures_2") && evs.filter((e) => e.type === "ouvert" && maintenant.getTime() - new Date(e.le).getTime() < 7 * JOUR).length >= 2) signal = "A ouvert 2 fois en 7 jours"
    if (!signal) continue
    const k = parContact.get(insc.contactId)
    out.push({ id: nouvelId(), contactId: insc.contactId, baseId: c.baseId, campagneId: c.id, signal, creeLe: iso, statut: "a_traiter", proprietaireId: k?.proprietaireId ?? null })
    sorties.push({ ...insc, statut: "lead", sortieLe: iso })
  }
  return { leads: out, sorties }
}
