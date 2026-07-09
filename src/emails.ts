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

// Variables insérables dans les emails (remplacées à l'envoi par les données du prospect).
export const variables: { cle: string; label: string; exemple: string }[] = [
  { cle: "{{entreprise}}", label: "Agence", exemple: "Cabinet Dupont" },
  { cle: "{{contact}}", label: "Contact", exemple: "M. Martin" },
  { cle: "{{telephone}}", label: "Téléphone", exemple: "01 84 80 02 40" },
  { cle: "{{email}}", label: "Email", exemple: "contact@cabinetdupont.fr" },
  { cle: "{{arrondissement}}", label: "Arrondissement", exemple: "75001" },
  { cle: "{{commercial}}", label: "Commercial", exemple: "Horlann" },
]

// Remplace les variables par un exemple (pour l'aperçu).
export function apercu(texte: string): string {
  let t = texte
  for (const v of variables) t = t.split(v.cle).join(v.exemple)
  return t
}

// Modèles de départ (utilisés tant que la table « emails » n'existe pas).
export const emailsParDefaut: Email[] = [
  {
    nom: "Annonce d'appel",
    objet: "STC Bâtiment va vous contacter",
    corps:
      "Bonjour {{contact}},\n\nNous nous permettons de vous écrire car STC Bâtiment va vous appeler prochainement au sujet de la gestion de vos travaux pour {{entreprise}}.\n\nÀ très vite,\n{{commercial}} — STC Bâtiment",
    ordre: 1,
    pieces: [],
  },
  {
    nom: "Compte-rendu de fin d'appel",
    objet: "Suite à notre échange",
    corps:
      "Bonjour {{contact}},\n\nMerci pour le temps accordé lors de notre appel. Comme convenu, voici un récapitulatif de ce que STC Bâtiment peut vous apporter.\n\nN'hésitez pas à me recontacter au besoin.\n\nCordialement,\n{{commercial}} — STC Bâtiment",
    ordre: 2,
    pieces: [],
  },
  {
    nom: "Relance automatique",
    objet: "Êtes-vous toujours intéressé ?",
    corps:
      "Bonjour {{contact}},\n\nN'ayant pas réussi à vous joindre, je me permets de revenir vers vous concernant {{entreprise}}.\n\nQuand seriez-vous disponible pour un échange rapide ?\n\nCordialement,\n{{commercial}} — STC Bâtiment",
    ordre: 3,
    pieces: [],
  },
  {
    nom: "Suivi après relance téléphonique",
    objet: "Suite à mon appel",
    corps:
      "Bonjour {{contact}},\n\nJe fais suite à mon appel de ce jour. Vous trouverez ci-dessous les informations évoquées.\n\nRestant à votre disposition,\n{{commercial}} — STC Bâtiment",
    ordre: 4,
    pieces: [],
  },
]
