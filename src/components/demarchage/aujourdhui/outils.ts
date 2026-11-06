// Les petits outils du style courtier (formats de nombres).

export const fr = (n: number) => n.toLocaleString("fr-FR")
export const pct = (a: number, b: number): number | null => (b > 0 ? (a / b) * 100 : null)
export const pctTxt = (v: number | null, dec = 0) => (v === null ? "—" : `${v.toFixed(dec).replace(".", ",")} %`)

