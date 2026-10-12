// ════════════════════════════════════════════════════════════════════════════
// LA FONCTION D'UN COMPTE — ce que la personne fait (12/10/2026)
//
// Mahdi : « Adan est dans le suivi des commerciaux mais il s'occupe de la
// partie sous-traitants, il n'a rien à faire là […] ne fais pas un bouton à
// cocher, fais un rôle : même nous, en tant que commerciaux, on se marque en
// tant que commerciaux. Comme ça plus tard on a des rôles clairs. »
//
// Distincte du RÔLE d'accès (administrateur / téléprospecteur, tenu par le
// serveur) : la fonction dit le MÉTIER. Rangée dans `parametres`
// (clé « fonctions_comptes », un objet { id du compte → fonction }) : aucun
// SQL, aucune fonction serveur à redéployer.
//
// Le classement des commerciaux ne montre que les « Commercial », et les
// comptes dont la fonction n'est pas encore posée (pour ne cacher personne
// par défaut).
// ════════════════════════════════════════════════════════════════════════════
import { ecrireParametre, lireParametre } from "./parametresDb"

export const FONCTIONS = ["commercial", "recrutement", "direction"] as const
export type Fonction = (typeof FONCTIONS)[number]

export const LIBELLE_FONCTION: Record<Fonction, string> = {
  commercial: "Commercial",
  recrutement: "Recrutement sous-traitants",
  direction: "Direction",
}

export const CLE_FONCTIONS = "fonctions_comptes"
export type FonctionsParCompte = Record<string, Fonction>

const estFonction = (v: unknown): v is Fonction =>
  typeof v === "string" && (FONCTIONS as readonly string[]).includes(v)

/** Lit la valeur rangée ; ignore tout ce qui n'est pas une fonction connue. */
export function lireFonctions(valeur: string | null | undefined): FonctionsParCompte {
  if (!valeur) return {}
  try {
    const brut = JSON.parse(valeur) as Record<string, unknown>
    const sortie: FonctionsParCompte = {}
    for (const [id, f] of Object.entries(brut ?? {})) if (estFonction(f)) sortie[id] = f
    return sortie
  } catch {
    return {}
  }
}

/** Au classement des commerciaux : les commerciaux, et ceux dont la fonction n'est pas posée. */
export function estAuClassement(fonction: Fonction | undefined): boolean {
  return !fonction || fonction === "commercial"
}

export async function chargerFonctions(): Promise<FonctionsParCompte> {
  return lireFonctions(await lireParametre(CLE_FONCTIONS))
}

/** Pose (ou retire, avec null) la fonction d'un compte. Relit avant d'écrire pour ne rien écraser. */
export async function poserFonction(compteId: string, fonction: Fonction | null): Promise<FonctionsParCompte> {
  const actuelles = await chargerFonctions()
  if (fonction) actuelles[compteId] = fonction
  else delete actuelles[compteId]
  await ecrireParametre(CLE_FONCTIONS, JSON.stringify(actuelles))
  return actuelles
}
