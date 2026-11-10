// Insérer un avis validé dans un mail ou une page de campagne, tel qu'il a été donné, avec sa date.
import { useEffect, useState } from "react"
import { Selecteur } from "../../../ui"
import { NOM_PUBLIC, chargerAvis, type Avis } from "../../../lib/avisDb"
import { citationAvis } from "../../../prospection/avis"

export default function InsererAvis({ onAvis }: { onAvis: (citation: string) => void }) {
  const [avis, setAvis] = useState<Avis[]>([])
  useEffect(() => { let vivant = true; chargerAvis().then((l) => { if (vivant) setAvis(l.filter((a) => a.statut === "publie" && a.autorise)) }).catch(() => undefined); return () => { vivant = false } }, [])
  if (!avis.length) return null
  return (
    <span className="block w-full max-w-[420px]">
      <Selecteur value="" aria-label="Insérer un avis" onChange={(e) => { const a = avis.find((x) => x.id === e.target.value); if (a) onAvis(citationAvis(a)) }}>
        <option value="">Insérer un avis…</option>
        {avis.map((a) => <option key={a.id} value={a.id}>{a.note}/5 · {NOM_PUBLIC[a.public] ?? a.public} · {a.commentaire.slice(0, 50)}</option>)}
      </Selecteur>
    </span>
  )
}
