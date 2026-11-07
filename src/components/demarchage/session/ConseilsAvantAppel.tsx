// ── Avant d'appeler : 3 lignes de l'IA (maquette 07/11/2026) ──
// Mahdi : « des petits tips avant l'appel sur la fiche, 3 lignes ». D'après les appels précédents de
// l'agence ; jamais appelée, d'après le guide des réponses (ce qui a marché chez nous).
import { useEffect, useState } from "react"
import { conseilsAvantAppel } from "../../../demarchage/appelsIa"

export default function ConseilsAvantAppel({ agenceId, className = "" }: { agenceId: string; className?: string }) {
  const [c, setC] = useState<{ id: string; lignes: string[]; source: string } | null>(null)
  useEffect(() => {
    let annule = false
    conseilsAvantAppel(agenceId).then((r) => { if (!annule) setC({ id: agenceId, ...r }) }).catch(() => {})
    return () => { annule = true }
  }, [agenceId])
  if (!c || c.id !== agenceId || !c.lignes.length) return null
  return (
    <section className={"border-y-[0.5px] border-trait py-3 " + className}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-2 text-colonne font-medium text-encre"><span className="h-1.5 w-1.5 rounded-full bg-signature" />Avant d'appeler · ce que dit l'IA</span>
        <span className="text-colonne text-encre-2">{c.source}</span>
      </div>
      <ol className="space-y-1.5 text-legende text-encre">
        {c.lignes.map((l, i) => <li key={i} className="flex gap-3"><span className="chiffres w-3 shrink-0 text-encre-2">{i + 1}</span><span>{l}</span></li>)}
      </ol>
    </section>
  )
}
