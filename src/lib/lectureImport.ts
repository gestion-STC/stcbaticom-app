// Lecture des fichiers importés (13/10) : le CSV et le nom d'un gestionnaire tiré d'une note.
// Seuls restes utiles de l'ancien import des « prospects » (avant la refonte du 09/10) ; servent
// à l'import des agences et à celui des sous-traitants.

// Mots qui signalent la FIN du nom (début d'une description) : on coupe avant.
const motsDescription =
  /\b(gestionnaire|gestion|apport|apporteur|contrat|syndic|directeur|responsable|gere|gère|volume|inter|envoyer|bon ress|rappeler|relancer|appeler|locative)\b/i

const clean = (s: string) => s.replace(/\s+/g, " ").replace(/^[·.,;:\s]+|[·.,;:\s]+$/g, "").trim()
const capitaliser = (s: string) =>
  s
    .split(" ")
    .map((w) => (w.length > 2 && !/^(et|de|du|des|la|le|les)$/i.test(w) ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")

// Extrait un NOM de personne propre depuis une note (sans la description qui suit).
export function extraireNom(note: string): string {
  if (!note) return ""
  // 1) "Nom: X" (jusqu'à "Mail:")
  const mNom = note.match(/nom\s*:\s*(.+)$/i)
  if (mNom) {
    let b = clean(mNom[1].split(/mail\s*:/i)[0])
    const m = b.match(motsDescription)
    if (m && m.index) b = clean(b.slice(0, m.index))
    return b ? capitaliser(b) : ""
  }
  // 2) Une civilité (Mme / M. / …) est présente → on part d'elle, on coupe à la description
  const civ = note.match(/\b(mme|mlle|m\.|mr|monsieur|madame)\b/i)
  if (civ && civ.index !== undefined) {
    let b = clean(note.slice(civ.index))
    const m = b.match(motsDescription)
    if (m && m.index) b = clean(b.slice(0, m.index))
    const mots = b.split(" ").filter(Boolean)
    return mots.length >= 1 && mots.length <= 6 ? capitaliser(b) : ""
  }
  // 3) Sinon : on coupe à la description et on accepte si c'est court et "nom-like"
  let b = clean(note)
  const m = b.match(motsDescription)
  if (m) b = clean(b.slice(0, m.index))
  const mots = b.split(" ").filter(Boolean)
  if (mots.length >= 1 && mots.length <= 3 && /[a-zàâçéèêëîïôûùü]/i.test(b) && b.length >= 3 && b.length <= 40 && !/\d/.test(b))
    return capitaliser(b)
  return ""
}

export function parseCsv(texte: string): string[][] {
  const t = texte.replace(/^\uFEFF/, "") // retire le BOM UTF-8 éventuel
  const premiere = t.split(/\r?\n/)[0] ?? ""
  const sep =
    (premiere.match(/;/g)?.length ?? 0) >= (premiere.match(/,/g)?.length ?? 0)
      ? ";"
      : ","
  const lignes: string[][] = []
  let champ = ""
  let ligne: string[] = []
  let q = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (q) {
      if (c === '"') {
        if (t[i + 1] === '"') { champ += '"'; i++ } else q = false
      } else champ += c
    } else if (c === '"') q = true
    else if (c === sep) { ligne.push(champ); champ = "" }
    else if (c === "\n") { ligne.push(champ); lignes.push(ligne); ligne = []; champ = "" }
    else if (c !== "\r") champ += c
  }
  if (champ.length || ligne.length) { ligne.push(champ); lignes.push(ligne) }
  return lignes.filter((l) => l.some((c) => c.trim()))
}
