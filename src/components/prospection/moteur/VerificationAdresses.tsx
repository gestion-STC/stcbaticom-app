// Les adresses de la cible, vérifiées avant l'envoi (Mahdi, 11/11/2026). Chaque adresse est vérifiée juste avant son premier
// mail ; ce bouton permet de le faire tout de suite, par exemple après un import.
import { useEffect, useMemo, useState } from "react"
import { ShieldCheck } from "lucide-react"
import { Bouton } from "../../../ui"
import { chargerVerdicts, verifierMaintenant, type Verdict } from "../../../lib/verificationsDb"

const MAX_PAR_CLIC = 500

export default function VerificationAdresses({ emails }: { emails: string[] }) {
  const liste = useMemo(() => [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))], [emails])
  const [verdicts, setVerdicts] = useState<Map<string, Verdict>>(new Map())
  const [progres, setProgres] = useState("")
  const [erreur, setErreur] = useState("")
  const [voir, setVoir] = useState(false)
  useEffect(() => { let vivant = true; chargerVerdicts(liste).then((v) => { if (vivant) setVerdicts(v) }).catch(() => undefined); return () => { vivant = false } }, [liste])
  const compte = (s: Verdict["statut"]) => [...verdicts.values()].filter((v) => v.statut === s && liste.includes(v.email)).length
  const restantes = liste.filter((e) => !verdicts.has(e) || verdicts.get(e)?.statut === "attente")
  const refusees = [...verdicts.values()].filter((v) => v.statut === "invalide" && liste.includes(v.email))
  const verifier = async () => {
    setErreur("")
    const aFaire = restantes.slice(0, MAX_PAR_CLIC)
    const suite = new Map(verdicts)
    try {
      for (let i = 0; i < aFaire.length; i += 25) {
        setProgres(`${i} / ${aFaire.length}`)
        for (const v of await verifierMaintenant(aFaire.slice(i, i + 25))) suite.set(v.email, v)
        setVerdicts(new Map(suite))
      }
    } catch (e) { setErreur(e instanceof Error ? e.message : String(e)) } finally { setProgres("") }
  }
  if (!liste.length) return null
  return (
    <div className="space-y-2 rounded-4 border-[0.5px] border-trait p-3">
      <div className="flex items-center gap-2"><ShieldCheck size={14} className="shrink-0 text-encre-2" /><b className="text-legende font-medium">Adresses vérifiées</b></div>
      <p className="text-colonne text-encre-2">Chaque adresse est vérifiée juste avant son premier mail. Une adresse refusée ne part jamais.</p>
      <ul className="space-y-0.5 text-colonne">
        <li className="flex justify-between"><span>Valides</span><span className="chiffres">{compte("valide")}</span></li>
        <li className="flex justify-between"><span title="Le domaine accepte toutes les adresses : impossible de savoir. Elles partent.">Douteuses</span><span className="chiffres">{compte("douteux")}</span></li>
        <li className="flex justify-between"><span>Refusées</span><span className={`chiffres ${refusees.length ? "text-alerte" : ""}`}>{refusees.length}</span></li>
        <li className="flex justify-between text-encre-2"><span>Pas encore vérifiées</span><span className="chiffres">{restantes.length}</span></li>
      </ul>
      {erreur ? <p className="text-colonne text-alerte">{erreur}</p> : null}
      <div className="flex flex-wrap gap-2">
        {restantes.length ? <Bouton taille="sm" chargement={Boolean(progres)} onClick={() => void verifier()}>{progres ? `Vérification ${progres}` : `Vérifier maintenant${restantes.length > MAX_PAR_CLIC ? ` (${MAX_PAR_CLIC})` : ""}`}</Bouton> : null}
        {refusees.length ? <Bouton taille="sm" variante="discret" onClick={() => setVoir((x) => !x)}>{voir ? "Masquer les refusées" : "Voir les refusées"}</Bouton> : null}
      </div>
      {voir ? <ul className="max-h-48 space-y-1 overflow-y-auto text-colonne">{refusees.map((v) => <li key={v.email} className="min-w-0"><span className="block truncate">{v.email}</span><span className="block text-encre-2">{v.motif}</span></li>)}</ul> : null}
    </div>
  )
}
