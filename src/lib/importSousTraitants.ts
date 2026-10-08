// Import d'une base de sous-traitants depuis un fichier Excel (.xlsx) ou CSV.
// Contrairement à l'import des prospects (couleurs Google Sheet), ici on se base
// sur les EN-TÊTES de colonnes : Entreprise, Contact, Email, Téléphone, Métier, Zone.
// ExcelJS (~1 Mo) n'est chargé qu'au moment de l'import.
import type ExcelJS from "exceljs"
import type { SousTraitant } from "../recrutement"
import { parseCsv } from "./importProspects"

export type ResultatImportST = {
  sousTraitants: Partial<SousTraitant>[]
  total: number
  feuille: string
  ignorees: number // lignes sans e-mail ni téléphone (inutilisables pour relancer)
}

function norm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
}

const reEmail = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i

// Formate un téléphone français : rajoute le 0 manquant, groupe par 2.
function formatTel(brut: string): string {
  let d = String(brut).replace(/\D/g, "")
  if (d.length === 11 && d.startsWith("33")) d = "0" + d.slice(2)
  else if (d.length === 9) d = "0" + d
  if (d.length === 10) return (d.match(/.{1,2}/g) ?? []).join(" ")
  return String(brut).trim()
}

// À partir de la ligne d'en-tête, retrouve l'indice de chaque colonne connue.
function repererColonnes(entete: string[]): Record<string, number> {
  const idx: Record<string, number> = {}
  entete.forEach((cel, i) => {
    const h = norm(cel)
    if (idx.entreprise === undefined && /entreprise|societe|raison|nom de l|enseigne/.test(h)) idx.entreprise = i
    else if (idx.contact === undefined && /contact|nom|prenom|gerant|responsable/.test(h)) idx.contact = i
    if (idx.email === undefined && /mail|email|courriel|e-mail/.test(h)) idx.email = i
    if (idx.telephone === undefined && /tel|phone|portable|mobile|gsm/.test(h)) idx.telephone = i
    if (idx.metier === undefined && /metier|activite|corps|specialite|categorie/.test(h)) idx.metier = i
    if (idx.source === undefined && /source|origine|provenance|canal|apporteur/.test(h)) idx.source = i
    if (idx.zone === undefined && /zone|ville|departement|secteur|region|cp|code postal|adresse/.test(h)) idx.zone = i
  })
  return idx
}

// Une ligne ressemble-t-elle à un en-tête ? (mots-clés, aucune donnée e-mail/tel)
function estEntete(cells: string[]): boolean {
  const txt = cells.map(norm).join(" ")
  const aData = cells.some((c) => reEmail.test(c))
  const motsCles = ["entreprise", "societe", "contact", "mail", "email", "tel", "metier", "nom", "zone", "ville"]
  return !aData && motsCles.filter((m) => txt.includes(m)).length >= 2
}

function trouverEmail(cells: string[]): string {
  for (const c of cells) {
    const m = c.match(reEmail)
    if (m) return m[0]
  }
  return ""
}

function trouverTel(cells: string[]): string {
  for (const c of cells) {
    const digits = c.replace(/[\s.\-()]/g, "")
    if (/^\+?\d{9,11}$/.test(digits)) return formatTel(digits)
  }
  return ""
}

export function construire(lignes: string[][]): { sousTraitants: Partial<SousTraitant>[]; ignorees: number } {
  // Saute les lignes vides de tête.
  let debut = 0
  while (debut < lignes.length && lignes[debut].every((c) => !c.trim())) debut++

  let cols: Record<string, number> = {}
  if (debut < lignes.length && estEntete(lignes[debut])) {
    cols = repererColonnes(lignes[debut])
    debut++
  }

  const sousTraitants: Partial<SousTraitant>[] = []
  let ignorees = 0

  for (let i = debut; i < lignes.length; i++) {
    const cells = lignes[i]
    if (!cells.some((c) => c && c.trim())) continue

    // Colonnes repérées par en-tête, avec repli sur la détection par contenu.
    const email = (cols.email !== undefined ? cells[cols.email] : "").trim() || trouverEmail(cells)
    const telephone = (cols.telephone !== undefined ? formatTel(cells[cols.telephone]) : "") || trouverTel(cells)
    const entreprise = (cols.entreprise !== undefined ? cells[cols.entreprise] : cells[0] ?? "").trim()
    const contact = (cols.contact !== undefined ? cells[cols.contact] : "").trim()
    const metier = (cols.metier !== undefined ? cells[cols.metier] : "").trim()
    const source = (cols.source !== undefined ? cells[cols.source] : "").trim()
    const zone = (cols.zone !== undefined ? cells[cols.zone] : "").trim()

    // Sans e-mail NI téléphone, impossible de relancer → on écarte.
    if (!email && !telephone) {
      ignorees++
      continue
    }

    sousTraitants.push({
      entreprise,
      contact,
      email: email.trim(),
      telephone,
      metier,
      zone,
      source,
      statut: "a_contacter",
      etapeCourante: 0,
      nbClics: 0,
    })
  }

  return { sousTraitants, ignorees }
}

function celluleEnTexte(v: ExcelJS.CellValue): string {
  if (v == null) return ""
  if (typeof v === "object") {
    if ("text" in v) return String((v as { text: unknown }).text ?? "")
    if ("result" in v) return String((v as { result: unknown }).result ?? "")
    if ("richText" in v)
      return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join("")
  }
  return String(v).trim()
}

async function importerXlsx(file: File): Promise<ResultatImportST> {
  const buffer = await file.arrayBuffer()
  const Excel = (await import("exceljs")).default
  const wb = new Excel.Workbook()
  await wb.xlsx.load(buffer)
  const ws = wb.worksheets.slice().sort((a, b) => b.actualRowCount - a.actualRowCount)[0]
  if (!ws) throw new Error("Le fichier ne contient aucun onglet.")

  const lignes: string[][] = []
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const cells: string[] = []
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cells[col - 1] = celluleEnTexte(cell.value)
    })
    lignes.push(cells)
  }

  const { sousTraitants, ignorees } = construire(lignes)
  return { sousTraitants, total: sousTraitants.length, feuille: ws.name, ignorees }
}

async function importerCsv(file: File): Promise<ResultatImportST> {
  const lignes = parseCsv(await file.text())
  const { sousTraitants, ignorees } = construire(lignes)
  return { sousTraitants, total: sousTraitants.length, feuille: file.name, ignorees }
}

export async function importerSousTraitants(file: File): Promise<ResultatImportST> {
  const nom = file.name.toLowerCase()
  if (nom.endsWith(".csv")) return importerCsv(file)
  if (nom.endsWith(".xls") && !nom.endsWith(".xlsx")) {
    throw new Error(
      "Format .xls (ancien Excel) non lisible. Dans Excel/Sheets : enregistrez en .xlsx, puis réimportez.",
    )
  }
  try {
    return await importerXlsx(file)
  } catch (err) {
    const raison = err instanceof Error ? err.message : String(err)
    throw new Error(`Le fichier « ${file.name} » n'a pas pu être lu (.xlsx). Détail : ${raison}`, { cause: err })
  }
}

// ── Dédoublonnage avant insertion ────────────────────────────────────────────
// Le même artisan arrive souvent plusieurs fois : deux fichiers Pages Jaunes,
// une adresse en majuscules d'un côté, un numéro en +33 de l'autre. On compare
// donc sur des formes NORMALISÉES, par e-mail OU par téléphone, contre la base
// déjà en place, contre la liste d'exclusion (« ne plus contacter »), et à
// l'intérieur même du fichier importé.

/** E-mail comparable : minuscules, sans aucun espace. */
export function normaliserEmail(email: unknown): string {
  return String(email ?? "").toLowerCase().replace(/\s+/g, "")
}

/** Téléphone comparable : chiffres seulement, 0033 / +33 / 33 ramenés au 0 initial. */
export function normaliserTelephone(telephone: unknown): string {
  let d = String(telephone ?? "").replace(/\D/g, "")
  if (d.startsWith("0033")) d = "0" + d.slice(4)
  else if (d.length === 11 && d.startsWith("33")) d = "0" + d.slice(2)
  else if (d.length === 9) d = "0" + d // le 0 initial perdu par Excel
  return d
}

export type ResultatDedoublonnage = {
  aAjouter: Partial<SousTraitant>[]
  doublons: number // déjà dans la base, ou déjà vus plus haut dans le fichier
  exclus: number // dans la liste d'exclusion
}

/**
 * Trie les fiches d'un fichier : celles à insérer, celles déjà connues, celles
 * exclues. L'exclusion prime sur le doublon : un artisan « ne plus contacter »
 * est aussi dans la base (désinscrit), on veut savoir qu'il est EXCLU.
 */
export function dedoublonner(
  nouvelles: Partial<SousTraitant>[],
  existantes: { email?: string; telephone?: string }[],
  exclusions: { email: string; telephone: string }[],
): ResultatDedoublonnage {
  const emailsConnus = new Set<string>()
  const telsConnus = new Set<string>()
  for (const e of existantes) {
    const m = normaliserEmail(e.email)
    const t = normaliserTelephone(e.telephone)
    if (m) emailsConnus.add(m)
    if (t) telsConnus.add(t)
  }
  const emailsExclus = new Set<string>()
  const telsExclus = new Set<string>()
  for (const x of exclusions) {
    const m = normaliserEmail(x.email)
    const t = normaliserTelephone(x.telephone)
    if (m) emailsExclus.add(m)
    if (t) telsExclus.add(t)
  }

  const aAjouter: Partial<SousTraitant>[] = []
  let doublons = 0
  let exclus = 0
  for (const n of nouvelles) {
    const m = normaliserEmail(n.email)
    const t = normaliserTelephone(n.telephone)
    if ((m && emailsExclus.has(m)) || (t && telsExclus.has(t))) {
      exclus++
      continue
    }
    if ((m && emailsConnus.has(m)) || (t && telsConnus.has(t))) {
      doublons++
      continue
    }
    aAjouter.push(n)
    // Retenue tout de suite : la ligne suivante du fichier peut être la même.
    if (m) emailsConnus.add(m)
    if (t) telsConnus.add(t)
  }
  return { aAjouter, doublons, exclus }
}
