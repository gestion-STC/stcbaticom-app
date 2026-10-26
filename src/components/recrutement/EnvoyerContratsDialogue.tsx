// ════════════════════════════════════════════════════════════════════════════
// « ENVOYER LES CONTRATS » (11/10/2026) — depuis un dossier déposé.
//
// On ne fait un contrat qu'à un artisan qui a déposé son dossier (Mahdi).
// La fenêtre lit le pack (les modèles DocuSign), réunit les champs que
// l'artisan doit voir remplis, les prépare avec ce que dit le dossier (raison
// sociale, SIRET, dirigeant, adresse…) et la fiche ; on complète, on envoie.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState, type FormEvent } from "react"
import type { DossierST, SousTraitant } from "../../recrutement"
import { chargerModelesDocusign, chargerPack, envoyerContrats } from "../../lib/contratsDb"
import { champsArtisan, connuDepuis, libelleChamp, valeurProposee, type ModeleDocusign } from "../../lib/contratsOutils"
import { useSession } from "../../lib/auth"
import { nomAffiche } from "../../lib/comptes"
import { Bandeau, Bouton, Case, Champ, Chargement, Dialogue, Etiquette } from "../../ui"

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export default function EnvoyerContratsDialogue({ fiche, dossier, onFermer, onEnvoye }: {
  fiche: SousTraitant; dossier?: DossierST | null; onFermer: () => void; onEnvoye: (texte: string) => void
}) {
  const session = useSession()
  const compteNom = nomAffiche(session)
  const [pack, setPack] = useState<ModeleDocusign[] | null>(null)
  const [coches, setCoches] = useState<string[]>([])
  const [valeurs, setValeurs] = useState<Record<string, string>>({})
  const [signataireNom, setSignataireNom] = useState("")
  const [signataireEmail, setSignataireEmail] = useState("")
  const [erreur, setErreur] = useState("")
  const [occupe, setOccupe] = useState(false)

  useEffect(() => {
    let vivant = true
    const t = setTimeout(async () => {
      try {
        const [m, p] = await Promise.all([chargerModelesDocusign(), chargerPack()])
        const choisis = p.filter((x) => x.actif).map((x) => m.modeles.find((y) => y.templateId === x.templateId)).filter((x): x is ModeleDocusign => !!x)
        const connu = connuDepuis(dossier, fiche)
        const liste = champsArtisan(choisis)
        if (!vivant) return
        setPack(choisis)
        setCoches(choisis.map((x) => x.templateId))
        setValeurs(Object.fromEntries(liste.map((c) => [c.label, valeurProposee(c.label, connu)])))
        setSignataireNom(valeurProposee("Dirigeant", connu) || fiche.contact || "")
        setSignataireEmail(fiche.email || dossier?.email || valeurProposee("E-mail", connu))
      } catch (e) {
        if (vivant) { setErreur(message(e)); setPack([]) }
      }
    }, 0)
    return () => { vivant = false; clearTimeout(t) }
  }, [fiche, dossier])

  const retenus = (pack ?? []).filter((m) => coches.includes(m.templateId))
  const champs = champsArtisan(retenus)
  const manquants = champs.filter((c) => c.requis && !(valeurs[c.label] ?? "").trim()).map((c) => libelleChamp(c.label))
  const pret = retenus.length > 0 && !!signataireNom.trim() && /\S+@\S+\.\S+/.test(signataireEmail) && manquants.length === 0

  const envoyer = async (e: FormEvent) => {
    e.preventDefault()
    if (!pret) return
    setOccupe(true); setErreur("")
    try {
      const r = await envoyerContrats({ sousTraitantId: fiche.id!, compteNom, valeurs, signataireNom: signataireNom.trim(), signataireEmail: signataireEmail.trim(), templateIds: retenus.map((m) => m.templateId) })
      onEnvoye(`Contrats envoyés à ${r.destinataire} (${r.documents} document${r.documents > 1 ? "s" : ""}). ${signataireNom.trim()} signe, puis STC signe.`)
    } catch (err) {
      setErreur(message(err))
    } finally {
      setOccupe(false)
    }
  }

  return (
    <Dialogue
      titre="Envoyer les contrats"
      description={`${fiche.entreprise || dossier?.raisonSociale || "Artisan"} · l'artisan signe, puis STC signe ; le PDF signé revient dans la fiche.`}
      onFermer={onFermer}
      largeur="max-w-2xl"
      pied={<><Bouton onClick={onFermer}>Annuler</Bouton><Bouton variante="plein" form="form-envoyer-contrats" type="submit" chargement={occupe} disabled={!pret}>Envoyer pour signature</Bouton></>}
    >
      {erreur ? <Bandeau role="alerte" className="mb-3" action={<Bouton taille="sm" variante="discret" onClick={() => setErreur("")}>Fermer</Bouton>}>{erreur}</Bandeau> : null}
      {pack === null ? <Chargement texte="Lecture du pack de contrats…" /> : pack.length === 0 ? (
        <p className="text-legende text-encre-2">Aucun contrat dans le pack. Va dans Recrutement › Réglages de la machine › Contrats à faire signer pour choisir les modèles DocuSign.</p>
      ) : (
        <form id="form-envoyer-contrats" onSubmit={envoyer} className="grid gap-4">
          <div>
            <h3 className="mb-1 text-colonne font-medium text-encre-2">Les contrats qui partent</h3>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {pack.map((m) => <Case key={m.templateId} texte={m.nom} checked={coches.includes(m.templateId)} onChange={(e) => setCoches((c) => (e.target.checked ? [...c, m.templateId] : c.filter((x) => x !== m.templateId)))} />)}
            </div>
            {retenus.length === 0 ? <p className="mt-1 text-colonne text-alerte">Coche au moins un contrat.</p> : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Etiquette texte="Qui signe pour l'artisan"><Champ value={signataireNom} onChange={(e) => setSignataireNom(e.target.value)} placeholder="Prénom Nom" required /></Etiquette>
            <Etiquette texte="Son e-mail (reçoit DocuSign)"><Champ type="email" value={signataireEmail} onChange={(e) => setSignataireEmail(e.target.value)} required /></Etiquette>
          </div>
          {champs.length ? (
            <>
              <h3 className="text-colonne font-medium text-encre-2">Les informations sur le contrat</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {champs.map((c) => (
                  <Etiquette key={c.label} texte={`${libelleChamp(c.label)}${c.requis ? " *" : ""}`}>
                    <Champ value={valeurs[c.label] ?? ""} onChange={(e) => setValeurs({ ...valeurs, [c.label]: e.target.value })} required={c.requis} />
                  </Etiquette>
                ))}
              </div>
              <p className="text-colonne text-encre-2">Préremplis depuis le dossier déposé et la fiche : vérifie, complète. Les champs marqués * sont exigés par le modèle.</p>
            </>
          ) : <p className="text-legende text-encre-2">Ces modèles n'ont aucun champ à remplir : seules les signatures seront demandées.</p>}
          {manquants.length ? <p className="text-colonne text-alerte">À compléter : {manquants.join(", ")}.</p> : null}
        </form>
      )}
    </Dialogue>
  )
}
