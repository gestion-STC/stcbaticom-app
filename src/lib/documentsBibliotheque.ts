// Les documents du logiciel (Mahdi, 12/10/2026) : « on utilise toujours les mêmes PDF — assurance,
// Kbis, les deux plaquettes ». La bibliothèque, c'est l'ensemble des pièces jointes des modèles
// d'e-mail, sans doublon (un même document existe parfois sous plusieurs fichiers : on garde le
// premier, par nom). Chacune peut être jointe d'un clic à n'importe quel e-mail.
import type { Email, PieceJointe } from "../emails"

const cleNom = (nom: string) => nom.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\.pdf$/i, "").replace(/\s*\(\d+\)\s*$/, "").replace(/[^a-z0-9]+/g, " ").trim()

export function bibliothequeDocuments(emails: Email[]): PieceJointe[] {
  const vus = new Map<string, PieceJointe>()
  for (const e of emails) for (const p of e.pieces ?? []) {
    if (!p?.url || !p.nom) continue
    const k = cleNom(p.nom)
    if (!vus.has(k)) vus.set(k, p)
  }
  return [...vus.values()].sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
}

/** Le document est-il déjà joint (même fichier, ou même nom sous un autre fichier) ? */
export function estJoint(doc: PieceJointe, pieces: PieceJointe[]): boolean {
  return pieces.some((p) => p.chemin === doc.chemin || cleNom(p.nom) === cleNom(doc.nom))
}

/** Joint ou retire le document : la liste des pièces de cet envoi, sans doublon. */
export function basculerDocument(doc: PieceJointe, pieces: PieceJointe[]): PieceJointe[] {
  return estJoint(doc, pieces) ? pieces.filter((p) => !(p.chemin === doc.chemin || cleNom(p.nom) === cleNom(doc.nom))) : [...pieces, doc]
}
