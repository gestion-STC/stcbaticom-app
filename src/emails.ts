export type PieceJointe = {
  nom: string
  url: string
  taille: number // octets
  chemin: string // chemin dans le bucket (pour suppression)
}

// Un modèle d'email configurable.
export type Email = {
  id?: string
  nom: string
  objet: string
  corps: string
  ordre: number
  pieces: PieceJointe[]
}

// Variables insérables dans les emails (remplacées à l'envoi par les données de l'agence et de son contact).
export const variables: { cle: string; label: string; exemple: string }[] = [
  { cle: "{{entreprise}}", label: "Agence", exemple: "Cabinet Dupont" },
  { cle: "{{contact}}", label: "Contact", exemple: "M. Martin" },
  { cle: "{{telephone}}", label: "Téléphone", exemple: "01 84 80 02 40" },
  { cle: "{{email}}", label: "Email", exemple: "contact@cabinetdupont.fr" },
  { cle: "{{arrondissement}}", label: "Arrondissement", exemple: "75001" },
  { cle: "{{commercial}}", label: "Commercial", exemple: "Prénom" },
]

// Remplace les variables par un exemple (pour l'aperçu).
export function apercu(texte: string): string {
  let t = texte
  for (const v of variables) t = t.split(v.cle).join(v.exemple)
  return t
}
