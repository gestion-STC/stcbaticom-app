// ════════════════════════════════════════════════════════════════════════════
// LES SECTEURS — la liste fermée des codes postaux où l'on prospecte, groupée
// par zone (Paris, 92, 93, 94, 95, 78). Ici : la zone déduite d'un code, le tri,
// le groupage, et les trois accès base de l'écran Réglages › Secteurs
// (compter, renommer, ajouter). `db.ts` garde la lecture (`chargerSecteurs`).
// ════════════════════════════════════════════════════════════════════════════
import { supabase } from "../lib/supabase"
import { lireParLots } from "../lib/pagination"
import type { Secteur } from "./modele"

// L'ordre d'affichage des zones ; une zone inconnue (77, 91…) vient après, par numéro.
export const ZONES: { code: string; libelle: string; base: number }[] = [
  { code: "Paris", libelle: "Paris", base: 0 },
  { code: "92", libelle: "Hauts-de-Seine (92)", base: 100 },
  { code: "93", libelle: "Seine-Saint-Denis (93)", base: 130 },
  { code: "94", libelle: "Val-de-Marne (94)", base: 140 },
  { code: "95", libelle: "Val-d'Oise (95)", base: 150 },
  { code: "78", libelle: "Yvelines (78)", base: 200 },
]
const rangZone = (zone: string) => { const i = ZONES.findIndex((z) => z.code === zone); return i === -1 ? ZONES.length : i }

export const codeValide = (code: string): boolean => /^\d{5}$/.test(code.trim())

// « 75005 » → « Paris » ; « 92100 » → « 92 » (les deux premiers chiffres, comme la conversion SQL).
export function zoneDepuisCode(code: string): string {
  const c = code.trim()
  if (c.startsWith("75")) return "Paris"
  return c.slice(0, 2)
}
export function libelleZone(zone: string): string {
  return ZONES.find((z) => z.code === zone)?.libelle ?? `Département ${zone}`
}

// Zone d'abord (dans l'ordre ci-dessus), puis l'ordre saisi, puis le code.
export function trierSecteurs(secteurs: Secteur[]): Secteur[] {
  return [...secteurs].sort((a, b) => {
    const za = rangZone(a.zone), zb = rangZone(b.zone)
    if (za !== zb) return za - zb
    if (za === ZONES.length && a.zone !== b.zone) return a.zone.localeCompare(b.zone, "fr", { numeric: true })
    if (a.ordre !== b.ordre) return a.ordre - b.ordre
    return a.code.localeCompare(b.code)
  })
}
export type GroupeZone = { zone: string; libelle: string; secteurs: Secteur[] }
export function grouperParZone(secteurs: Secteur[]): GroupeZone[] {
  const out: GroupeZone[] = []
  for (const s of trierSecteurs(secteurs)) {
    const g = out.find((x) => x.zone === s.zone)
    if (g) g.secteurs.push(s)
    else out.push({ zone: s.zone, libelle: libelleZone(s.zone), secteurs: [s] })
  }
  return out
}
// Le rang d'un nouveau secteur : après le dernier de sa zone (ou la base de la zone si elle est vide).
export function prochainOrdre(zone: string, secteurs: Secteur[]): number {
  const dansZone = secteurs.filter((s) => s.zone === zone).map((s) => s.ordre)
  if (dansZone.length) return Math.max(...dansZone) + 1
  return ZONES.find((z) => z.code === zone)?.base ?? 900
}

// ── La base ──
function sb() {
  if (!supabase) throw new Error("Supabase n'est pas configuré.")
  return supabase
}
// Le nombre d'agences par secteur, compté ici (les apporteurs sont une archive : pas comptés).
// La clé "" compte les agences SANS secteur : celles que la file « secteur du jour » ne verra jamais.
export async function compterAgencesParSecteur(): Promise<Map<string, number>> {
  const s = sb()
  type L = { id: string; secteur: string | null }
  const lignes = await lireParLots<L>((de, a) => s.from("agences").select("id, secteur").neq("type", "apporteur").order("id").range(de, a))
  const out = new Map<string, number>()
  for (const l of lignes) { const k = l.secteur ?? ""; out.set(k, (out.get(k) ?? 0) + 1) }
  return out
}
export async function renommerSecteur(code: string, libelle: string): Promise<void> {
  const l = libelle.trim()
  if (!l) throw new Error("Le libellé ne peut pas être vide.")
  const { error } = await sb().from("secteurs").update({ libelle: l }).eq("code", code)
  if (error) throw new Error(error.message)
}
export async function ajouterSecteur(code: string, libelle: string, actuels: Secteur[]): Promise<Secteur> {
  const c = code.trim()
  if (!codeValide(c)) throw new Error("Le code postal doit faire 5 chiffres.")
  if (actuels.some((s) => s.code === c)) throw new Error(`Le secteur ${c} existe déjà.`)
  const l = libelle.trim()
  if (!l) throw new Error("Donne un nom au secteur (la commune, ou « Paris 5 »).")
  const zone = zoneDepuisCode(c)
  const secteur: Secteur = { code: c, libelle: l, zone, ordre: prochainOrdre(zone, actuels) }
  const { error } = await sb().from("secteurs").insert(secteur)
  if (error) throw new Error(error.message)
  return secteur
}
// Les codes qui manquent à la liste sont créés (libellé = le code), comme l'a fait la conversion. Renvoie les codes créés.
export async function assurerSecteurs(codes: string[]): Promise<string[]> {
  const s = sb()
  const voulus = [...new Set(codes.map((c) => c.trim()).filter(codeValide))]
  if (!voulus.length) return []
  const { data, error } = await s.from("secteurs").select("code").in("code", voulus)
  if (error) throw new Error(error.message)
  const existants = new Set(((data ?? []) as { code: string }[]).map((x) => x.code))
  const manquants = voulus.filter((c) => !existants.has(c))
  if (!manquants.length) return []
  const { error: e2 } = await s.from("secteurs").insert(manquants.map((code) => ({ code, libelle: code, zone: zoneDepuisCode(code), ordre: 900 })))
  if (e2) throw new Error(e2.message)
  return manquants
}
