// Ouvrir un document dont l'adresse se fabrique au clic (lien signé) : l'onglet s'ouvre AVANT l'attente, sinon Safari
// (et l'iPhone) le bloque comme une fenêtre surgissante, sans rien dire (17/11/2026). Même méthode que PanneauDossier.
export async function ouvrirApresAttente(adresse: () => Promise<string>): Promise<void> {
  const onglet = window.open("", "_blank")
  if (onglet) onglet.opener = null
  try {
    const url = await adresse()
    if (onglet) onglet.location.href = url
    else window.open(url, "_blank", "noopener")
  } catch (e) {
    onglet?.close()
    throw e
  }
}
