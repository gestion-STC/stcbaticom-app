// Collage d'une signature venue d'un logiciel de mail (Outlook, Gmail, Thunderbird).
//
// Deux problèmes à régler, et ils sont indépendants :
//
// 1) LE MÉNAGE. Outlook colle un HTML truffé de balises Microsoft, de commentaires
//    conditionnels et de blocs <style>. Ce dernier point n'est pas cosmétique : un
//    <style> collé dans la page s'applique à TOUT le logiciel, pas seulement à la
//    signature — il peut déformer l'écran entier. On le retire donc, ainsi que les
//    scripts et les gestionnaires d'événements (on colle du contenu venu d'ailleurs).
//
// 2) LES IMAGES. Une signature copiée ne transporte pas ses images : elle transporte
//    des ADRESSES. Trois cas :
//      - data:  déjà intégrée, rien à faire
//      - http(s) : image distante — visible aujourd'hui, cassée le jour où l'adresse
//        tombe. On tente de la rapatrier dans la signature.
//      - cid: / file: — référence interne au logiciel de mail. Elle ne mènera JAMAIS
//        à rien ici. Seule issue : réinsérer le logo par le bouton image.

// Balises purement décoratives ou dangereuses à retirer avec leur contenu.
const BALISES_A_VIDER = ["script", "style", "xml", "title", "head"]

export function nettoyerHtmlSignature(html: string): string {
  if (!html) return ""
  let s = html

  // Commentaires conditionnels Microsoft : <!--[if gte mso 9]>…<![endif]-->
  s = s.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, "")
  // Commentaires HTML restants
  s = s.replace(/<!--[\s\S]*?-->/g, "")

  // Balises à supprimer avec leur contenu
  for (const b of BALISES_A_VIDER) {
    s = s.replace(new RegExp(`<${b}[\\s\\S]*?</${b}>`, "gi"), "")
    s = s.replace(new RegExp(`<${b}\\b[^>]*/?>`, "gi"), "")
  }

  // Balises orphelines sans contenu utile
  s = s.replace(/<\/?(?:meta|link|base|html|body|o:p)\b[^>]*>/gi, "")

  // Gestionnaires d'événements (onclick, onerror…) : on colle du contenu extérieur.
  s = s.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
  s = s.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
  s = s.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")

  // Liens javascript:
  s = s.replace(/(href|src)\s*=\s*"javascript:[^"]*"/gi, '$1="#"')
  s = s.replace(/(href|src)\s*=\s*'javascript:[^']*'/gi, "$1='#'")

  // Classes Microsoft (MsoNormal…) : elles ne pointent plus vers rien, le <style>
  // ayant été retiré. On les enlève pour alléger.
  s = s.replace(/\sclass\s*=\s*"[^"]*"/gi, "")
  s = s.replace(/\sclass\s*=\s*'[^']*'/gi, "")

  return s.trim()
}

// Toutes les adresses d'images présentes dans le HTML.
export function listerImages(html: string): string[] {
  if (!html) return []
  const out: string[] = []
  const re = /<img\b[^>]*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)')/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const src = m[1] ?? m[2] ?? ""
    if (src) out.push(src)
  }
  return out
}

export type SortImage = "integree" | "distante" | "impossible"

// Ce qu'on peut faire de chaque adresse.
export function sortImage(src: string): SortImage {
  const s = (src || "").trim().toLowerCase()
  if (s.startsWith("data:")) return "integree"
  if (s.startsWith("http://") || s.startsWith("https://")) return "distante"
  return "impossible" // cid:, file:, chemin local…
}

export function trierImages(srcs: string[]): {
  integrees: string[]
  distantes: string[]
  impossibles: string[]
} {
  const integrees: string[] = []
  const distantes: string[] = []
  const impossibles: string[] = []
  for (const s of srcs) {
    const sort = sortImage(s)
    if (sort === "integree") integrees.push(s)
    else if (sort === "distante") distantes.push(s)
    else impossibles.push(s)
  }
  return { integrees, distantes, impossibles }
}

// Message à afficher après un collage. null = tout va bien, on ne dit rien.
export function messageApresCollage(
  reussies: number,
  echouees: number,
  impossibles: number,
): string | null {
  const bouts: string[] = []
  if (reussies > 0) {
    bouts.push(
      `${reussies} image${reussies > 1 ? "s" : ""} intégrée${reussies > 1 ? "s" : ""} à la signature`,
    )
  }
  if (echouees > 0) {
    bouts.push(
      `${echouees} image${echouees > 1 ? "s" : ""} n'a pas pu être rapatriée${echouees > 1 ? "s" : ""} (le site qui l'héberge refuse la copie) — elle restera affichée tant que son adresse fonctionne`,
    )
  }
  if (impossibles > 0) {
    bouts.push(
      `${impossibles} image${impossibles > 1 ? "s" : ""} vient de ton logiciel de mail et ne s'affichera pas ici — réinsère-la avec le bouton image`,
    )
  }
  return bouts.length ? bouts.join(". ") + "." : null
}

// Une image intégrée pèse ~33 % de plus que le fichier d'origine (encodage base64).
// Au-delà, la signature devient trop lourde à stocker et alourdit chaque email.
export const POIDS_MAX_IMAGE = 1_500_000

export function imageTropLourde(dataUrl: string): boolean {
  return dataUrl.length > POIDS_MAX_IMAGE * 1.4
}
