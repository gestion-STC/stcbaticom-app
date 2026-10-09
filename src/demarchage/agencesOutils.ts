// ════════════════════════════════════════════════════════════════════════════
// LES OUTILS DES ÉCRANS « AGENCES » — tout ce qui se calcule sans le DOM.
//
// Filtres locaux, tris, textes de dates (« il y a 3 jours »), le fil d'une
// fiche (activités + messages fusionnés, groupés par jour), les lignes d'export,
// le Prospect que réclame le modal d'e-mail. Pur et testé dans
// agencesOutils.test.ts ; les écrans ne font qu'appeler.
// ════════════════════════════════════════════════════════════════════════════
import type { Prospect } from "../data"
import type { Message } from "../lib/messagesDb"
import { supabase } from "../lib/supabase"
import {
  type Activite,
  type Agence,
  type Contact,
  type Etape,
  type File,
  type Secteur,
  type TypeActivite,
  type TypeAgence,
  ETAPES,
  SORTIES,
  dureeLisible,
  libelleEtape,
  libelleIssue,
  libelleMotif,
  libelleResultat,
  libelleRole,
  libelleType,
  nomContact,
} from "./modele"

// ── Les deux commerciaux, au cas où la liste des comptes ne répond pas ──
export const COMMERCIAUX_PAR_DEFAUT: { id: string; nom: string }[] = [
  { id: "b3a3dd4d-de08-4370-b794-227b8ddf0ba5", nom: "Mahdi Souissi" },
  { id: "46fd93e4-fcd0-4b5e-bac0-5ba1f92babdd", nom: "Horlann Maunier" },
]
export function nomCommercial(id: string | null, comptes: { id: string; nom: string }[]): string {
  if (!id) return ""
  return comptes.find((c) => c.id === id)?.nom ?? COMMERCIAUX_PAR_DEFAUT.find((c) => c.id === id)?.nom ?? ""
}

export const pluriel = (n: number, mot: string, pl = mot + "s") => `${n} ${n > 1 ? pl : mot}`
export const messageErreur = (e: unknown) => (e instanceof Error ? e.message : String(e))

// ── Dates ──
const JOUR_MS = 24 * 3600 * 1000
const debutDeJour = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** Nombre de jours civils entre une date et maintenant (0 = aujourd'hui ; négatif = à venir). */
export function joursDepuis(iso: string | null | undefined, maintenant: Date): number {
  if (!iso) return 0
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 0
  return Math.round((debutDeJour(maintenant) - debutDeJour(d)) / JOUR_MS)
}
/** « aujourd'hui », « hier », « il y a 3 jours », « dans 2 jours ». */
export function ilYA(iso: string | null | undefined, maintenant: Date): string {
  if (!iso) return ""
  const n = joursDepuis(iso, maintenant)
  if (n === 0) return "aujourd'hui"
  if (n === 1) return "hier"
  if (n === -1) return "demain"
  if (n < 0) return `dans ${-n} jours`
  return `il y a ${n} jours`
}
/** « depuis 3 j » (« depuis aujourd'hui » le jour même) : pour l'étape. */
export function depuisTexte(iso: string | null | undefined, maintenant: Date): string {
  if (!iso) return ""
  const n = joursDepuis(iso, maintenant)
  return n <= 0 ? "depuis aujourd'hui" : `depuis ${n} j`
}
export const dateCourte = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : "")
export const dateLongue = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "")
export const dateHeure = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "")
export const heure = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "")
/** Une échéance est en retard quand sa date est avant maintenant. */
export function enRetard(echeance: string | null | undefined, maintenant: Date): boolean {
  if (!echeance) return false
  return new Date(echeance).getTime() < maintenant.getTime()
}
/** « 2026-10-09 » du jour local, pour les champs <input type="date">. */
export function jourPourChamp(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
/** « 2026-10-09T10:00 » pour un <input type="datetime-local"> : demain 10 h par défaut. */
export function lendemainPourChamp(d: Date, heureDuJour = 10): string {
  const l = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, heureDuJour, 0, 0)
  return `${jourPourChamp(l)}T${String(heureDuJour).padStart(2, "0")}:00`
}
/** Une valeur de champ date (jour seul ou jour + heure) → ISO complet, ou null si vide. */
export function isoDepuisChamp(valeur: string): string | null {
  const v = (valeur || "").trim()
  if (!v) return null
  const d = v.length <= 10 ? new Date(`${v}T09:00:00`) : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// ── Les filtres de la liste ──
export type FiltresLocaux = {
  recherche: string
  secteur: string
  etape: Etape | "actives" | "sorties" | ""
  type: TypeAgence | ""
  enseigne: string
  jamaisJointe: boolean
  avecContact: boolean
}
export const FILTRES_VIDES: FiltresLocaux = { recherche: "", secteur: "", etape: "", type: "", enseigne: "", jamaisJointe: false, avecContact: false }
export type FileOuToutes = File | "toutes"

const plat = (s: unknown) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim()
const chiffres = (s: string) => (s || "").replace(/\D/g, "")

/** Les mêmes filtres que la base, appliqués en mémoire (pour les files, chargées sans filtre). */
export function filtrerAgences(agences: Agence[], f: FiltresLocaux): Agence[] {
  const texte = plat(f.recherche)
  const brut = f.recherche.trim()
  const numero = brut && /^[\d\s.+-]+$/.test(brut) ? chiffres(brut.replace(/^(\+33|0033)/, "0")) : ""
  const sorties: string[] = SORTIES.map((s) => s.code)
  return agences.filter((a) => {
    if (f.etape === "actives" && sorties.includes(a.etape)) return false
    if (f.etape === "sorties" && !sorties.includes(a.etape)) return false
    if (f.etape && f.etape !== "actives" && f.etape !== "sorties" && a.etape !== f.etape) return false
    if (f.secteur && a.secteur !== f.secteur) return false
    if (f.type && a.type !== f.type) return false
    if (f.enseigne && a.enseigne !== f.enseigne) return false
    if (f.jamaisJointe && a.jointFois > 0) return false
    if (f.avecContact && a.nbContacts === 0) return false
    if (texte) {
      const meule = plat([a.nom, a.enseigne, a.telephone, a.email, a.adresse, a.contactPrincipal, a.contactLigne, a.secteurLibelle].join(" "))
      const parTexte = meule.includes(texte)
      const parNumero = !!numero && (chiffres(a.telephone).includes(numero) || chiffres(a.contactLigne).includes(numero))
      if (!parTexte && !parNumero) return false
    }
    return true
  })
}

/** Les enseignes présentes, triées, sans vide. */
export function enseignesDistinctes(agences: Agence[]): string[] {
  const set = new Set<string>()
  for (const a of agences) if (a.enseigne.trim()) set.add(a.enseigne.trim())
  return [...set].sort((x, y) => x.localeCompare(y, "fr"))
}

/** Les secteurs regroupés par zone (Paris, 92, 93…), dans l'ordre de la base. */
export function secteursParZone(secteurs: Secteur[]): { zone: string; secteurs: Secteur[] }[] {
  const out: { zone: string; secteurs: Secteur[] }[] = []
  for (const s of secteurs) {
    const g = out.find((z) => z.zone === s.zone)
    if (g) g.secteurs.push(s)
    else out.push({ zone: s.zone, secteurs: [s] })
  }
  return out
}

// ── Le tri ──
export type CleTri = "nom" | "secteur" | "etape" | "dernierAppel" | "prochaineTache"
export type Tri = { cle: CleTri; sens: "asc" | "desc" }
const ORDRE_ETAPE: Record<string, number> = Object.fromEntries([...ETAPES.map((e, i) => [e.code, i]), ...SORTIES.map((s, i) => [s.code, 10 + i])])

export function trierAgences(agences: Agence[], tri: Tri): Agence[] {
  const dir = tri.sens === "asc" ? 1 : -1
  const parNom = (x: Agence, y: Agence) => x.nom.localeCompare(y.nom, "fr")
  // Les dates vides vont toujours à la fin, quel que soit le sens.
  const parDate = (x: string | null, y: string | null) => (x === y ? 0 : !x ? 1 : !y ? -1 : (x < y ? -1 : 1) * dir)
  return [...agences].sort((x, y) => {
    let r = 0
    switch (tri.cle) {
      case "nom": r = parNom(x, y) * dir; break
      case "secteur": r = (x.secteurLibelle || "~").localeCompare(y.secteurLibelle || "~", "fr", { numeric: true }) * dir; break
      case "etape": r = ((ORDRE_ETAPE[x.etape] ?? 99) - (ORDRE_ETAPE[y.etape] ?? 99)) * dir; break
      case "dernierAppel": r = parDate(x.dernierAppelLe, y.dernierAppelLe); break
      case "prochaineTache": r = parDate(x.prochaineEcheance, y.prochaineEcheance); break
    }
    return r || parNom(x, y)
  })
}
/** Cliquer une colonne : la même → on inverse ; une autre → ascendant. */
export function basculerTri(tri: Tri, cle: CleTri): Tri {
  return tri.cle === cle ? { cle, sens: tri.sens === "asc" ? "desc" : "asc" } : { cle, sens: "asc" }
}

/** Le sous-titre de la page : « 312 agences · 200 à prospecter · 40 intéressées · 12 clientes ». */
export function sousTitreAgences(parEtape: Record<string, number>): string {
  const total = Object.values(parEtape).reduce((n, v) => n + v, 0)
  const interessees = (parEtape.interesse ?? 0) + (parEtape.rdv_planifie ?? 0)
  return `${pluriel(total, "agence")} · ${parEtape.a_prospecter ?? 0} à prospecter · ${pluriel(interessees, "intéressée")} · ${pluriel(parEtape.client ?? 0, "cliente")}`
}

// ── Le fil d'une fiche ──
export type ElementFil = {
  id: string
  type: TypeActivite
  date: string
  titre: string
  detail: string
  note: string
  contactId: string | null
  auteur: string
  echeance: string | null
  faitLe: string | null
  tache: boolean // tâche ou RDV encore ouvert : on peut la terminer ou la reporter
}
export type FiltreFil = "tous" | TypeActivite
export const FILTRES_FIL: { code: FiltreFil; libelle: string }[] = [
  { code: "tous", libelle: "Tout" },
  { code: "appel", libelle: "Appels" },
  { code: "email", libelle: "E-mails" },
  { code: "rdv", libelle: "RDV" },
  { code: "tache", libelle: "Tâches" },
  { code: "note", libelle: "Notes" },
  { code: "etape", libelle: "Étapes" },
]
const RDV_TYPES: Record<string, string> = { telephone: "par téléphone", visio: "en visio", sur_place: "sur place" }

/** Le texte d'une activité, en deux lignes : le titre et le détail. */
export function texteActivite(a: Activite): { titre: string; detail: string } {
  switch (a.type) {
    case "appel": {
      const tete = a.sens === "entrant" ? "Appel entrant" : "Appel"
      const resultat = a.resultat ? libelleResultat(a.resultat) : ""
      const issue = a.issue ? ` → ${libelleIssue(a.issue)}` : ""
      const motif = a.motif ? ` (${libelleMotif(a.motif)})` : ""
      const detail = [dureeLisible(a.dureeS), a.numeroUtilise ? `depuis le ${a.numeroUtilise}` : ""].filter(Boolean).join(" · ")
      return { titre: `${tete}${resultat ? ` · ${resultat}` : ""}${issue}${motif}`, detail }
    }
    case "email":
      return { titre: a.titre || "(sans objet)", detail: a.sens === "entrant" ? "E-mail reçu" : "E-mail envoyé" }
    case "rdv": {
      const quand = a.echeance ? dateHeure(a.echeance) : ""
      const type = RDV_TYPES[a.rdvType] ?? ""
      return { titre: `RDV${a.titre ? ` · ${a.titre}` : ""}`, detail: [quand, type, a.faitLe ? "fait" : "à venir"].filter(Boolean).join(" · ") }
    }
    case "tache":
      return { titre: a.titre || "Tâche", detail: [a.echeance ? `pour le ${dateHeure(a.echeance)}` : "", a.faitLe ? "faite" : "à faire"].filter(Boolean).join(" · ") }
    case "note":
      return { titre: "Note", detail: "" }
    case "etape":
      return { titre: `${a.etapeDe ? libelleEtape(a.etapeDe) : "—"} → ${libelleEtape(a.etapeVers)}`, detail: a.motif ? libelleMotif(a.motif) : "" }
  }
}

/** Activités et messages de la boîte, fusionnés et triés du plus récent au plus ancien. */
export function fusionnerFil(activites: Activite[], messages: Message[]): ElementFil[] {
  const out: ElementFil[] = []
  const dejaLa = new Set<string>()
  for (const a of activites) {
    const { titre, detail } = texteActivite(a)
    if (a.messageId) dejaLa.add(a.messageId)
    out.push({ id: a.id, type: a.type, date: a.date, titre, detail, note: a.note, contactId: a.contactId, auteur: a.compteNom, echeance: a.echeance, faitLe: a.faitLe, tache: (a.type === "tache" || a.type === "rdv") && !a.faitLe })
  }
  for (const m of messages) {
    if (dejaLa.has(m.id)) continue // déjà journalisé comme activité : une seule ligne
    out.push({
      id: `m-${m.id}`, type: "email", date: m.date, titre: m.objet || "(sans objet)",
      detail: m.sens === "entrant" ? `Reçu de ${m.de}` : `Envoyé à ${m.a}`, note: "", contactId: null, auteur: "", echeance: null, faitLe: null, tache: false,
    })
  }
  return out.sort((x, y) => (x.date === y.date ? 0 : x.date < y.date ? 1 : -1))
}
export function filtrerFil(fil: ElementFil[], filtre: FiltreFil): ElementFil[] {
  return filtre === "tous" ? fil : fil.filter((e) => e.type === filtre)
}
/** Groupé par jour, du plus récent au plus ancien, avec un libellé lisible. */
export function grouperParJour(fil: ElementFil[], maintenant: Date): { jour: string; libelle: string; elements: ElementFil[] }[] {
  const out: { jour: string; libelle: string; elements: ElementFil[] }[] = []
  for (const e of fil) {
    const d = new Date(e.date)
    const jour = jourPourChamp(d)
    let g = out.find((x) => x.jour === jour)
    if (!g) {
      const n = joursDepuis(e.date, maintenant)
      const libelle = n === 0 ? "Aujourd'hui" : n === 1 ? "Hier" : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: d.getFullYear() === maintenant.getFullYear() ? undefined : "numeric" })
      g = { jour, libelle: libelle.charAt(0).toUpperCase() + libelle.slice(1), elements: [] }
      out.push(g)
    }
    g.elements.push(e)
  }
  return out
}
/** Les tâches et RDV encore ouverts, les plus proches d'abord. */
export function tachesOuvertes(activites: Activite[]): Activite[] {
  return activites.filter((a) => (a.type === "tache" || a.type === "rdv") && !a.faitLe).sort((x, y) => ((x.echeance ?? "") < (y.echeance ?? "") ? -1 : 1))
}
/** Une note est « longue » au-delà de trois lignes ou de 240 caractères : on la replie. */
export function noteLongue(note: string): boolean {
  return (note || "").split("\n").length > 3 || (note || "").length > 240
}

// ── Le Prospect que réclame le modal d'e-mail (on ne le réécrit pas) ──
export function prospectDepuis(agence: Agence, contact: Contact | null): Prospect {
  return {
    id: agence.id,
    entreprise: agence.nom,
    contact: contact ? nomContact(contact) : "",
    telephone: contact?.ligneDirecte || contact?.mobile || agence.telephone,
    email: contact?.email || agence.email,
    adresse: agence.adresse,
    arrondissement: agence.secteurLibelle,
    commentaire: "",
    type: "",
    statut: "",
    priorite: "—",
    prochaineRelance: "",
  }
}

// ── Les lignes d'export ──
export type LigneExportAgence = {
  nom: string; enseigne: string; type: string; secteur: string; adresse: string; telephone: string; email: string; site: string; nbLots: number | ""
  etape: string; etapeDepuis: string; tentatives: number; jointFois: number; contactPrincipal: string; contactLigne: string; nbContacts: number
  dernierAppel: string; dernierResultat: string; prochaineTache: string; prochaineEcheance: string; premierOs: string; motif: string
}
export function ligneExportAgence(a: Agence): LigneExportAgence {
  return {
    nom: a.nom, enseigne: a.enseigne, type: libelleType(a.type), secteur: a.secteurLibelle, adresse: a.adresse, telephone: a.telephone, email: a.email, site: a.site, nbLots: a.nbLots || "",
    etape: libelleEtape(a.etape), etapeDepuis: a.etapeDepuis ? a.etapeDepuis.slice(0, 10) : "", tentatives: a.tentatives, jointFois: a.jointFois,
    contactPrincipal: a.contactPrincipal, contactLigne: a.contactLigne, nbContacts: a.nbContacts,
    dernierAppel: a.dernierAppelLe ? a.dernierAppelLe.slice(0, 10) : "", dernierResultat: a.dernierResultat ? libelleResultat(a.dernierResultat) : "",
    prochaineTache: a.prochaineTache, prochaineEcheance: a.prochaineEcheance ? a.prochaineEcheance.slice(0, 10) : "", premierOs: a.premierOsLe ?? "", motif: a.motif ? libelleMotif(a.motif) : "",
  }
}
export type LigneExportContact = { agence: string; enseigne: string; secteur: string; standard: string; prenom: string; nom: string; role: string; ligneDirecte: string; mobile: string; email: string; principal: string; parti: string; note: string }
export function ligneExportContact(c: Contact, a: Pick<Agence, "nom" | "enseigne" | "secteurLibelle" | "telephone">): LigneExportContact {
  return {
    agence: a.nom, enseigne: a.enseigne, secteur: a.secteurLibelle, standard: a.telephone, prenom: c.prenom, nom: c.nom, role: libelleRole(c.role),
    ligneDirecte: c.ligneDirecte, mobile: c.mobile, email: c.email, principal: c.principal ? "oui" : "", parti: c.parti ? "oui" : "", note: c.note,
  }
}
export type LigneExportApporteur = { nom: string; contact: string; telephone: string; email: string; secteur: string; adresse: string }
export function ligneExportApporteur(a: Agence): LigneExportApporteur {
  return { nom: a.nom, contact: a.contactPrincipal, telephone: a.contactLigne || a.telephone, email: a.email, secteur: a.secteurLibelle, adresse: a.adresse }
}

/** Assez de matière pour chercher un doublon : un nom de 3 lettres ou un numéro de 9 chiffres. */
export function peutChercherDoublons(nom: string, telephone: string): boolean {
  return nom.trim().length >= 3 || chiffres(telephone).length >= 9
}

// ── Une lecture qui manque à db.ts : les contacts de plusieurs agences (pour l'export) ──
export async function chargerContactsDesAgences(agenceIds: string[]): Promise<Contact[]> {
  if (!supabase) throw new Error("Supabase n'est pas configuré.")
  if (agenceIds.length === 0) return []
  type L = { id: string; agence_id: string; prenom: string; nom: string; role: Contact["role"]; ligne_directe: string; mobile: string; email: string; principal: boolean; parti: boolean; note: string; cree_le: string }
  const out: Contact[] = []
  // PostgREST limite la longueur d'une URL : on interroge par paquets de 200 agences.
  for (let i = 0; i < agenceIds.length; i += 200) {
    const { data, error } = await supabase.from("contacts").select("id, agence_id, prenom, nom, role, ligne_directe, mobile, email, principal, parti, note, cree_le").in("agence_id", agenceIds.slice(i, i + 200)).order("principal", { ascending: false }).limit(5000)
    if (error) throw new Error(error.message)
    for (const l of (data ?? []) as L[]) {
      out.push({ id: l.id, agenceId: l.agence_id, prenom: l.prenom ?? "", nom: l.nom ?? "", role: l.role ?? "gestionnaire", ligneDirecte: l.ligne_directe ?? "", mobile: l.mobile ?? "", email: l.email ?? "", principal: !!l.principal, parti: !!l.parti, note: l.note ?? "", creeLe: l.cree_le })
    }
  }
  return out
}
