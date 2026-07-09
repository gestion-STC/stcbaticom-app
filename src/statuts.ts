// Palette de couleurs disponibles pour les états (statuts).
// Les classes Tailwind sont écrites en toutes lettres pour être bien prises en compte.

export type CleCouleur =
  | "slate"
  | "blue"
  | "cyan"
  | "violet"
  | "orange"
  | "amber"
  | "pink"
  | "emerald"
  | "green"
  | "red"

const paletteBase: Record<CleCouleur, { pill: string; dot: string; label: string }> = {
  slate: { pill: "bg-slate-100 text-slate-700", dot: "#64748b", label: "Gris" },
  blue: { pill: "bg-blue-50 text-blue-700", dot: "#3b82f6", label: "Bleu" },
  cyan: { pill: "bg-cyan-50 text-cyan-700", dot: "#06b6d4", label: "Cyan" },
  violet: { pill: "bg-violet-50 text-violet-700", dot: "#8b5cf6", label: "Violet" },
  orange: { pill: "bg-orange-50 text-orange-700", dot: "#f97316", label: "Orange" },
  amber: { pill: "bg-amber-50 text-amber-700", dot: "#d97706", label: "Jaune" },
  pink: { pill: "bg-pink-50 text-pink-700", dot: "#ec4899", label: "Rose" },
  emerald: { pill: "bg-emerald-50 text-emerald-700", dot: "#10b981", label: "Émeraude" },
  green: { pill: "bg-green-50 text-green-700", dot: "#22c55e", label: "Vert" },
  red: { pill: "bg-red-50 text-red-700", dot: "#ef4444", label: "Rouge" },
}

// Accès sûr : une couleur inconnue (donnée corrompue) retombe sur "slate" au lieu de planter l'écran.
export const palette = new Proxy(paletteBase, {
  get: (cible, prop: string) => cible[prop as CleCouleur] ?? cible.slate,
}) as Record<string, { pill: string; dot: string; label: string }>

export const clesCouleurs = Object.keys(paletteBase) as CleCouleur[]

// Jeu d'états par défaut, utilisé tant que la table « statuts » n'existe pas.
const d = { categorie: "" as const, relanceJours: null }
export const statutsParDefaut: Statut[] = [
  { libelle: "Nouveau prospect", couleur: "slate", ordre: 1, estObjectif: false, ...d, categorie: "Prospection" },
  { libelle: "À rappeler", couleur: "blue", ordre: 2, estObjectif: false, ...d, categorie: "Prospection" },
  { libelle: "Contacté", couleur: "cyan", ordre: 3, estObjectif: false, ...d, categorie: "Prospection" },
  { libelle: "Intéressé", couleur: "violet", ordre: 4, estObjectif: false, ...d, categorie: "Conversion" },
  { libelle: "RDV pris", couleur: "orange", ordre: 5, estObjectif: false, ...d, categorie: "Conversion" },
  { libelle: "Relance", couleur: "pink", ordre: 6, estObjectif: false, ...d, categorie: "Relance" },
  { libelle: "Client signé", couleur: "emerald", ordre: 7, estObjectif: false, ...d, categorie: "Conversion" },
  { libelle: "Injoignable", couleur: "slate", ordre: 8, estObjectif: false, ...d, categorie: "Sortie" },
  { libelle: "Perdu", couleur: "red", ordre: 9, estObjectif: false, ...d, categorie: "Sortie" },
]

export const categories = [
  "Prospection",
  "Relance",
  "Conversion",
  "Sortie",
] as const
export type Categorie = (typeof categories)[number] | ""

// Un état (statut) configurable par l'utilisateur.
export type Statut = {
  id?: string
  libelle: string
  couleur: CleCouleur
  ordre: number
  estObjectif: boolean
  categorie: Categorie
  relanceJours: number | null // relance auto au bout de X jours (null = aucune)
}

// Classe du badge pour un libellé de statut donné, via la liste des états connus.
export function classePastille(
  libelle: string,
  statuts: Statut[],
): string {
  const s = statuts.find((x) => x.libelle === libelle)
  const cle = s?.couleur ?? "slate"
  return palette[cle].pill
}

// Ordre « qualité » pour classer les prospects du MEILLEUR (signé) au PIRE (perdu).
const rangQualite: Record<string, number> = {
  "Client signé": 0,
  "RDV pris": 1,
  Intéressé: 2,
  "À rappeler": 3,
  "Nouveau prospect": 4,
  Injoignable: 5,
  Perdu: 6,
}
export const rangEtat = (libelle: string): number => rangQualite[libelle] ?? 50
