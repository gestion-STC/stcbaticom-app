// LE SONDAGE DES APPELS ENTRANTS (27/11/2026) : un seul onglet par poste interroge Ringover, et il espace ses
// questions quand Ringover répond en erreur. Fichier PUR : sondageRingover.test.ts le lit.

export const CLE_SONDEUR = "baticom-sondeur-ringover"
/** Au-delà, l'onglet qui sondait est considéré comme fermé ou endormi : un autre prend la main. */
export const MAIN_VALABLE_MS = 12_000

type Stockage = Pick<Storage, "getItem" | "setItem">

/** Cet onglet peut-il sonder maintenant ? Oui s'il a déjà la main, ou si personne ne l'a prise depuis 12 s. */
export function prendreLaMain(stockage: Stockage, moi: string, maintenant: number): boolean {
  try {
    const v = JSON.parse(stockage.getItem(CLE_SONDEUR) ?? "null") as { id?: string; t?: number } | null
    if (v && v.id && v.id !== moi && typeof v.t === "number" && maintenant - v.t < MAIN_VALABLE_MS) return false
    stockage.setItem(CLE_SONDEUR, JSON.stringify({ id: moi, t: maintenant }))
    return true
  } catch {
    return true // stockage indisponible : chaque onglet sonde, comme avant
  }
}

/** L'attente après N échecs d'affilée : 10 s, 20 s, 40 s… jusqu'à 2 min. */
export function delaiApresEchecs(echecs: number): number {
  if (echecs <= 0) return 0
  return Math.min(120_000, 10_000 * 2 ** (echecs - 1))
}
