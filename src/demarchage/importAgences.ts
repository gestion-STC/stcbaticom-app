// ════════════════════════════════════════════════════════════════════════════
// L'IMPORT D'AGENCES depuis un fichier Excel (.xlsx) ou CSV (09/10/2026).
//
// Une ligne du fichier = une agence (+ son contact, s'il y en a un). On lit
// le fichier avec ou sans ligne d'en-tête : avec, les colonnes sont nommées ;
// sans, on repère l'e-mail, le téléphone et le code postal n'importe où sur
// la ligne, comme l'ancien import des prospects. La couleur de ligne ne
// décide plus de rien : une agence importée entre « à prospecter ».
//
// Rien n'est écrit avant que l'écran ait montré l'analyse : ce qui va être
// créé, ce qui est déjà dans la base, ce qui est ignoré et pourquoi.
// ExcelJS (~1 Mo) n'est chargé qu'au moment de lire un .xlsx.
// ════════════════════════════════════════════════════════════════════════════
import type ExcelJS from "exceljs"
import { supabase } from "../lib/supabase"
import { lireParLots } from "../lib/pagination"
import { extraireNom, parseCsv } from "../lib/importProspects"
import { creerAgence, creerContact } from "./db"
import { enseigneDe, nomCle, secteurDepuis, type TypeAgence } from "./modele"
import { assurerSecteurs } from "./secteursOutils"

export type ContactImport = { nom: string; email: string; ligne: string }
export type LigneImport = {
  numero: number // le numéro de la ligne dans le fichier, pour en parler à l'humain
  apercu: string // les premières cellules, pour montrer une ligne sans nom
  nom: string
  telephone: string
  email: string
  adresse: string
  secteur: string | null
  enseigne: string
  type: TypeAgence
  contactNom: string
  contactEmail: string
  contactLigne: string
  // Les contacts des lignes en double dans le fichier (une ligne par gestionnaire).
  autresContacts: ContactImport[]
}
export type Ignoree = { ligne: LigneImport; raison: string }
export type DejaLa = { ligne: LigneImport; agenceId: string; contactsAAjouter: ContactImport[] }
export type Analyse = {
  aCreer: LigneImport[]
  dejaLa: DejaLa[]
  ignorees: Ignoree[]
  secteursInconnus: string[] // codes postaux absents de la liste des secteurs : créés à l'import
  feuille: string
  total: number // lignes non vides lues (hors en-tête)
}
export type AgenceConnue = { id: string; nomCle: string; secteur: string | null; telephone: string }
export type FichierLu = { lignes: string[][]; feuille: string }

// ── Petits outils de lecture ──
const norm = (s: unknown) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()
const chiffres = (t: string) => (t || "").replace(/\D/g, "")
const RE_EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/gi
// Un numéro français écrit à la française : 0X XX XX XX XX, +33 X…, 0033 X…, avec espaces, points ou tirets.
const RE_TEL = /(?:\+33|0033|0)\s*[1-9](?:[\s.-]?\d{2}){4}\b/g

// « 143000000 » (Excel a mangé le 0), « +33 1 43… », « 0033… » → « 01 43 00 00 00 ». Vide si ce n'est pas un numéro.
export function telephonePropre(brut: string): string {
  let d = chiffres(brut)
  if (d.startsWith("0033")) d = d.slice(4)
  if (d.length === 11 && d.startsWith("33")) d = d.slice(2)
  if (d.length === 9) d = "0" + d
  if (d.length !== 10 || d[0] !== "0") return ""
  return (d.match(/.{1,2}/g) ?? []).join(" ")
}
// La clé de comparaison de deux numéros : les 9 chiffres après le 0.
const cleTel = (t: string) => { const d = chiffres(telephonePropre(t) || t); return d.length >= 9 ? d.slice(-9) : "" }

// Tous les numéros d'une cellule, dans l'ordre, sans doublon.
export function trouverTelephones(cellules: string[]): string[] {
  const out: string[] = []
  const vus = new Set<string>()
  const garder = (t: string) => { const p = telephonePropre(t); const k = cleTel(p); if (p && k && !vus.has(k)) { vus.add(k); out.push(p) } }
  for (const c of cellules) {
    for (const m of c.match(RE_TEL) ?? []) garder(m)
    // Une cellule qui n'est QU'un nombre de 9 ou 10 chiffres : un numéro dont Excel a perdu le 0 ou les espaces.
    if (/^\s*\+?[\d\s.\-()]{9,14}\s*$/.test(c) && chiffres(c).length >= 9 && chiffres(c).length <= 12) garder(c)
  }
  return out
}
export function trouverEmails(cellules: string[]): string[] {
  const out: string[] = []
  for (const c of cellules) for (const m of c.match(RE_EMAIL) ?? []) { const e = m.toLowerCase(); if (!out.includes(e)) out.push(e) }
  return out
}
const estEmail = (c: string) => new RegExp(RE_EMAIL.source, "i").test(c)
const estTel = (c: string) => trouverTelephones([c]).length > 0 && chiffres(c).length === c.replace(/[\s.\-()+]/g, "").length

// ── Les colonnes, quand le fichier a une ligne d'en-tête ──
type Colonnes = Partial<Record<"nom" | "telephone" | "email" | "adresse" | "secteur" | "contactNom" | "contactEmail" | "contactLigne" | "type" | "note", number>>
const MOTS_ENTETE = ["agence", "entreprise", "societe", "nom", "tel", "telephone", "email", "mail", "adresse", "ville", "contact", "gestionnaire", "code postal", "secteur", "type", "note", "commentaire"]

export function estEntete(cellules: string[]): boolean {
  if (trouverEmails(cellules).length || trouverTelephones(cellules).length) return false
  const txt = cellules.map(norm).join(" | ")
  return MOTS_ENTETE.filter((m) => txt.includes(m)).length >= 2
}
export function repererColonnes(entete: string[]): Colonnes {
  const c: Colonnes = {}
  const poser = (k: keyof Colonnes, i: number) => { if (c[k] === undefined) c[k] = i }
  entete.forEach((cel, i) => {
    const h = norm(cel)
    if (!h) return
    const contact = /contact|gestionnaire|interlocuteur|responsable|personne/.test(h)
    if (/ligne directe|direct|portable|mobile|gsm/.test(h)) poser("contactLigne", i)
    else if (contact && /mail|courriel/.test(h)) poser("contactEmail", i)
    else if (/mail|courriel/.test(h)) poser("email", i)
    else if (contact || /prenom/.test(h)) poser("contactNom", i)
    else if (/tel|phone|standard/.test(h)) poser("telephone", i)
    else if (/code postal|^cp$|secteur|arrondissement/.test(h)) poser("secteur", i)
    else if (/adresse|rue|ville/.test(h)) poser("adresse", i)
    else if (/^type|categorie|nature/.test(h)) poser("type", i)
    else if (/note|commentaire|remarque|observation/.test(h)) poser("note", i)
    else if (/agence|entreprise|societe|raison|enseigne|nom/.test(h)) poser("nom", i)
  })
  return c
}

// La cellule « note » : celle qui porte Nom:/Mail:, sinon le premier texte libre après les deux premières colonnes.
function trouverNote(cellules: string[], exclure: Set<number>): string {
  for (const c of cellules) if (/nom\s*:|mail\s*:/i.test(c)) return c.trim()
  for (let i = 2; i < cellules.length; i++) {
    if (exclure.has(i)) continue
    const c = (cellules[i] ?? "").trim()
    if (c && !estEmail(c) && !estTel(c) && /[a-zàâçéèêëîïôûùü]/i.test(c) && c.length > 3) return c
  }
  return ""
}
const TYPES_PAR_MOT: [RegExp, TypeAgence][] = [
  [/apporteur|apport\s*d['’]?\s*affaire/i, "apporteur"], [/syndic/i, "syndic"], [/administrateur/i, "administrateur"], [/bailleur/i, "bailleur"],
]
function typeDepuis(texte: string, large: boolean): TypeAgence {
  for (const [re, t] of TYPES_PAR_MOT) if (re.test(texte) && (large ? t === "apporteur" : true)) return t
  return "agence"
}
const propre = (s: string) => (s || "").replace(/\s+/g, " ").replace(/^[·.,;:\s\-–—]+|[·.,;:\s\-–—]+$/g, "").trim()

// Une ligne brute → une ligne d'import. Null si la ligne est vide.
export function lireLigne(cellules: string[], numero: number, cols: Colonnes): LigneImport | null {
  const cel = cellules.map((c) => (c ?? "").trim())
  if (!cel.some(Boolean)) return null
  const avecEntete = cols.nom !== undefined || cols.telephone !== undefined || cols.email !== undefined
  const lire = (k: keyof Colonnes) => (cols[k] !== undefined ? cel[cols[k]] ?? "" : "")
  const apercu = cel.filter(Boolean).slice(0, 3).join(" · ").slice(0, 80)

  const nom = propre(avecEntete && cols.nom !== undefined ? lire("nom") : cel[0])
  const colonnesPrises = new Set(Object.values(cols).filter((v): v is number => v !== undefined))
  const reste = cel.filter((_, i) => !colonnesPrises.has(i) && i !== 0)

  // Téléphones : la colonne nommée d'abord, puis tout ce qu'on trouve ailleurs (le 2e devient la ligne directe).
  const telsColonne = trouverTelephones([lire("telephone")])
  const telsLigne = trouverTelephones([lire("contactLigne")])
  const telsAilleurs = trouverTelephones(reste).filter((t) => !telsColonne.includes(t) && !telsLigne.includes(t))
  const telephone = telsColonne[0] ?? telsAilleurs.shift() ?? ""
  const contactLigne = telsLigne[0] ?? telsAilleurs.shift() ?? ""

  // E-mails : la colonne nommée d'abord ; sans en-tête, l'e-mail d'une note « Nom: … Mail: … » est celui du contact.
  const note = cols.note !== undefined ? lire("note") : trouverNote(cel, colonnesPrises)
  const emailsColonne = trouverEmails([lire("email")])
  const emailsContact = trouverEmails([lire("contactEmail")])
  const emailsNote = /nom\s*:|mail\s*:/i.test(note) ? trouverEmails([note]) : []
  const emailsAilleurs = trouverEmails(reste).filter((e) => !emailsColonne.includes(e) && !emailsContact.includes(e) && !emailsNote.includes(e))
  const contactEmail = emailsContact[0] ?? emailsNote[0] ?? ""
  const email = emailsColonne[0] ?? emailsAilleurs[0] ?? ""

  // Adresse et secteur : la colonne nommée, sinon la cellule qui porte un code postal, sinon la 2e colonne.
  let adresse = propre(lire("adresse"))
  if (!adresse && !avecEntete) {
    const avecCp = reste.find((c) => secteurDepuis(c) && !estTel(c) && !estEmail(c) && c !== note)
    const deuxieme = cel[1] && !estTel(cel[1]) && !estEmail(cel[1]) && cel[1] !== note && /[a-z]/i.test(cel[1]) ? cel[1] : ""
    adresse = propre(avecCp ?? deuxieme)
  }
  const secteur = secteurDepuis(lire("secteur")) ?? secteurDepuis(adresse) ?? secteurDepuis(reste.filter((c) => !estTel(c) && !estEmail(c)).join(" | "))

  // Le contact : la colonne nommée telle quelle (c'est déjà un nom), sinon ce qu'on lit dans la note,
  // une fois les numéros et e-mails retirés (« Mme Martin 06 11 22 33 44 » → « Mme Martin »).
  const sansCoordonnees = (t: string) => t.replace(new RegExp(RE_TEL.source, "g"), " ").replace(new RegExp(RE_EMAIL.source, "gi"), " ")
  const brutContact = lire("contactNom")
  const contactNom = brutContact ? (/nom\s*:|mail\s*:/i.test(brutContact) ? extraireNom(sansCoordonnees(brutContact)) : propre(brutContact)) : extraireNom(sansCoordonnees(note))

  const type = cols.type !== undefined ? typeDepuis(lire("type"), false) : typeDepuis(cel.join(" | "), true)

  return { numero, apercu, nom, telephone, email, adresse, secteur, enseigne: enseigneDe(nom), type, contactNom, contactEmail, contactLigne, autresContacts: [] }
}

// Les lignes brutes → les lignes d'import, sans les inutilisables, sans les doublons du fichier.
export function preparerLignes(brutes: string[][]): { lignes: LigneImport[]; ignorees: Ignoree[]; total: number } {
  let debut = 0
  while (debut < brutes.length && !brutes[debut].some((c) => c && c.trim())) debut++
  let cols: Colonnes = {}
  if (debut < brutes.length && estEntete(brutes[debut])) { cols = repererColonnes(brutes[debut]); debut++ }

  const lignes: LigneImport[] = []
  const ignorees: Ignoree[] = []
  let total = 0
  const parCle = new Map<string, LigneImport>()
  const parTel = new Map<string, LigneImport>()
  for (let i = debut; i < brutes.length; i++) {
    const l = lireLigne(brutes[i], i + 1, cols)
    if (!l) continue
    total++
    if (!l.nom) { ignorees.push({ ligne: l, raison: "Pas de nom d'agence" }); continue }
    if (!l.telephone && !l.email && !l.contactLigne && !l.contactEmail) { ignorees.push({ ligne: l, raison: "Ni téléphone ni e-mail : impossible de la joindre" }); continue }

    const cle = `${nomCle(l.nom)}|${l.secteur ?? ""}`
    const kTel = cleTel(l.telephone)
    const premiere = parCle.get(cle) ?? (kTel ? parTel.get(kTel) : undefined)
    if (premiere) {
      // Même agence qu'une ligne précédente : on garde la première, on lui rattache le contact s'il est nouveau.
      const nouveau = contactDe(l)
      const dejaNomme = nouveau && [contactDe(premiere), ...premiere.autresContacts].some((c) => c && nomCle(c.nom) === nomCle(nouveau.nom))
      if (nouveau && !dejaNomme) premiere.autresContacts.push(nouveau)
      ignorees.push({ ligne: l, raison: `En double dans le fichier (même agence que la ligne ${premiere.numero})${nouveau && !dejaNomme ? ", son contact est rattaché à celle-ci" : ""}` })
      continue
    }
    parCle.set(cle, l)
    if (kTel) parTel.set(kTel, l)
    lignes.push(l)
  }
  return { lignes, ignorees, total }
}

// Le contact d'une ligne, ou null si elle n'en nomme pas.
export function contactDe(l: LigneImport): ContactImport | null {
  return l.contactNom ? { nom: l.contactNom, email: l.contactEmail, ligne: l.contactLigne } : null
}
// Tous les contacts d'une ligne (le sien, puis ceux des lignes en double).
export function contactsDe(l: LigneImport): ContactImport[] {
  const c = contactDe(l)
  return c ? [c, ...l.autresContacts] : [...l.autresContacts]
}

// Les lignes contre la base : même nom dans le même secteur, ou même standard → déjà là.
export function rapprocher(lignes: LigneImport[], connues: AgenceConnue[], contactsParAgence: Map<string, string[]>): { aCreer: LigneImport[]; dejaLa: DejaLa[] } {
  const parCle = new Map<string, AgenceConnue>()
  const parTel = new Map<string, AgenceConnue>()
  for (const a of connues) {
    parCle.set(`${a.nomCle}|${a.secteur ?? ""}`, a)
    const k = cleTel(a.telephone)
    if (k && !parTel.has(k)) parTel.set(k, a)
  }
  const aCreer: LigneImport[] = []
  const dejaLa: DejaLa[] = []
  for (const l of lignes) {
    const kTel = cleTel(l.telephone)
    const a = parCle.get(`${nomCle(l.nom)}|${l.secteur ?? ""}`) ?? (kTel ? parTel.get(kTel) : undefined)
    if (!a) { aCreer.push(l); continue }
    const connus = (contactsParAgence.get(a.id) ?? []).map(nomCle)
    const contactsAAjouter: ContactImport[] = []
    for (const c of contactsDe(l)) {
      const k = nomCle(c.nom)
      if (connus.includes(k)) continue
      connus.push(k)
      contactsAAjouter.push(c)
    }
    dejaLa.push({ ligne: l, agenceId: a.id, contactsAAjouter })
  }
  return { aCreer, dejaLa }
}

// Toute l'analyse, sans la base (testable) : les lignes brutes, ce que la base connaît, les secteurs qui existent.
export function analyserLignes(brutes: string[][], connues: AgenceConnue[], contactsParAgence: Map<string, string[]>, secteursConnus: Set<string>, feuille = ""): Analyse {
  const p = preparerLignes(brutes)
  const r = rapprocher(p.lignes, connues, contactsParAgence)
  const secteursInconnus = [...new Set(r.aCreer.map((l) => l.secteur).filter((s): s is string => !!s && !secteursConnus.has(s)))].sort()
  return { aCreer: r.aCreer, dejaLa: r.dejaLa, ignorees: p.ignorees, secteursInconnus, feuille, total: p.total }
}

// ── Lire le fichier ──
function celluleEnTexte(v: ExcelJS.CellValue): string {
  if (v == null) return ""
  if (v instanceof Date) return v.toLocaleDateString("fr-FR")
  if (typeof v === "object") {
    if ("text" in v) return String((v as { text: unknown }).text ?? "")
    if ("result" in v) return String((v as { result: unknown }).result ?? "")
    if ("richText" in v) return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join("")
  }
  return String(v).trim()
}
export async function lireFichier(fichier: File): Promise<FichierLu> {
  const nom = fichier.name.toLowerCase()
  if (nom.endsWith(".csv") || nom.endsWith(".txt")) return { lignes: parseCsv(await fichier.text()), feuille: fichier.name }
  if (nom.endsWith(".xls")) throw new Error("Format .xls (ancien Excel) non lisible. Dans Excel ou Google Sheets : enregistrer en .xlsx, puis réimporter.")
  const Excel = (await import("exceljs")).default // chargé seulement maintenant
  const wb = new Excel.Workbook()
  try {
    await wb.xlsx.load(await fichier.arrayBuffer())
  } catch (e) {
    throw new Error(`Le fichier « ${fichier.name} » n'a pas pu être lu comme un Excel (.xlsx). ${e instanceof Error ? e.message : ""}`.trim(), { cause: e })
  }
  // L'onglet le plus rempli : c'est celui qui porte la liste.
  const ws = [...wb.worksheets].sort((a, b) => b.actualRowCount - a.actualRowCount)[0]
  if (!ws) throw new Error("Le fichier ne contient aucun onglet.")
  const lignes: string[][] = []
  for (let r = 1; r <= ws.rowCount; r++) {
    const cellules: string[] = []
    ws.getRow(r).eachCell({ includeEmpty: true }, (cell, col) => { cellules[col - 1] = celluleEnTexte(cell.value) })
    lignes.push(Array.from(cellules, (c) => c ?? ""))
  }
  return { lignes, feuille: ws.name }
}

// ── La base ──
function sb() {
  if (!supabase) throw new Error("Supabase n'est pas configuré.")
  return supabase
}
// Toutes les agences, en une lecture par lots : de quoi reconnaître les doublons sans une requête par ligne.
export async function chargerAgencesConnues(): Promise<AgenceConnue[]> {
  const s = sb()
  type L = { id: string; nom: string; nom_cle: string | null; secteur: string | null; telephone: string | null }
  const lignes = await lireParLots<L>((de, a) => s.from("agences").select("id, nom, nom_cle, secteur, telephone").order("id").range(de, a))
  return lignes.map((l) => ({ id: l.id, nomCle: l.nom_cle ?? nomCle(l.nom), secteur: l.secteur, telephone: l.telephone ?? "" }))
}
// Les noms des contacts de ces agences (pour ne pas créer deux fois « Mme Dupont »).
async function chargerNomsContacts(agenceIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  const s = sb()
  for (let i = 0; i < agenceIds.length; i += 150) {
    const { data, error } = await s.from("contacts").select("agence_id, prenom, nom").in("agence_id", agenceIds.slice(i, i + 150)).limit(2000)
    if (error) throw new Error(error.message)
    for (const c of (data ?? []) as { agence_id: string; prenom: string; nom: string }[]) {
      const nom = `${c.prenom ?? ""} ${c.nom ?? ""}`.trim()
      if (nom) out.set(c.agence_id, [...(out.get(c.agence_id) ?? []), nom])
    }
  }
  return out
}
async function chargerCodesSecteurs(): Promise<Set<string>> {
  const { data, error } = await sb().from("secteurs").select("code").limit(5000)
  if (error) throw new Error(error.message)
  return new Set(((data ?? []) as { code: string }[]).map((s) => s.code))
}

// Le fichier → l'analyse complète, contre la base.
export async function analyserFichier(fichier: File): Promise<Analyse> {
  const [lu, connues, secteurs] = await Promise.all([lireFichier(fichier), chargerAgencesConnues(), chargerCodesSecteurs()])
  // Un premier passage trouve les agences déjà là ; on lit alors leurs contacts, puis on refait le rapprochement avec.
  const premier = analyserLignes(lu.lignes, connues, new Map(), secteurs, lu.feuille)
  const ids = [...new Set(premier.dejaLa.map((d) => d.agenceId))]
  const contacts = ids.length ? await chargerNomsContacts(ids) : new Map<string, string[]>()
  return analyserLignes(lu.lignes, connues, contacts, secteurs, lu.feuille)
}

// ── Écrire ──
export type Progression = { fait: number; total: number; enCours: string }
export type Bilan = { agencesCreees: number; contactsAjoutes: number; secteursCrees: number; erreurs: { ligne: LigneImport; message: string }[] }

export async function executerImport(analyse: Analyse, onProgres: (p: Progression) => void): Promise<Bilan> {
  const bilan: Bilan = { agencesCreees: 0, contactsAjoutes: 0, secteursCrees: 0, erreurs: [] }
  const aCompleter = analyse.dejaLa.filter((d) => d.contactsAAjouter.length)
  const total = analyse.aCreer.length + aCompleter.length
  let fait = 0
  const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

  // Les codes postaux inconnus deviennent des secteurs (libellé = le code, à renommer dans Réglages).
  if (analyse.secteursInconnus.length) bilan.secteursCrees = (await assurerSecteurs(analyse.secteursInconnus)).length

  for (const l of analyse.aCreer) {
    onProgres({ fait, total, enCours: l.nom })
    try {
      const id = await creerAgence({ nom: l.nom, enseigne: l.enseigne, type: l.type, secteur: l.secteur, adresse: l.adresse, telephone: l.telephone, email: l.email })
      bilan.agencesCreees++
      // La trace d'origine : créée par un import, pas à la main.
      await sb().from("agences").update({ source: "import" }).eq("id", id)
      for (const c of contactsDe(l)) {
        await creerContact(id, { prenom: "", nom: c.nom, email: c.email, ligneDirecte: c.ligne, role: l.type === "apporteur" ? "apporteur" : "gestionnaire" })
        bilan.contactsAjoutes++
      }
    } catch (e) {
      bilan.erreurs.push({ ligne: l, message: message(e) })
    }
    fait++
  }
  for (const d of aCompleter) {
    onProgres({ fait, total, enCours: d.ligne.nom })
    try {
      for (const c of d.contactsAAjouter) {
        await creerContact(d.agenceId, { prenom: "", nom: c.nom, email: c.email, ligneDirecte: c.ligne, role: d.ligne.type === "apporteur" ? "apporteur" : "gestionnaire" })
        bilan.contactsAjoutes++
      }
    } catch (e) {
      bilan.erreurs.push({ ligne: d.ligne, message: message(e) })
    }
    fait++
  }
  onProgres({ fait, total, enCours: "" })
  return bilan
}
