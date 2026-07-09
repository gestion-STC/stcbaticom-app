// Données de base + jeu de démonstration (utilisé uniquement si Supabase n'est pas
// configuré). Les vraies données viennent de Supabase.

export const commercial = {
  prenom: "Horlann",
  role: "Commercial",
  initiales: "HL",
}

// --- Prospects ---------------------------------------------------------------

export type Priorite = "Haute" | "Moyenne" | "Basse" | "—"

export const volumesOs = ["Élevé", "Normal", "Faible"] as const

export const couleursVolume: Record<string, string> = {
  Élevé: "bg-emerald-50 text-emerald-700",
  Normal: "bg-blue-50 text-blue-700",
  Faible: "bg-slate-100 text-slate-500",
}

export type Prospect = {
  id?: string
  volume?: string // volume d'OS potentiel : Élevé / Normal / Faible
  entreprise: string
  contact: string
  telephone: string
  email: string
  adresse: string // rue
  arrondissement: string // ex. 75001 / Paris 1er
  commentaire: string
  type: string
  statut: string // libellé d'un état configurable (voir le gestionnaire d'états)
  priorite: Priorite
  prochaineRelance: string
  numeroEmission?: string // numéro Ringover attribué à ce prospect (toujours le même pour lui)
}

// Étiquette spéciale rangée dans le champ `type` : sépare les apporteurs d'affaires
// (qu'on ne démarche pas, mais qu'on conserve) des gestionnaires locatifs.
export const TYPE_APPORTEUR = "Apporteur d'affaires"
export const estApporteur = (p: Prospect): boolean => p.type === TYPE_APPORTEUR

export const couleursPriorite: Record<Priorite, string> = {
  Haute: "text-red-600",
  Moyenne: "text-amber-600",
  Basse: "text-slate-500",
  "—": "text-slate-300",
}

export const toutesPriorites: Priorite[] = ["Haute", "Moyenne", "Basse", "—"]

// Jeu de démonstration (fictif) — affiché seulement quand Supabase n'est pas connecté.
// Les statuts correspondent aux états par défaut (voir statutsParDefaut).
export const prospects: Prospect[] = [
  { entreprise: "Cabinet Dupont", contact: "M. Martin", telephone: "06 12 34 56 78", email: "contact@cabinetdupont.fr", adresse: "12 rue de la Paix", arrondissement: "75002", commentaire: "", type: "Syndic", statut: "À rappeler", priorite: "Haute", prochaineRelance: "21/06/2024" },
  { entreprise: "Gestion Locative Martin", contact: "M. Durand", telephone: "03 23 45 67 89", email: "m.durand@glm.fr", adresse: "5 cours Lafayette", arrondissement: "Lyon", commentaire: "", type: "Agence", statut: "Contacté", priorite: "Moyenne", prochaineRelance: "22/06/2024" },
  { entreprise: "Immo Conseil", contact: "M. Bernard", telephone: "04 34 56 78 90", email: "bernard@immoconseil.fr", adresse: "8 La Canebière", arrondissement: "Marseille", commentaire: "", type: "Agence", statut: "Intéressé", priorite: "Haute", prochaineRelance: "25/06/2024" },
  { entreprise: "BatiPlus", contact: "M. Petit", telephone: "06 45 67 89 01", email: "petit@batiplus.fr", adresse: "2 allée Jean Jaurès", arrondissement: "Toulouse", commentaire: "", type: "Entreprise", statut: "RDV pris", priorite: "Haute", prochaineRelance: "21/06/2024" },
  { entreprise: "Sogeprom", contact: "Mme Leroy", telephone: "06 56 78 90 12", email: "leroy@sogeprom.fr", adresse: "3 promenade des Anglais", arrondissement: "Nice", commentaire: "", type: "Syndic", statut: "Relance", priorite: "Moyenne", prochaineRelance: "24/06/2024" },
  { entreprise: "Urbania", contact: "M. Thomas", telephone: "06 67 89 01 23", email: "thomas@urbania.fr", adresse: "10 cours de l'Intendance", arrondissement: "Bordeaux", commentaire: "", type: "Syndic", statut: "Intéressé", priorite: "Basse", prochaineRelance: "—" },
  { entreprise: "Citya Immobilier", contact: "M. Robert", telephone: "06 78 90 12 34", email: "robert@citya.fr", adresse: "4 rue Crébillon", arrondissement: "Nantes", commentaire: "", type: "Agence", statut: "À rappeler", priorite: "Basse", prochaineRelance: "22/06/2024" },
  { entreprise: "Foncia", contact: "Mme Moreau", telephone: "06 89 01 23 45", email: "moreau@foncia.fr", adresse: "7 rue Faidherbe", arrondissement: "Lille", commentaire: "", type: "Syndic", statut: "Nouveau prospect", priorite: "Basse", prochaineRelance: "—" },
  { entreprise: "Square Habitat", contact: "M. Simon", telephone: "06 90 12 34 56", email: "simon@square-habitat.fr", adresse: "1 place de la Mairie", arrondissement: "Rennes", commentaire: "", type: "Agence", statut: "Perdu", priorite: "—", prochaineRelance: "—" },
  { entreprise: "Orpi", contact: "M. Laurent", telephone: "06 01 23 45 67", email: "laurent@orpi.fr", adresse: "6 place Kléber", arrondissement: "Strasbourg", commentaire: "", type: "Agence", statut: "Injoignable", priorite: "—", prochaineRelance: "—" },
]
