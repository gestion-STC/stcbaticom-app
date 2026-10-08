// ════════════════════════════════════════════════════════════════════════════
// LA LISTE D'EXCLUSION — une carte de l'onglet Réglages → Recrutement
//
// Ces adresses et numéros ne sont jamais recontactés, même réimportés. La
// machine la consulte à chaque démarrage de fiche et à chaque envoi ; ici on
// la lit, on y ajoute, on en retire. Rien d'autre.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react"
import { Plus } from "lucide-react"
import type { ExclusionST } from "../../recrutement"
import { ajouterExclusion, chargerExclusions, supprimerExclusion } from "../../lib/machineDb"
import { supabaseConfigure } from "../../lib/supabase"
import { emailValide } from "../../lib/reglagesRecrutement"
import { Bandeau, Bouton, Carte, Champ, Chargement, Dialogue, Etiquette, Tableau, Td, Th, TitreCarte, Tr, Vide, Zone } from "../../ui"

// Au-delà de ce nombre de lignes, on propose une recherche : en dessous, l'œil suffit.
const SEUIL_RECHERCHE = 20

const dateCourte = (iso: string) => new Date(iso).toLocaleDateString("fr-FR")

/** Les lignes qui répondent à la recherche (e-mail, téléphone ou motif, sans tenir compte de la casse). */
function filtrer(liste: ExclusionST[], recherche: string): ExclusionST[] {
  const q = recherche.trim().toLowerCase()
  if (!q) return liste
  return liste.filter((x) => x.email.toLowerCase().includes(q) || x.telephone.includes(q) || x.motif.toLowerCase().includes(q))
}

export default function ExclusionsST() {
  const [liste, setListe] = useState<ExclusionST[]>([])
  const [chargement, setChargement] = useState(!!supabaseConfigure)
  const [erreur, setErreur] = useState(supabaseConfigure ? "" : "Base non configurée.")
  const [recherche, setRecherche] = useState("")
  const [occupe, setOccupe] = useState(false)
  // Le dialogue d'ajout et son brouillon
  const [ajout, setAjout] = useState(false)
  const [email, setEmail] = useState("")
  const [telephone, setTelephone] = useState("")
  const [motif, setMotif] = useState("")
  const [erreurAjout, setErreurAjout] = useState("")
  // La ligne dont on demande confirmation avant de la retirer
  const [aRetirer, setARetirer] = useState<ExclusionST | null>(null)

  const recharger = () =>
    chargerExclusions()
      .then(setListe)
      .catch((e) => setErreur(e instanceof Error ? e.message : String(e)))

  useEffect(() => {
    if (!supabaseConfigure) return
    recharger().finally(() => setChargement(false))
  }, [])

  function ouvrirAjout() {
    setEmail("")
    setTelephone("")
    setMotif("")
    setErreurAjout("")
    setAjout(true)
  }

  async function confirmerAjout() {
    const e = email.trim()
    const t = telephone.trim()
    const m = motif.trim()
    // Le motif est obligatoire : dans six mois, il faut encore savoir POURQUOI
    // cet artisan n'est plus contacté. Et il faut au moins une clé à exclure.
    if (!e && !t) return setErreurAjout("Indiquez un e-mail ou un numéro de téléphone (ou les deux).")
    if (e && !emailValide(e)) return setErreurAjout("L'e-mail n'est pas une adresse valide.")
    if (!m) return setErreurAjout("Le motif est obligatoire.")
    setOccupe(true)
    setErreurAjout("")
    try {
      await ajouterExclusion({ email: e, telephone: t, motif: m })
      await recharger() // la base donne l'identifiant et la date : on relit plutôt que de deviner
      setAjout(false)
    } catch (err) {
      setErreurAjout(err instanceof Error ? err.message : String(err))
    } finally {
      setOccupe(false)
    }
  }

  async function confirmerRetrait() {
    if (!aRetirer) return
    setOccupe(true)
    setErreur("")
    try {
      await supprimerExclusion(aRetirer.id)
      setListe((l) => l.filter((x) => x.id !== aRetirer.id))
      setARetirer(null)
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err))
    } finally {
      setOccupe(false)
    }
  }

  const visibles = filtrer(liste, recherche)
  const cible = aRetirer ? [aRetirer.email, aRetirer.telephone].filter(Boolean).join(" · ") : ""

  return (
    <Carte>
      <TitreCarte droite={<Bouton icone={<Plus />} onClick={ouvrirAjout} disabled={!supabaseConfigure}>Ajouter</Bouton>}>
        Liste d'exclusion
      </TitreCarte>
      <div className="space-y-4 px-5 pb-5">
        <p className="text-legende text-encre-2">
          Ces adresses et numéros ne sont jamais recontactés, même réimportés : désinscriptions, adresses injoignables, demandes par téléphone.
        </p>

        {erreur ? <Bandeau role="alerte">{erreur}</Bandeau> : null}

        {liste.length > SEUIL_RECHERCHE ? (
          <Champ
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un e-mail, un numéro, un motif…"
            aria-label="Rechercher dans la liste d'exclusion"
            className="max-w-sm"
          />
        ) : null}

        {chargement ? (
          <Chargement />
        ) : liste.length === 0 ? (
          <Vide titre="Aucune exclusion" texte="La machine peut écrire à toute la base. Les désinscriptions s'ajouteront ici d'elles-mêmes." />
        ) : visibles.length === 0 ? (
          <Vide titre="Rien ne correspond" texte="Aucune ligne ne contient ce texte." />
        ) : (
          <Tableau>
            <thead>
              <tr>
                <Th>E-mail</Th>
                <Th>Téléphone</Th>
                <Th>Motif</Th>
                <Th>Depuis</Th>
                <Th className="w-px"><span className="sr-only">Actions</span></Th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((x) => (
                <Tr key={x.id}>
                  <Td className="text-encre">{x.email || "—"}</Td>
                  <Td className="chiffres text-encre">{x.telephone || "—"}</Td>
                  <Td className="text-encre-2">{x.motif || "—"}</Td>
                  <Td className="chiffres whitespace-nowrap text-encre-2">{dateCourte(x.creeLe)}</Td>
                  <Td>
                    <Bouton variante="discret" taille="sm" onClick={() => setARetirer(x)}>Retirer</Bouton>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Tableau>
        )}

        {liste.length > SEUIL_RECHERCHE ? (
          <p className="text-colonne text-encre-2">{visibles.length} sur {liste.length} ligne{liste.length > 1 ? "s" : ""}.</p>
        ) : null}
      </div>

      {ajout ? (
        <Dialogue
          titre="Ajouter à la liste d'exclusion"
          description="Un e-mail, un numéro, ou les deux. Le motif est obligatoire : il explique plus tard pourquoi cet artisan n'est plus contacté."
          onFermer={() => setAjout(false)}
          pied={
            <>
              <Bouton onClick={() => setAjout(false)}>Annuler</Bouton>
              <Bouton variante="plein" chargement={occupe} onClick={confirmerAjout}>Ajouter</Bouton>
            </>
          }
        >
          <div className="space-y-4">
            {erreurAjout ? <Bandeau role="alerte">{erreurAjout}</Bandeau> : null}
            <Etiquette texte="E-mail">
              <Champ type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="artisan@exemple.fr" autoFocus />
            </Etiquette>
            <Etiquette texte="Téléphone">
              <Champ type="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="06 12 34 56 78" className="chiffres" />
            </Etiquette>
            <Etiquette texte="Motif">
              <Zone value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. : a demandé par téléphone à ne plus être sollicité" />
            </Etiquette>
          </div>
        </Dialogue>
      ) : null}

      {aRetirer ? (
        <Dialogue
          titre="Retirer de la liste d'exclusion ?"
          description={cible + " pourra de nouveau être contacté par la machine, dès qu'une fiche le concernant repartira en séquence."}
          onFermer={() => setARetirer(null)}
          pied={
            <>
              <Bouton onClick={() => setARetirer(null)}>Annuler</Bouton>
              <Bouton variante="danger" chargement={occupe} onClick={confirmerRetrait}>Retirer</Bouton>
            </>
          }
        />
      ) : null}
    </Carte>
  )
}
