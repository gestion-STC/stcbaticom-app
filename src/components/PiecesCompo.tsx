import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Paperclip, X } from "lucide-react"
import type { Email, PieceJointe } from "../emails"
import { chargerEmails } from "../lib/emailsDb"
import { piecesTropLourdes } from "../lib/envoiEmail"
import { basculerDocument, bibliothequeDocuments, estJoint } from "../lib/documentsBibliotheque"
import { formatTaille, supprimerFichier, televerser } from "../lib/stockage"
import { PETITE, PILULE_CLAIRE } from "./agenda/dessinBureau"

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

  // Le dessin de STC Bâtiment (11/11/2026) : « Joindre » en pilule claire, les documents du logiciel en
  // petites pilules (pleines = jointes), les fichiers ajoutés en pastilles rondes avec leur croix.
  return (
    <div className="space-y-2 py-2 text-[13px]">
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={`${PILULE_CLAIRE} ${PETITE}`} disabled={envoi} onClick={() => fichierRef.current?.click()} title="Joindre des fichiers">
          {envoi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-[13px] w-[13px]" strokeWidth={1.7} />}
          {envoi ? "Ajout…" : "Joindre"}
        </button>
        <input ref={fichierRef} type="file" multiple className="hidden" aria-label="Fichiers à joindre" onChange={(e) => { const f = [...(e.target.files ?? [])]; if (f.length) ajouter(f) }} />
        {bibliotheque.map((doc) => {
          const joint = estJoint(doc, pieces)
          return (
            <button key={doc.chemin} type="button" aria-pressed={joint} title={joint ? "Retirer de ce message" : "Joindre à ce message"} onClick={() => onChange((l) => basculerDocument(doc, l))}
              className={`inline-flex h-6 max-w-[220px] items-center rounded-full border-[0.5px] px-[9px] text-[11px] ${joint ? "border-[#111113] bg-[#111113] text-white" : "border-[#E4E4E7] bg-white text-[#111113] hover:bg-[#FAFAFB]"}`}>
              <span className="truncate">{doc.nom.replace(/\.pdf$/i, "")}</span>
            </button>
          )
        })}
      </div>
      {pieces.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {pieces.map((pj) => (
            <li key={pj.chemin} className="inline-flex max-w-[260px] items-center gap-1.5 rounded-full border-[0.5px] border-[#E4E4E7] bg-white py-0.5 pl-2.5 pr-1 text-[11px]">
              <Paperclip className="h-3 w-3 shrink-0 text-[#8E8E93]" strokeWidth={1.7} />
              <span className="truncate" title={pj.nom}>{pj.nom}</span>
              {pj.taille ? <span className="shrink-0 text-[#8E8E93]">({formatTaille(pj.taille)})</span> : null}
              <button type="button" onClick={() => retirer(pj)} aria-label={`Retirer ${pj.nom}`} title="Retirer" className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[#6B6B70] hover:bg-[#F2F2F4] hover:text-[#C9302C]">
                <X className="h-3 w-3" strokeWidth={1.8} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {piecesTropLourdes(pieces) ? <p className="text-[11px] text-[#C9302C]">Trop lourd : 35 Mo au total au maximum.</p> : null}
      {erreur ? <p className="text-[11px] text-[#C9302C]">{erreur}</p> : null}
    </div>
  )
}
