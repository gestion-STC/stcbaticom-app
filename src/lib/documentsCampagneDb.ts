// La bibliothèque des campagnes (lot 3, 17/11/2026) : les pièces des modèles de mail + les PDF ajoutés depuis les campagnes.
import type { PieceJointe } from "../emails"
import { chargerEmails } from "./emailsDb"
import { bibliothequeDocuments } from "./documentsBibliotheque"
import { lireParametre, ecrireParametre } from "./parametresDb"
import { televerser } from "./stockage"
import { CLE_DOCUMENTS, fusionnerDocuments, lireDocumentsAjoutes } from "../prospection/documentsCampagne"

export async function chargerDocumentsCampagne(): Promise<PieceJointe[]> {
  const [emails, ajoutes] = await Promise.all([chargerEmails(), lireParametre(CLE_DOCUMENTS)])
  return fusionnerDocuments(bibliothequeDocuments(emails), lireDocumentsAjoutes(ajoutes))
}

/** « Ajouter un PDF… » : le fichier est déposé, puis rangé dans la bibliothèque des campagnes. */
export async function ajouterDocumentCampagne(file: File): Promise<PieceJointe> {
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") throw new Error("Seuls les PDF sont acceptés.")
  if (file.size > 15 * 1024 * 1024) throw new Error("PDF trop lourd (15 Mo au plus).")
  const p = await televerser(file)
  const liste = lireDocumentsAjoutes(await lireParametre(CLE_DOCUMENTS))
  await ecrireParametre(CLE_DOCUMENTS, JSON.stringify([...liste, p]))
  return p
}
