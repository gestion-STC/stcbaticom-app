// Lecture COMPLÈTE d'une table, par lots.
//
// Supabase (PostgREST) plafonne chaque requête à 1000 lignes. Sans pagination,
// une table plus grosse est tronquée EN SILENCE : pas d'erreur, juste des
// données manquantes — d'où des compteurs faux et des listes incomplètes.
// C'est exactement ce qui faisait que les chiffres des états ne correspondaient
// plus à la réalité une fois la base passée au-dessus de 1000 prospects.

export const PAS_LECTURE = 1000

type Reponse<T> = { data: T[] | null; error: { message: string } | null }

// `charger(debut, fin)` doit renvoyer le lot correspondant (bornes incluses).
// ⚠️ La requête doit avoir un tri STABLE (avec l'id en dernier critère), sinon
// deux lots peuvent se recouvrir : une ligne apparaîtrait en double et une autre
// serait sautée.
// `PromiseLike` (et non `Promise`) : c'est ce que renvoie une requête Supabase.
export async function lireParLots<T>(
  charger: (debut: number, fin: number) => PromiseLike<Reponse<T>>,
): Promise<T[]> {
  const tout: T[] = []
  for (let debut = 0; ; debut += PAS_LECTURE) {
    const { data, error } = await charger(debut, debut + PAS_LECTURE - 1)
    if (error) throw new Error(error.message)
    const lot = data ?? []
    tout.push(...lot)
    // Un lot incomplet = on a atteint la fin.
    if (lot.length < PAS_LECTURE) return tout
  }
}
