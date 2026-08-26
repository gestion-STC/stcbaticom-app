// Le logo d'une signature d'email doit être HÉBERGÉ, pas intégré.
//
// Une image intégrée (data:) s'affiche parfaitement dans un navigateur — donc
// dans l'éditeur de signature — mais Gmail, Outlook et la quasi-totalité des
// messageries la SUPPRIMENT à la réception, par sécurité. Le destinataire voit
// un carré cassé.
//
// La seule voie fiable sans toucher au serveur d'envoi : héberger le logo à une
// adresse publique et permanente. Celle du site du logiciel convient : elle est
// republiée à chaque mise en ligne et ne dépend d'aucun service extérieur.

export const LOGO_SIGNATURE_URL =
  "https://gestion-stc.github.io/stcbaticom-app/logo-stc.png"

// Le logo mesure 477 x 221 px. À 150 px de large il fait 69 px de haut, soit
// exactement la hauteur des trois lignes de coordonnées à côté : le bloc est
// aligné, le logo lisible sans écraser le reste. À 200 px il faisait 93 px et
// dominait la signature.
export const LARGEUR_LOGO_SIGNATURE = 150

export function balisesLogoSignature(): string {
  // L'attribut `width` en plus du style : Outlook ignore une partie du CSS mais
  // respecte l'attribut HTML. Sans lui, le logo s'affiche en taille réelle.
  return `<img src="${LOGO_SIGNATURE_URL}" alt="STC Bâtiment" width="${LARGEUR_LOGO_SIGNATURE}" style="width:${LARGEUR_LOGO_SIGNATURE}px;max-width:${LARGEUR_LOGO_SIGNATURE}px;height:auto;" />`
}

// Reconnaît le logo hébergé déjà présent, pour le remplacer au lieu d'en ajouter
// un deuxième quand on reclique sur le bouton.
export function estLogoHeberge(src: string): boolean {
  return (src || "").trim() === LOGO_SIGNATURE_URL
}

// Y a-t-il des images intégrées ? Ce sont elles qui casseront à la réception.
export function compterImagesIntegrees(html: string): number {
  if (!html) return 0
  const re = /<img\b[^>]*?\ssrc\s*=\s*(?:"data:|'data:)/gi
  return (html.match(re) || []).length
}

// Avertissement à afficher sous l'éditeur. null = rien à signaler.
export function avertissementImagesIntegrees(html: string): string | null {
  const n = compterImagesIntegrees(html)
  if (n === 0) return null
  const p = n > 1
  return `${n} image${p ? "s" : ""} de cette signature ${p ? "sont intégrées" : "est intégrée"} au message. Elle${p ? "s" : ""} s'affiche${p ? "nt" : ""} ici, mais la plupart des messageries (Gmail, Outlook) ${p ? "les" : "la"} bloquent à la réception : ton destinataire verra un carré cassé.`
}
