// Le formulaire rempli AU TÉLÉPHONE (09/11/2026) : sur la fiche d'un lead ou dans la session de call. Les réponses
// valident l'étape du parcours et comptent pour la qualité du lead.
import { useState } from "react"
import { Check } from "lucide-react"
import { Bandeau, Bouton } from "../../../ui"
import type { Creatif } from "../../../prospection/configCampagne"
import { enregistrerReponses } from "../../../lib/leadsRecusDb"
import ChampQuestion from "./ChampQuestion"

export default function FormulaireAppel({ campagneId, contactRef, formulaire, reponses, parNom, onEnregistre }: { campagneId: string; contactRef: string; formulaire: Creatif; reponses: Record<string, string> | null; parNom: string; onEnregistre: () => void }) {
  const [valeurs, setValeurs] = useState<Record<string, string>>(reponses ?? {})
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState("")
  const [ok, setOk] = useState(false)
  const manque = formulaire.questions.find((q) => q.requis && !(valeurs[q.id] ?? "").trim())
  const enregistrer = () => {
    setOccupe(true); setErreur(""); setOk(false)
    enregistrerReponses(campagneId, formulaire.id, contactRef, valeurs, parNom)
      .then(() => { setOk(true); onEnregistre() })
      .catch((e) => setErreur(e instanceof Error ? e.message : String(e)))
      .finally(() => setOccupe(false))
  }
  return (
    <div className="space-y-3">
      {formulaire.questions.map((q) => <ChampQuestion key={q.id} q={q} valeur={valeurs[q.id] ?? ""} onChange={(v) => setValeurs((x) => ({ ...x, [q.id]: v }))} />)}
      {erreur ? <Bandeau role="alerte">{erreur}</Bandeau> : null}
      <div className="flex items-center gap-3"><Bouton variante="plein" taille="sm" icone={<Check />} chargement={occupe} disabled={Boolean(manque)} title={manque ? `À remplir : ${manque.libelle}` : undefined} onClick={enregistrer}>{reponses ? "Mettre à jour" : "Enregistrer le formulaire"}</Bouton>{ok ? <span className="text-colonne text-ok">Enregistré</span> : null}</div>
    </div>
  )
}
