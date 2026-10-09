import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, Check, Loader2, Paperclip, Send, Trash2, Users } from "lucide-react"
import type { Prospect } from "../data"
import { variables, type Email, type PieceJointe } from "../emails"
import { chargerEmails } from "../lib/emailsDb"
import { useSession } from "../lib/auth"
import { nomAffiche } from "../lib/comptes"
import { signatureStc, prenomDe } from "../lib/signatureStc"
import { televerser, supprimerFichier, formatTaille } from "../lib/stockage"
import { composer, envoyerEmail, emailConfigure } from "../lib/envoiEmail"
import { adressesInvalides, decouperAdresses, joindreAdresses } from "../lib/adressesEmail"
import { Bandeau, Bouton, Champ, Dialogue, Etiquette, Pastille, Selecteur, Zone } from "../ui"

// Envoi d'un e-mail à une agence (ou un contact), dans la trousse STC (09/10/2026).
//
// L'objet et le message sont ÉDITABLES ici : choisir un modèle ne fait que
// pré-remplir, le modèle enregistré n'est jamais modifié.
// Destinataires (Mahdi, 08-09/10) : « À » accepte plusieurs adresses séparées
// par une virgule ; « Cc » et « Cci » s'ouvrent d'un clic, comme dans Gmail.
// Un seul e-mail part, avec tout le monde dedans.
export default function EnvoyerEmailModal({ prospect, onClose }: { prospect: Prospect; onClose: () => void }) {
  const [emails, setEmails] = useState<Email[]>([])
  // Signature STC Bâtiment au nom du compte connecté : chacun signe de son nom.
  const session = useSession()
  const nomSignataire = nomAffiche(session)
  const signature = useMemo(() => signatureStc({ nom: nomSignataire }), [nomSignataire])
  const prenomCommercial = prenomDe(nomSignataire)
  const [modeleId, setModeleId] = useState("")
  const [aTexte, setATexte] = useState(() => joindreAdresses(decouperAdresses(prospect.email || "")))
  const [ccTexte, setCcTexte] = useState("")
  const [cciTexte, setCciTexte] = useState("")
  const [copiesOuvertes, setCopiesOuvertes] = useState(false)
  const [objet, setObjet] = useState("")
  const [corps, setCorps] = useState("")
  const [envoi, setEnvoi] = useState(false)
  const [fait, setFait] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [apercuOuvert, setApercuOuvert] = useState(false)
  // Pièces jointes de CET envoi : celles du modèle choisi + celles ajoutées ici.
  const [pieces, setPieces] = useState<PieceJointe[]>([])
  const [televersement, setTeleversement] = useState(false)
  const fichierRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let annule = false
    chargerEmails()
      .then((e) => {
        if (annule) return
        setEmails(e)
        // On pré-remplit avec le 1er modèle, tout en le laissant modifiable.
        if (e.length) {
          setModeleId(e[0].id ?? "")
          setObjet(e[0].objet)
          setCorps(e[0].corps)
          setPieces(e[0].pieces ?? [])
        }
      })
      .catch(() => {})
    return () => {
      annule = true
    }
  }, [])

  // Ce qui part réellement : le contenu affiché à l'écran, pas le modèle d'origine.
  const aEnvoyer = useMemo<Email>(() => ({ nom: nomPourJournal(emails, modeleId), objet, corps, ordre: 0, pieces }), [emails, modeleId, objet, corps, pieces])
  const apercu = useMemo(() => composer(aEnvoyer, prospect, signature, prenomCommercial), [aEnvoyer, prospect, signature, prenomCommercial])
  const a = useMemo(() => decouperAdresses(aTexte), [aTexte])
  const cc = useMemo(() => decouperAdresses(ccTexte), [ccTexte])
  const cci = useMemo(() => decouperAdresses(cciTexte), [cciTexte])
  const invalides = useMemo(() => adressesInvalides([...a, ...cc, ...cci]), [a, cc, cci])
  const nbPersonnes = a.length + cc.length + cci.length

  function choisirModele(id: string) {
    setModeleId(id)
    const m = emails.find((e) => e.id === id)
    if (m) {
      setObjet(m.objet)
      setCorps(m.corps)
      setPieces(m.pieces ?? [])
    } else {
      setObjet("")
      setCorps("")
      setPieces([])
    }
  }

  // Ajout d'un document à joindre : déposé dans le stockage, c'est son LIEN qui part.
  async function ajouterFichier(file: File) {
    setErreur(null)
    setTeleversement(true)
    try {
      const pj = await televerser(file)
      setPieces((l) => [...l, pj])
    } catch (e) {
      setErreur("Ajout du document impossible : " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setTeleversement(false)
      if (fichierRef.current) fichierRef.current.value = ""
    }
  }

  function retirerFichier(pj: PieceJointe) {
    setPieces((l) => l.filter((x) => x.chemin !== pj.chemin))
    // On ne supprime du stockage QUE les fichiers ajoutés pour cet envoi.
    const vientDuModele = emails.some((e) => (e.pieces ?? []).some((x) => x.chemin === pj.chemin))
    if (!vientDuModele) supprimerFichier(pj.chemin).catch(() => {})
  }

  const pret = a.length > 0 && invalides.length === 0 && objet.trim() !== "" && corps.trim() !== ""

  async function envoyer() {
    if (!pret || envoi) return
    setErreur(null)
    setEnvoi(true)
    try {
      await envoyerEmail(prospect, aEnvoyer, signature, prenomCommercial, a, { cc, cci })
      setFait(true)
      setTimeout(onClose, 900)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
      setEnvoi(false)
    }
  }

  const raisonBloque = a.length === 0 ? "Indique au moins une adresse dans « À »" : invalides.length ? "Une adresse est à corriger" : !objet.trim() || !corps.trim() ? "Renseigne l'objet et le message" : undefined

  return (
    <Dialogue
      titre="Envoyer un e-mail"
      description={<>Fiche <strong className="text-encre">{prospect.entreprise}</strong>{prospect.contact ? <> · {prospect.contact}</> : null}</>}
      onFermer={onClose}
      largeur="max-w-2xl"
      pied={
        <>
          {erreur ? <span className="mr-auto flex min-w-0 items-start gap-1.5 text-legende text-alerte"><AlertTriangle size={14} className="mt-0.5 shrink-0" /><span className="break-words">{erreur}</span></span> : null}
          <Bouton variante="discret" onClick={onClose}>Annuler</Bouton>
          <Bouton variante="plein" icone={fait ? <Check /> : envoi ? <Loader2 className="animate-spin" /> : <Send />} disabled={!pret || envoi || fait || !emailConfigure} title={raisonBloque} onClick={envoyer}>
            {fait ? (nbPersonnes > 1 ? `Envoyé à ${nbPersonnes} personnes` : "Envoyé") : envoi ? "Envoi…" : nbPersonnes > 1 ? `Envoyer à ${nbPersonnes} personnes` : "Envoyer"}
          </Bouton>
        </>
      }
    >
      <div className="space-y-4">
        {!emailConfigure ? <Bandeau role="attention">L'envoi n'est pas configuré (Supabase requis) : l'aperçu fonctionne, pas l'envoi.</Bandeau> : null}

        {/* ── Destinataires ── */}
        <div className="rounded-6 border border-trait">
          <label className="flex min-h-[38px] items-center gap-3 border-b border-fond-4 px-3">
            <span className="w-8 shrink-0 text-legende text-encre-2">À</span>
            <input value={aTexte} onChange={(e) => setATexte(e.target.value)} onBlur={() => setATexte(joindreAdresses(a))} placeholder="adresse@agence.fr, collegue@agence.fr" aria-label="Destinataires" className="h-9 min-w-0 flex-1 bg-transparent text-corps text-encre outline-none placeholder:text-encre-3" />
            {!copiesOuvertes ? <button type="button" onClick={() => setCopiesOuvertes(true)} className="shrink-0 text-legende text-encre-2 hover:text-encre">Cc · Cci</button> : null}
          </label>
          {copiesOuvertes ? (
            <>
              <label className="flex min-h-[38px] items-center gap-3 border-b border-fond-4 px-3">
                <span className="w-8 shrink-0 text-legende text-encre-2">Cc</span>
                <input value={ccTexte} onChange={(e) => setCcTexte(e.target.value)} onBlur={() => setCcTexte(joindreAdresses(cc))} placeholder="En copie, visible par tous" aria-label="Copie" autoFocus className="h-9 min-w-0 flex-1 bg-transparent text-corps text-encre outline-none placeholder:text-encre-3" />
              </label>
              <label className="flex min-h-[38px] items-center gap-3 px-3">
                <span className="w-8 shrink-0 text-legende text-encre-2">Cci</span>
                <input value={cciTexte} onChange={(e) => setCciTexte(e.target.value)} onBlur={() => setCciTexte(joindreAdresses(cci))} placeholder="En copie cachée, invisible des autres" aria-label="Copie cachée" className="h-9 min-w-0 flex-1 bg-transparent text-corps text-encre outline-none placeholder:text-encre-3" />
              </label>
            </>
          ) : null}
        </div>
        <p className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-colonne text-encre-2">
          <span className="inline-flex items-center gap-1"><Users size={12} /> Plusieurs adresses : sépare-les par une virgule.</span>
          {nbPersonnes > 1 && invalides.length === 0 ? <span>Un seul e-mail partira, à {nbPersonnes} personnes.</span> : null}
          {invalides.length ? <span className="text-alerte">À corriger : {invalides.join(", ")}</span> : null}
        </p>

        {/* ── Modèle, objet, message ── */}
        <Etiquette texte="Partir d'un modèle" aide="L'objet et le message restent modifiables : le modèle enregistré n'est pas touché.">
          <Selecteur value={modeleId} onChange={(e) => choisirModele(e.target.value)}>
            <option value="">Écrire un message (page blanche)</option>
            {emails.map((e) => (
              <option key={e.id} value={e.id}>{e.nom}</option>
            ))}
          </Selecteur>
        </Etiquette>
        <Etiquette texte="Objet">
          <Champ value={objet} onChange={(e) => setObjet(e.target.value)} placeholder="Ex. Suite à notre échange" />
        </Etiquette>
        <Etiquette texte="Message">
          <Zone value={corps} onChange={(e) => setCorps(e.target.value)} rows={8} placeholder={"Bonjour {{contact}},\n\n…"} className="resize-y" />
        </Etiquette>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-colonne text-encre-2">Insérer :</span>
          {variables.map((v) => (
            <button key={v.cle} type="button" onClick={() => setCorps((c) => (c ? c + v.cle : v.cle))} title={`Remplacé à l'envoi par : ${v.exemple}`} className="rounded-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signature">
              <Pastille role="info">{v.label}</Pastille>
            </button>
          ))}
        </div>

        {/* ── Pièces jointes ── */}
        <div>
          <div className="flex items-center justify-between">
            <span className="text-legende font-medium text-encre">Pièces jointes</span>
            <Bouton taille="sm" icone={televersement ? <Loader2 className="animate-spin" /> : <Paperclip />} disabled={televersement} onClick={() => fichierRef.current?.click()}>
              {televersement ? "Ajout…" : "Ajouter un document"}
            </Bouton>
          </div>
          <input ref={fichierRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) ajouterFichier(f) }} />
          {pieces.length ? (
            <ul className="mt-2 divide-y divide-fond-4 rounded-4 border border-trait">
              {pieces.map((pj) => (
                <li key={pj.chemin} className="flex items-center gap-2 px-3 py-1.5">
                  <Paperclip size={13} className="shrink-0 text-encre-3" />
                  <span className="min-w-0 flex-1 truncate text-legende text-encre">{pj.nom}</span>
                  <span className="shrink-0 text-colonne text-encre-2">{formatTaille(pj.taille)}</span>
                  <Bouton variante="discret" taille="icone" aria-label="Retirer" title="Retirer" icone={<Trash2 />} onClick={() => retirerFichier(pj)} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-colonne text-encre-2">Aucun document joint.</p>
          )}
          {pieces.length ? <p className="mt-1 text-colonne text-encre-2">Les documents partent sous forme de liens cliquables en bas du message.</p> : null}
        </div>

        {/* ── Aperçu ── */}
        <div className="rounded-6 border border-trait">
          <button type="button" onClick={() => setApercuOuvert((v) => !v)} className="flex w-full items-center justify-between px-4 py-2.5 text-left text-legende font-medium text-encre hover:bg-fond-2">
            Aperçu, tel qu'il sera reçu (signature comprise)
            <span className="text-encre-3">{apercuOuvert ? "Replier" : "Voir"}</span>
          </button>
          {apercuOuvert ? (
            <div className="border-t border-trait bg-fond-2 px-4 py-3">
              <p className="border-b border-trait pb-2 text-corps font-medium text-encre">{apercu.objet || "(objet)"}</p>
              <div className="signature-edit mt-2 text-corps text-encre-2" dangerouslySetInnerHTML={{ __html: apercu.corpsHtml }} />
            </div>
          ) : null}
        </div>
      </div>
    </Dialogue>
  )
}

// Nom retenu dans l'historique des envois : celui du modèle si on en est parti.
function nomPourJournal(emails: Email[], modeleId: string): string {
  return emails.find((e) => e.id === modeleId)?.nom ?? "Message personnalisé"
}
