// ExcelJS (~1 Mo) : uniquement des TYPES ici — la librairie elle-même est chargée
// À LA DEMANDE (au moment d'importer un fichier), pas au démarrage du logiciel.
import type ExcelJS from "exceljs"
import { TYPE_APPORTEUR, type Prospect } from "../data"

export type ResultatImport = {
  prospects: Prospect[]
  total: number
  parStatut: Record<string, number>
  feuille: string
  feuilles: string[]
  ignorees: number // lignes non vides écartées (pas de nom d'agence en 1re colonne)
}

function norm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
}

// Décompose une couleur ARGB en {r,g,b}, ou null si invalide / transparente.
function versRgb(argb?: string): { r: number; g: number; b: number } | null {
  if (!argb) return null
  // ARGB (8 car.) : si l'alpha est 00 (transparent), pas de vraie couleur.
  if (argb.length === 8 && argb.slice(0, 2) === "00") return null
  const hex = argb.length === 8 ? argb.slice(2) : argb
  if (hex.length < 6) return null
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  if ([r, g, b].some((n) => Number.isNaN(n))) return null
  return { r, g, b }
}

// Couleur de fond -> statut. Gère aussi bien les couleurs vives que pastel.
// Vert -> Client signé · Bleu/Cyan (déjà contacté) -> À rappeler · Blanc/gris/absent -> Nouveau prospect.
// NB : l'état « Contacté » a été supprimé → les lignes cyan/bleues deviennent « À rappeler ».
export function statutDepuisCouleur(argb?: string): string {
  const c = versRgb(argb)
  if (!c) return "Nouveau prospect"
  const { r, g, b } = c
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max - min < 24) return "Nouveau prospect" // peu coloré = blanc / gris / noir
  // Vert : le vert domine nettement le rouge ET le bleu (vert vif ou pastel)
  if (g === max && g - r > 20 && g - b > 20) return "Client signé"
  // Bleu ou cyan (= déjà en contact dans le Sheet) → « À rappeler »
  if (b - r > 20 || (g === max && r === min && g - r > 20)) return "À rappeler"
  return "Nouveau prospect"
}

function couleurCellule(cell: ExcelJS.Cell): string | undefined {
  const fill = cell.fill as ExcelJS.FillPattern | undefined
  if (!fill || fill.type !== "pattern") return undefined
  // On lit la couleur de premier plan, sinon celle d'arrière-plan.
  for (const col of [fill.fgColor, fill.bgColor]) {
    if (col && typeof col.argb === "string") return col.argb
  }
  return undefined
}

// Cherche une couleur significative sur la ligne (plusieurs cellules, pas seulement la 1re).
function couleurLigne(row: ExcelJS.Row): string | undefined {
  const maxCol = Math.min(row.cellCount || 1, 8)
  for (let c = 1; c <= maxCol; c++) {
    const argb = couleurCellule(row.getCell(c))
    const rgb = versRgb(argb)
    // On ignore le blanc/quasi-blanc : on veut la 1re vraie couleur de surlignage.
    if (rgb && !(rgb.r > 235 && rgb.g > 235 && rgb.b > 235)) return argb
  }
  return undefined
}

// Formate un téléphone français : rajoute le 0 manquant, groupe par 2.
function formatTel(brut: string): string {
  let d = String(brut).replace(/\D/g, "")
  if (d.length === 11 && d.startsWith("33")) d = "0" + d.slice(2)
  else if (d.length === 9) d = "0" + d
  if (d.length === 10) return (d.match(/.{1,2}/g) ?? []).join(" ")
  return String(brut).trim()
}

const reEmail = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i

function extraireEmail(cells: string[]): string {
  for (const c of cells) {
    const m = c.match(reEmail)
    if (m) return m[0]
  }
  return ""
}

function extraireTel(cells: string[]): string {
  for (const c of cells) {
    const digits = c.replace(/[\s.\-()]/g, "")
    if (/^\+?\d{9,11}$/.test(digits)) return formatTel(digits)
  }
  return ""
}

// Repère la cellule "note" : une cellule Nom:/Mail:, sinon une cellule de texte libre.
function trouverNote(cells: string[]): string {
  for (const c of cells) if (/nom\s*:|mail\s*:/i.test(c)) return c.trim()
  for (let i = 2; i < cells.length; i++) {
    const c = (cells[i] ?? "").trim()
    if (
      c &&
      !reEmail.test(c) &&
      !/^\+?[\d\s.\-()]+$/.test(c) &&
      /[a-zàâçéèêëîïôûùü]/i.test(c) &&
      c.length > 3
    ) {
      return c
    }
  }
  return ""
}

// Mots qui signalent la FIN du nom (début d'une description) : on coupe avant.
const motsDescription =
  /\b(gestionnaire|gestion|apport|apporteur|contrat|syndic|directeur|responsable|gere|gère|volume|inter|envoyer|bon ress|rappeler|relancer|appeler|locative)\b/i

const clean = (s: string) => s.replace(/\s+/g, " ").replace(/^[·.,;:\s]+|[·.,;:\s]+$/g, "").trim()
const capitaliser = (s: string) =>
  s
    .split(" ")
    .map((w) => (w.length > 2 && !/^(et|de|du|des|la|le|les)$/i.test(w) ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")

// Extrait un NOM de personne propre depuis une note (sans la description qui suit).
export function extraireNom(note: string): string {
  if (!note) return ""
  // 1) "Nom: X" (jusqu'à "Mail:")
  const mNom = note.match(/nom\s*:\s*(.+)$/i)
  if (mNom) {
    let b = clean(mNom[1].split(/mail\s*:/i)[0])
    const m = b.match(motsDescription)
    if (m && m.index) b = clean(b.slice(0, m.index))
    return b ? capitaliser(b) : ""
  }
  // 2) Une civilité (Mme / M. / …) est présente → on part d'elle, on coupe à la description
  const civ = note.match(/\b(mme|mlle|m\.|mr|monsieur|madame)\b/i)
  if (civ && civ.index !== undefined) {
    let b = clean(note.slice(civ.index))
    const m = b.match(motsDescription)
    if (m && m.index) b = clean(b.slice(0, m.index))
    const mots = b.split(" ").filter(Boolean)
    return mots.length >= 1 && mots.length <= 6 ? capitaliser(b) : ""
  }
  // 3) Sinon : on coupe à la description et on accepte si c'est court et "nom-like"
  let b = clean(note)
  const m = b.match(motsDescription)
  if (m) b = clean(b.slice(0, m.index))
  const mots = b.split(" ").filter(Boolean)
  if (mots.length >= 1 && mots.length <= 3 && /[a-zàâçéèêëîïôûùü]/i.test(b) && b.length >= 3 && b.length <= 40 && !/\d/.test(b))
    return capitaliser(b)
  return ""
}

const motsEntete = ["entreprise", "societe", "nom", "tel", "telephone", "email", "mail", "ville", "contact", "statut"]

// Vrai si la ligne ressemble à un en-tête (mots-clés, pas d'email ni de tel).
function estEntete(cells: string[]): boolean {
  const aDonnee = extraireEmail(cells) || extraireTel(cells)
  if (aDonnee) return false
  const txt = cells.map(norm).join(" ")
  return motsEntete.filter((m) => txt.includes(m)).length >= 2
}

type LigneBrute = { cells: string[]; couleur?: string }

function construire(lignes: LigneBrute[]): {
  prospects: Prospect[]
  parStatut: Record<string, number>
  ignorees: number
} {
  // Saute une éventuelle ligne d'en-tête en tête de liste
  let debut = 0
  while (debut < lignes.length && lignes[debut].cells.every((c) => !c.trim()))
    debut++
  if (debut < lignes.length && estEntete(lignes[debut].cells)) debut++

  const prospects: Prospect[] = []
  const parStatut: Record<string, number> = {}
  let ignorees = 0

  for (let i = debut; i < lignes.length; i++) {
    const { cells, couleur } = lignes[i]
    const entreprise = (cells[0] ?? "").trim()
    if (!entreprise) {
      // ligne non vide mais sans nom d'agence en 1re colonne → écartée (on la compte)
      if (cells.some((c) => c && c.trim())) ignorees++
      continue
    }

    const email = extraireEmail(cells)
    const telephone = extraireTel(cells)
    const note = trouverNote(cells)
    const contact = extraireNom(note)
    // Note conservée en commentaire (sans le libellé / l'email), sauf si ce n'est que le nom.
    const noteNettoyee = clean(note.replace(reEmail, "").replace(/nom\s*:/gi, " ").replace(/mail\s*:/gi, " "))
    const commentaire = noteNettoyee && norm(noteNettoyee) !== norm(contact) ? noteNettoyee : ""
    let adresse = (cells[1] ?? "").trim()
    if (adresse === "·" || adresse === ".") adresse = ""
    // Code postal / arrondissement repéré dans une cellule (ex. 75001), sinon vide
    let arrondissement = ""
    for (const c of cells) {
      const m = c.match(/\b(\d{5})\b/)
      if (m) { arrondissement = m[1]; break }
    }

    const statut = statutDepuisCouleur(couleur)
    parStatut[statut] = (parStatut[statut] ?? 0) + 1

    // Apporteur d'affaires détecté (mention explicite "apporteur" ou "apport d'affaire")
    // → rangé à part. On évite un simple "apport" qui pourrait venir d'une adresse.
    const estApp = /apporteur|apport\s*d['']?\s*affaire/i.test(cells.join(" "))

    prospects.push({
      entreprise,
      contact,
      telephone,
      email,
      adresse,
      arrondissement,
      commentaire,
      type: estApp ? TYPE_APPORTEUR : "Gestionnaire locatif",
      statut,
      priorite: "Moyenne",
      prochaineRelance: "—",
    })
  }

  return { prospects, parStatut, ignorees }
}

function celluleEnTexte(v: ExcelJS.CellValue): string {
  if (v == null) return ""
  if (typeof v === "object") {
    if ("text" in v) return String((v as { text: unknown }).text ?? "")
    if ("result" in v) return String((v as { result: unknown }).result ?? "")
    if ("richText" in v)
      return (v as { richText: { text: string }[] }).richText
        .map((t) => t.text)
        .join("")
  }
  return String(v).trim()
}

async function importerXlsx(file: File): Promise<ResultatImport> {
  const buffer = await file.arrayBuffer()
  const Excel = (await import("exceljs")).default // chargé seulement maintenant
  const wb = new Excel.Workbook()
  await wb.xlsx.load(buffer)

  const feuilles = wb.worksheets.map((w) => w.name)
  const feuilleTriee = wb.worksheets.find((w) => norm(w.name).includes("tri"))
  const ws =
    feuilleTriee ??
    wb.worksheets.slice().sort((a, b) => b.actualRowCount - a.actualRowCount)[0]
  if (!ws) throw new Error("Le fichier ne contient aucun onglet.")

  const lignes: LigneBrute[] = []
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const cells: string[] = []
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cells[col - 1] = celluleEnTexte(cell.value)
    })
    if (!cells.some((c) => c && c.trim())) continue
    lignes.push({ cells, couleur: couleurLigne(row) })
  }

  const { prospects, parStatut, ignorees } = construire(lignes)
  return { prospects, total: prospects.length, parStatut, feuille: ws.name, feuilles, ignorees }
}

export function parseCsv(texte: string): string[][] {
  const t = texte.replace(/^﻿/, "")
  const premiere = t.split(/\r?\n/)[0] ?? ""
  const sep =
    (premiere.match(/;/g)?.length ?? 0) >= (premiere.match(/,/g)?.length ?? 0)
      ? ";"
      : ","
  const lignes: string[][] = []
  let champ = ""
  let ligne: string[] = []
  let q = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (q) {
      if (c === '"') {
        if (t[i + 1] === '"') { champ += '"'; i++ } else q = false
      } else champ += c
    } else if (c === '"') q = true
    else if (c === sep) { ligne.push(champ); champ = "" }
    else if (c === "\n") { ligne.push(champ); lignes.push(ligne); ligne = []; champ = "" }
    else if (c !== "\r") champ += c
  }
  if (champ.length || ligne.length) { ligne.push(champ); lignes.push(ligne) }
  return lignes.filter((l) => l.some((c) => c.trim()))
}

async function importerCsv(file: File): Promise<ResultatImport> {
  const lignes = parseCsv(await file.text()).map((cells) => ({ cells }))
  const { prospects, parStatut, ignorees } = construire(lignes)
  return { prospects, total: prospects.length, parStatut, feuille: file.name, feuilles: [file.name], ignorees }
}

export async function importerProspects(file: File): Promise<ResultatImport> {
  const nom = file.name.toLowerCase()
  if (nom.endsWith(".csv")) return importerCsv(file)
  if (nom.endsWith(".xls") && !nom.endsWith(".xlsx")) {
    throw new Error(
      "Format .xls (ancien Excel) non lisible. Dans Google Sheets : Fichier → Télécharger → Microsoft Excel (.xlsx), puis réimportez.",
    )
  }
  try {
    return await importerXlsx(file)
  } catch (err) {
    const raison = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Le fichier « ${file.name} » n'a pas pu être lu comme un Excel (.xlsx). Détail : ${raison}`,
    )
  }
}
