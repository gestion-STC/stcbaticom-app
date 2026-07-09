import type { Prospect } from "../data"

// Génère un fichier Excel à partir des prospects et déclenche le téléchargement.
// ExcelJS (~1 Mo) est chargé À LA DEMANDE (au clic sur Exporter), pas au démarrage
// du logiciel → ouverture beaucoup plus rapide.
export async function exporterProspectsExcel(
  prospects: Prospect[],
  opts: { nomFeuille?: string; nomFichier?: string } = {},
) {
  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(opts.nomFeuille ?? "Prospects")

  ws.columns = [
    { header: "Agence", key: "entreprise", width: 30 },
    { header: "Contact", key: "contact", width: 22 },
    { header: "Téléphone", key: "telephone", width: 16 },
    { header: "Email", key: "email", width: 28 },
    { header: "Adresse", key: "adresse", width: 26 },
    { header: "Arrondissement", key: "arrondissement", width: 14 },
    { header: "Type", key: "type", width: 20 },
    { header: "Statut", key: "statut", width: 18 },
    { header: "Priorité", key: "priorite", width: 12 },
    { header: "Prochaine relance", key: "prochaineRelance", width: 16 },
    { header: "Commentaire", key: "commentaire", width: 40 },
  ]
  ws.getRow(1).font = { bold: true }

  prospects.forEach((p) => ws.addRow(p))

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = opts.nomFichier ?? "prospects-stc.xlsx"
  a.click()
  URL.revokeObjectURL(url)
}
