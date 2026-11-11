// L'ANNÉE (Mahdi, 11/11/2026) : « regarder sur l'année comment ça se passe le démarchage, avoir des courbes, voir les
// moments faibles, les moments forts, un suivi du démarchage agence et sous-traitant qui pourra être facilement analysé ».
// Fichier PUR : le découpage en périodes, les comptes, le fort et le faible, l'export.

export type Pas = "mois" | "semaine"
export type Portee = "12mois" | "annee"
export type Periode = { cle: string; libelle: string; court: string; debut: Date; fin: Date; enCours: boolean }

const MOIS_COURT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]
const lundi = (d: Date) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
const deux = (n: number) => String(n).padStart(2, "0")

/** Les périodes affichées, de la plus ancienne à celle en cours. 12 derniers mois = 12 mois (ou 52 semaines) ; année = depuis janvier. */
export function periodes(maintenant: Date, pas: Pas, portee: Portee): Periode[] {
  const out: Periode[] = []
  if (pas === "mois") {
    const premier = portee === "annee" ? new Date(maintenant.getFullYear(), 0, 1) : new Date(maintenant.getFullYear(), maintenant.getMonth() - 11, 1)
    for (let d = premier; d <= maintenant; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const fin = new Date(d.getFullYear(), d.getMonth() + 1, 1)
      out.push({ cle: `${d.getFullYear()}-${deux(d.getMonth() + 1)}`, libelle: `${MOIS_COURT[d.getMonth()]} ${d.getFullYear()}`, court: MOIS_COURT[d.getMonth()].charAt(0).toUpperCase(), debut: d, fin, enCours: maintenant >= d && maintenant < fin })
    }
    return out
  }
  const fin0 = lundi(maintenant)
  const premier = portee === "annee" ? lundi(new Date(maintenant.getFullYear(), 0, 1)) : new Date(fin0.getFullYear(), fin0.getMonth(), fin0.getDate() - 7 * 51)
  for (let d = premier; d <= maintenant; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)) {
    const fin = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)
    out.push({ cle: `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`, libelle: `semaine du ${d.getDate()} ${MOIS_COURT[d.getMonth()]}`, court: d.getDate() <= 7 ? MOIS_COURT[d.getMonth()].charAt(0).toUpperCase() : "", debut: d, fin, enCours: maintenant >= d && maintenant < fin })
  }
  return out
}

/** Combien de dates tombent dans chaque période. Les dates vides ou illisibles sont ignorées. */
export function compter(dates: (string | null | undefined)[], ps: Periode[]): number[] {
  const n = ps.map(() => 0)
  if (!ps.length) return n
  const debut = ps[0].debut.getTime(), fin = ps[ps.length - 1].fin.getTime()
  for (const s of dates) {
    if (!s) continue
    const t = new Date(s).getTime()
    if (!(t >= debut && t < fin)) continue
    const i = ps.findIndex((p) => t >= p.debut.getTime() && t < p.fin.getTime())
    if (i >= 0) n[i]++
  }
  return n
}

/** Avant la première valeur non nulle, le suivi n'existait pas encore : ces périodes passent « sans donnée » (null). */
export function depuisLeDebut(v: (number | null)[]): (number | null)[] {
  const premier = v.findIndex((x) => x !== null && x > 0)
  return premier < 0 ? v.map(() => null) : v.map((x, i) => (i < premier ? null : x))
}

/** Le moment fort (le plus haut) et le moment faible (le plus bas), sans compter la période en cours, qui n'est pas finie,
 *  ni les périodes sans donnée (null). La moyenne se fait sur les mêmes périodes. */
export function fortEtFaible(v: (number | null)[], ps: Periode[]): { fort: number | null; faible: number | null; moyenne: number } {
  const finies = v.map((x, i) => ({ x: x as number, i })).filter(({ x, i }) => x !== null && !ps[i]?.enCours)
  const moyenne = finies.length ? finies.reduce((a, b) => a + b.x, 0) / finies.length : 0
  if (!finies.length || finies.every(({ x }) => x === finies[0].x)) return { fort: null, faible: null, moyenne }
  const fort = finies.reduce((a, b) => (b.x > a.x ? b : a)).i
  const faible = finies.reduce((a, b) => (b.x < a.x ? b : a)).i
  return { fort, faible, moyenne }
}

/** Le tableau en CSV (séparateur « ; » pour Excel en français), une ligne par période. */
export function versCsv(ps: Periode[], series: { nom: string; v: (number | null)[] }[]): string {
  const echapper = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const lignes = [["Période", ...series.map((s) => s.nom)].map(echapper).join(";")]
  ps.forEach((p, i) => lignes.push([p.libelle, ...series.map((s) => (s.v[i] === null ? "" : String(s.v[i]).replace(".", ",")))].map(echapper).join(";")))
  return lignes.join("\n")
}
