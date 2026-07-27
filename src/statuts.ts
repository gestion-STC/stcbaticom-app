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
  // Couleurs ajoutées (la palette d'origine était presque entièrement utilisée).
  | "teal"
  | "indigo"
  | "purple"
  | "fuchsia"
  | "rose"
  | "lime"
  | "yellow"
  | "stone"
  | "ardoise"
  | "bleu-nuit"
  | "vert-fonce"
  | "bordeaux"
  | "marron"

const paletteBase: Record<CleCouleur, { pill: string; dot: string; label: string }> = {
  slate: { pill: "bg-slate-100 text-slate-700", dot: "#737373", label: "Gris" },
  // « blue » est remappé en violet par le thème global (design STC) : pour garder
  // un vrai bleu dans la palette des états, on passe par sky (non remappé).
  blue: { pill: "bg-sky-50 text-sky-700", dot: "#0ea5e9", label: "Bleu" },
  cyan: { pill: "bg-cyan-50 text-cyan-700", dot: "#06b6d4", label: "Cyan" },
  violet: { pill: "bg-violet-50 text-violet-700", dot: "#8b5cf6", label: "Violet" },
  orange: { pill: "bg-orange-50 text-orange-700", dot: "#f97316", label: "Orange" },
  amber: { pill: "bg-amber-50 text-amber-700", dot: "#d97706", label: "Ambre" },
  pink: { pill: "bg-pink-50 text-pink-700", dot: "#ec4899", label: "Rose" },
  emerald: { pill: "bg-emerald-50 text-emerald-700", dot: "#10b981", label: "Émeraude" },
  green: { pill: "bg-green-50 text-green-700", dot: "#22c55e", label: "Vert" },
  red: { pill: "bg-red-50 text-red-700", dot: "#ef4444", label: "Rouge" },
  // --- Ajouts : teintes vives ---
  teal: { pill: "bg-teal-50 text-teal-700", dot: "#14b8a6", label: "Turquoise" },
  indigo: { pill: "bg-indigo-50 text-indigo-700", dot: "#6366f1", label: "Indigo" },
  purple: { pill: "bg-purple-50 text-purple-700", dot: "#a855f7", label: "Pourpre" },
  fuchsia: { pill: "bg-fuchsia-50 text-fuchsia-700", dot: "#d946ef", label: "Fuchsia" },
  rose: { pill: "bg-rose-50 text-rose-700", dot: "#f43f5e", label: "Rose vif" },
  lime: { pill: "bg-lime-50 text-lime-700", dot: "#84cc16", label: "Vert citron" },
  yellow: { pill: "bg-yellow-50 text-yellow-700", dot: "#eab308", label: "Jaune vif" },
  stone: { pill: "bg-stone-100 text-stone-700", dot: "#a8a29e", label: "Taupe" },
  // --- Ajouts : teintes soutenues (pour bien se distinguer des précédentes) ---
  ardoise: { pill: "bg-slate-200 text-slate-800", dot: "#475569", label: "Ardoise" },
  "bleu-nuit": { pill: "bg-indigo-100 text-indigo-900", dot: "#3730a3", label: "Bleu nuit" },
  "vert-fonce": { pill: "bg-emerald-100 text-emerald-900", dot: "#065f46", label: "Vert foncé" },
  bordeaux: { pill: "bg-rose-100 text-rose-900", dot: "#9f1239", label: "Bordeaux" },
  marron: { pill: "bg-amber-100 text-amber-900", dot: "#78350f", label: "Marron" },
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

// Couleurs déjà attribuées à un AUTRE état que celui qu'on est en train de modifier.
// Renvoie une Map « couleur → libellé de l'état qui la porte », pour pouvoir bloquer
// ces couleurs dans le sélecteur (deux états de la même couleur = indistinguables).
// `enCours` = l'état modifié (null en création) : SA couleur reste disponible.
// Pur → testable.
export function couleursPrises(etats: Statut[], enCours: Statut | null): Map<string, string> {
  const prises = new Map<string, string>()
  for (const s of etats) {
    // On reconnaît l'état en cours par son id ; à défaut (état pas encore
    // enregistré), on retombe sur son libellé.
    const memeEtat = enCours && (s.id && enCours.id ? s.id === enCours.id : s.libelle === enCours.libelle)
    if (memeEtat) continue
    if (!prises.has(s.couleur)) prises.set(s.couleur, s.libelle)
  }
  return prises
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

// Déplace un état d'un cran (flèches ↑↓ du Paramétrage). Renvoie une NOUVELLE
// liste ; hors limites, la liste est rendue inchangée. Pur → testable.
export function deplacerEtat(liste: Statut[], index: number, sens: -1 | 1): Statut[] {
  const cible = index + sens
  if (cible < 0 || cible >= liste.length) return liste
  const copie = [...liste]
  copie[index] = liste[cible]
  copie[cible] = liste[index]
  return copie
}

// Renumérote la liste affichée de 1 à N, sans trou ni doublon.
// C'est LA garantie que le classement est le même partout : toutes les listes
// trient sur `ordre`, donc deux états ne doivent jamais partager un numéro.
// Pur → testable.
export function renumeroterOrdres(liste: Statut[]): Statut[] {
  return liste.map((s, i) => ({ ...s, ordre: i + 1 }))
}

// Classement des prospects d'après l'ORDRE des états choisi par l'utilisateur
// (les flèches ↑↓ du Paramétrage → États). L'état placé en haut de la liste
// remonte les prospects en premier : le classement du Paramétrage fait foi partout.
//
// On se base sur la POSITION dans la liste triée, pas sur la valeur brute de `ordre`
// (qui peut avoir des trous ou des doublons après des réorganisations).
// Un état inconnu (donnée ancienne) est relégué en fin de liste. Pur → testable.
export function rangDepuisOrdre(statuts: Statut[]): (libelle: string) => number {
  const rangs = new Map<string, number>()
  statuts
    .slice()
    .sort((a, b) => a.ordre - b.ordre)
    .forEach((s, i) => {
      if (!rangs.has(s.libelle)) rangs.set(s.libelle, i)
    })
  return (libelle: string) => rangs.get(libelle) ?? Number.MAX_SAFE_INTEGER
}
