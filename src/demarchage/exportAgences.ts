// L'export Excel des agences, des contacts et des apporteurs. ExcelJS (~1 Mo)
// est chargé À LA DEMANDE, au clic sur Exporter, pas au démarrage du logiciel
// (le même choix que src/lib/exportProspects.ts).
import type { Agence, Contact } from "./modele"
import { chargerContactsDesAgences, ligneExportAgence, ligneExportApporteur, ligneExportContact } from "./agencesOutils"

type Colonne = { header: string; key: string; width: number }

async function telecharger(nomFeuille: string, colonnes: Colonne[], lignes: Record<string, unknown>[], nomFichier: string): Promise<void> {
  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(nomFeuille)
  ws.columns = colonnes
  ws.getRow(1).font = { bold: true }
  ws.views = [{ state: "frozen", ySplit: 1 }]
  lignes.forEach((l) => ws.addRow(l))
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = nomFichier
  a.click()
  URL.revokeObjectURL(url)
}

const jour = () => new Date().toISOString().slice(0, 10)

const COLONNES_AGENCES: Colonne[] = [
  { header: "Agence", key: "nom", width: 32 },
  { header: "Enseigne", key: "enseigne", width: 16 },
  { header: "Type", key: "type", width: 20 },
  { header: "Secteur", key: "secteur", width: 20 },
  { header: "Adresse", key: "adresse", width: 30 },
  { header: "Standard", key: "telephone", width: 16 },
  { header: "E-mail", key: "email", width: 28 },
  { header: "Site", key: "site", width: 24 },
  { header: "Lots", key: "nbLots", width: 8 },
  { header: "Étape", key: "etape", width: 18 },
  { header: "Étape depuis", key: "etapeDepuis", width: 13 },
  { header: "Tentatives", key: "tentatives", width: 10 },
  { header: "Joint (fois)", key: "jointFois", width: 10 },
  { header: "Contact principal", key: "contactPrincipal", width: 22 },
  { header: "Ligne directe", key: "contactLigne", width: 16 },
  { header: "Contacts", key: "nbContacts", width: 9 },
  { header: "Dernier appel", key: "dernierAppel", width: 13 },
  { header: "Dernier résultat", key: "dernierResultat", width: 26 },
  { header: "Prochaine tâche", key: "prochaineTache", width: 24 },
  { header: "Échéance", key: "prochaineEcheance", width: 13 },
  { header: "Premier OS", key: "premierOs", width: 13 },
  { header: "Motif", key: "motif", width: 20 },
]
export async function exporterAgencesExcel(agences: Agence[]): Promise<void> {
  await telecharger("Agences", COLONNES_AGENCES, agences.map(ligneExportAgence), `agences-stc-${jour()}.xlsx`)
}

const COLONNES_CONTACTS: Colonne[] = [
  { header: "Agence", key: "agence", width: 32 },
  { header: "Enseigne", key: "enseigne", width: 16 },
  { header: "Secteur", key: "secteur", width: 20 },
  { header: "Standard", key: "standard", width: 16 },
  { header: "Prénom", key: "prenom", width: 16 },
  { header: "Nom", key: "nom", width: 18 },
  { header: "Rôle", key: "role", width: 24 },
  { header: "Ligne directe", key: "ligneDirecte", width: 16 },
  { header: "Mobile", key: "mobile", width: 16 },
  { header: "E-mail", key: "email", width: 28 },
  { header: "Principal", key: "principal", width: 9 },
  { header: "Parti", key: "parti", width: 7 },
  { header: "Note", key: "note", width: 40 },
]
/** Les contacts des agences données (lus à ce moment-là), avec le nom de leur agence. */
export async function exporterContactsExcel(agences: Agence[], contactsDeja?: Contact[]): Promise<number> {
  const contacts = contactsDeja ?? (await chargerContactsDesAgences(agences.map((a) => a.id)))
  const parAgence = new Map(agences.map((a) => [a.id, a]))
  const lignes = contacts.flatMap((c) => { const a = parAgence.get(c.agenceId); return a ? [ligneExportContact(c, a)] : [] })
  await telecharger("Contacts", COLONNES_CONTACTS, lignes, `contacts-agences-stc-${jour()}.xlsx`)
  return lignes.length
}

const COLONNES_APPORTEURS: Colonne[] = [
  { header: "Nom", key: "nom", width: 32 },
  { header: "Contact", key: "contact", width: 22 },
  { header: "Téléphone", key: "telephone", width: 16 },
  { header: "E-mail", key: "email", width: 28 },
  { header: "Secteur", key: "secteur", width: 20 },
  { header: "Adresse", key: "adresse", width: 30 },
]
export async function exporterApporteursExcel(agences: Agence[]): Promise<void> {
  await telecharger("Apporteurs", COLONNES_APPORTEURS, agences.map(ligneExportApporteur), `apporteurs-stc-${jour()}.xlsx`)
}
