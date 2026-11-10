// L'onglet Mesure d'une campagne d'avis : ce qu'elle a récolté.
import { useEffect, useMemo, useState } from "react"
import { Bandeau } from "../../../ui"
import { Bloc } from "../../demarchage/aujourdhui/courtier"
import { chargerAvis, type Avis } from "../../../lib/avisDb"
import type { Envoi, Inscription } from "../../../prospection/modele"

export default function MesureAvis({ campagneId, inscriptions, envois }: { campagneId: string; inscriptions: Inscription[]; envois: Envoi[] }) {
  const [avis, setAvis] = useState<Avis[]>([])
  const [erreur, setErreur] = useState("")
  useEffect(() => { let vivant = true; chargerAvis().then((l) => { if (vivant) setAvis(l.filter((a) => a.campagneId === campagneId)) }).catch((e) => { if (vivant) setErreur(e instanceof Error ? e.message : String(e)) }); return () => { vivant = false } }, [campagneId])
  const lignes = useMemo(() => {
    const touches = new Set(envois.filter((e) => e.campagneId === campagneId && e.statut === "envoye").map((e) => e.contactId)).size
    const moyenne = avis.length ? (Math.round((avis.reduce((s, a) => s + a.note, 0) / avis.length) * 10) / 10).toLocaleString("fr-FR") : "—"
    return [
      ["Contacts dans la campagne", String(inscriptions.filter((i) => i.campagneId === campagneId).length)],
      ["Touchés", String(touches)],
      ["Avis reçus", `${avis.length}${touches ? ` (${Math.round((avis.length / touches) * 100)} %)` : ""}`],
      ["Note moyenne", moyenne],
      ["Réutilisation autorisée", String(avis.filter((a) => a.autorise).length)],
      ["Validés", String(avis.filter((a) => a.statut === "publie").length)],
    ]
  }, [avis, envois, inscriptions, campagneId])
  return (
    <div className="space-y-4">
      {erreur ? <Bandeau role="alerte">{erreur}</Bandeau> : null}
      <Bloc titre="Ce que la campagne a récolté"><ol className="mt-3 divide-y-[0.5px] divide-trait">{lignes.map(([l, v]) => <li key={l} className="flex items-center justify-between py-2 text-legende"><span>{l}</span><span className="chiffres font-medium text-encre">{v}</span></li>)}</ol></Bloc>
    </div>
  )
}
