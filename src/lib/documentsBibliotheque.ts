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

// Les DOCUMENTS DE BASE, joints d'office au mail de suivi de la session (Mahdi, 07/11/2026 : « le Kbis,
// l'assurance décennale / responsabilité civile, et les deux dernières plaquettes, pas les anciennes ;
// ces quatre-là et c'est tout »). Repérés par leur FICHIER : la bibliothèque contient plusieurs versions
// sous des noms voisins. Pour en changer : remplacer le fichier ici.
export const DOCUMENTS_DE_BASE = [
  "aba7ff82-c739-4f18-a0b6-d65279ac5f28.pdf", // Kbis STC Bâtiment (24-07-2026)
  "5b129b47-c76a-4dda-a96a-19516ef7608b.pdf", // Attestation d'assurance STC Bâtiment (SMA BTP) : décennale et RC
  "801aeb9d-311d-48a8-ba02-97c96754dfa2.pdf", // STC - Plaquette Service Gestion (déposée le 14/10)
  "43fb4102-ec01-4710-ba3b-317bf4ace8c4.pdf", // STC - Plaquette Plateforme (déposée le 14/10)
]

/** Les documents de base trouvés dans les pièces des modèles, dans l'ordre ci-dessus. */
export function documentsDeBase(emails: Email[]): PieceJointe[] {
  const parFichier = new Map<string, PieceJointe>()
  for (const e of emails) for (const p of e.pieces ?? []) if (p?.chemin && p.url && !parFichier.has(p.chemin)) parFichier.set(p.chemin, p)
  return DOCUMENTS_DE_BASE.map((c) => parFichier.get(c)).filter((p): p is PieceJointe => Boolean(p))
}
