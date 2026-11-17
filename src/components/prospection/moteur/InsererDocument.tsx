// « Insérer un document » (lot 3, 17/11/2026) : un PDF de la bibliothèque devient un lien dans le mail, suivi pour chaque
// agence. « Ajouter un PDF… » le dépose dans la bibliothèque et l'insère d'un coup.
import { useEffect, useRef, useState } from "react"
import { Selecteur } from "../../../ui"
import type { PieceJointe } from "../../../emails"
import { ajouterDocumentCampagne, chargerDocumentsCampagne } from "../../../lib/documentsCampagneDb"
import { lienDocument, nomLisible } from "../../../prospection/documentsCampagne"

const AJOUTER = "__ajouter__"

export default function InsererDocument({ onLien, onDocuments }: { onLien: (lien: string) => void; onDocuments?: (docs: PieceJointe[]) => void }) {
  const [docs, setDocs] = useState<PieceJointe[]>([])
  const [etat, setEtat] = useState("")
  const fichier = useRef<HTMLInputElement>(null)
  useEffect(() => { let vivant = true; chargerDocumentsCampagne().then((l) => { if (vivant) { setDocs(l); onDocuments?.(l) } }).catch(() => undefined); return () => { vivant = false } }, [onDocuments])
  const ajouter = async (f: File | undefined) => {
    if (!f) return
    setEtat("Dépôt du PDF…")
    try {
      const p = await ajouterDocumentCampagne(f)
      const l = [...docs, p]; setDocs(l); onDocuments?.(l)
      onLien(lienDocument(p)); setEtat(`« ${nomLisible(p.nom)} » ajouté à la bibliothèque et au mail.`)
    } catch (e) { setEtat(e instanceof Error ? e.message : "Dépôt impossible.") }
    if (fichier.current) fichier.current.value = ""
  }
  return (
    <span className="block w-full max-w-[420px] space-y-1">
      <Selecteur value="" aria-label="Insérer un document" onChange={(e) => { const v = e.target.value; if (v === AJOUTER) { fichier.current?.click(); return } const d = docs.find((x) => x.chemin === v); if (d) onLien(lienDocument(d)) }}>
        <option value="">Insérer un document (lien suivi)…</option>
        {docs.map((d) => <option key={d.chemin} value={d.chemin}>{nomLisible(d.nom)}</option>)}
        <option value={AJOUTER}>📎 Ajouter un PDF… (bibliothèque + ce mail)</option>
      </Selecteur>
      <input ref={fichier} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => void ajouter(e.target.files?.[0])} />
      {etat ? <span className="block text-colonne text-encre-2">{etat}</span> : null}
    </span>
  )
}
