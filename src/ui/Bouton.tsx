// ════════════════════════════════════════════════════════════════════════════
// LA TROUSSE « STC » DE L'ESPACE RECRUTEMENT — le bouton
//
// Mahdi, 08/10/2026 : « reprends le design système du logiciel STC Bâtiment,
// mêmes formes, mêmes boutons, juste la couleur de STC Baticom ». Donc :
// la forme du bureau STC (rayon 4, hauteur 34, texte 12 graisse 500, icône 16,
// ombre posée), l'action en ANTHRACITE, et le VIOLET réservé aux lignes
// (focus, onglet actif, barre de navigation, tiret de titre) — « la couleur
// ne remplit jamais », un seul bouton plein par écran.
// ════════════════════════════════════════════════════════════════════════════
import type { ButtonHTMLAttributes, ReactNode } from "react"
import { Loader2 } from "lucide-react"

export type VarianteBouton = "plein" | "contour" | "discret" | "danger" | "lien"

const BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-4 text-legende font-medium transition-colors " +
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signature focus-visible:ring-offset-2 " +
  "disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"

const VARIANTES: Record<VarianteBouton, string> = {
  plein: "bg-action text-white shadow-posee hover:bg-action-survol",
  contour: "border border-trait bg-fond text-encre hover:border-trait-fort hover:bg-fond-4",
  discret: "text-encre hover:bg-fond-4",
  danger: "border border-trait bg-fond text-alerte hover:border-alerte hover:bg-alerte hover:text-white",
  lien: "h-auto px-0 text-encre underline-offset-4 hover:underline",
}

const TAILLES = { md: "h-[34px] px-4", sm: "h-7 px-3 text-colonne", icone: "h-[34px] w-[34px] p-0" }

export default function Bouton({
  variante = "contour",
  taille = "md",
  chargement = false,
  icone,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: VarianteBouton
  taille?: keyof typeof TAILLES
  chargement?: boolean
  icone?: ReactNode
}) {
  return (
    <button
      type={props.type ?? "button"}
      {...props}
      disabled={props.disabled || chargement}
      className={`${BASE} ${VARIANTES[variante]} ${variante === "lien" ? "" : TAILLES[taille]} ${className}`}
    >
      {chargement ? <Loader2 className="animate-spin" /> : icone}
      {children}
    </button>
  )
}
