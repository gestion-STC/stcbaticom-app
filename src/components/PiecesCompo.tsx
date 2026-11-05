import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Paperclip, X } from "lucide-react"
import type { Email, PieceJointe } from "../emails"
import { chargerEmails } from "../lib/emailsDb"
import { piecesTropLourdes } from "../lib/envoiEmail"
import { basculerDocument, bibliothequeDocuments, estJoint } from "../lib/documentsBibliotheque"
import { formatTaille, supprimerFichier, televerser } from "../lib/stockage"
import { Bouton, Pastille } from "../ui"

/**
 * Les pièces jointes d'une réponse, d'un transfert ou d'un nouveau message de la boîte de réception
 * (Mahdi, 05/11/2026 : « quand je fais répondre, je ne peux pas mettre de pièce jointe »).
 * Plusieurs fichiers d'un coup, plus les documents du logiciel (Kbis, attestation…) d'un clic.
 * Tout part en vraies pièces jointes.
 */
export default function PiecesCompo({ pieces, onChange }: { pieces: PieceJointe[]; onChange: (f: (l: PieceJointe[]) => PieceJointe[]) => void }) {
  const [emails, setEmails] = useState<Email[]>([])
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState("")
  const fichierRef = useRef<HTMLInputElement>(null)
  useEffect(() => { chargerEmails().then(setEmails).catch(() => {}) }, [])
  const bibliotheque = useMemo(() => bibliothequeDocuments(emails), [emails])

  async function ajouter(files: File[]) {
    setErreur("")
    setEnvoi(true)
    try {
      for (const f of files) {
        const pj = await televerser(f)
        onChange((l) => [...l, pj])
      }
    } catch (e) {
      setErreur("Ajout impossible : " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setEnvoi(false)
      if (fichierRef.current) fichierRef.current.value = ""
    }
  }

  function retirer(pj: PieceJointe) {
    onChange((l) => l.filter((x) => x.chemin !== pj.chemin))
    // On ne supprime du stockage QUE les fichiers ajoutés pour cet envoi, jamais un document du logiciel.
    if (!bibliotheque.some((d) => d.chemin === pj.chemin)) supprimerFichier(pj.chemin).catch(() => {})
  }

  return (
    <div className="space-y-2 border-t border-fond-4 px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Bouton taille="sm" icone={envoi ? <Loader2 className="animate-spin" /> : <Paperclip />} disabled={envoi} onClick={() => fichierRef.current?.click()}>
          {envoi ? "Ajout…" : "Joindre"}
        </Bouton>
        <input ref={fichierRef} type="file" multiple className="hidden" aria-label="Fichiers à joindre" onChange={(e) => { const f = [...(e.target.files ?? [])]; if (f.length) ajouter(f) }} />
        {bibliotheque.map((doc) => {
          const joint = estJoint(doc, pieces)
          return (
            <button key={doc.chemin} type="button" aria-pressed={joint} title={joint ? "Retirer de ce message" : "Joindre à ce message"} onClick={() => onChange((l) => basculerDocument(doc, l))} className="rounded-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signature">
              <Pastille role={joint ? "info" : "inerte"} point={joint}>{doc.nom.replace(/\.pdf$/i, "")}</Pastille>
            </button>
          )
        })}
      </div>
      {pieces.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {pieces.map((pj) => (
            <li key={pj.chemin} className="flex items-center gap-1.5 rounded-4 border border-trait px-2 py-1 text-legende text-encre">
              <Paperclip size={12} className="shrink-0 text-encre-3" />
              <span className="max-w-[220px] truncate">{pj.nom}</span>
              {pj.taille ? <span className="text-colonne text-encre-2">{formatTaille(pj.taille)}</span> : null}
              <button type="button" onClick={() => retirer(pj)} aria-label={`Retirer ${pj.nom}`} title="Retirer" className="rounded-3 p-0.5 text-encre-3 hover:text-encre">
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {piecesTropLourdes(pieces) ? <p className="text-colonne text-alerte">Trop lourd : 35 Mo au total au maximum.</p> : null}
      {erreur ? <p className="text-colonne text-alerte">{erreur}</p> : null}
    </div>
  )
}
