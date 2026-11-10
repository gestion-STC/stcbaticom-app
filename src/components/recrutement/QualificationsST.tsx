// Sous-traitants › Qualification : tous les sous-traitants dont la qualification a commencé, et où elle en est.
import { useCallback, useEffect, useMemo, useState } from "react"
import { Bandeau, Chargement, EnTetePage, Onglets, Pastille, Tableau, Td, Th, Tr, Vide } from "../../ui"
import { avancement, moyenneAvis, type DecisionST } from "../../recrutement/qualificationST"
import { chargerQualifications, useQuestionnaire, type LigneQualification } from "../../lib/qualificationStDb"
import FicheArtisan from "./FicheArtisan"

type Filtre = "toutes" | "en_cours" | DecisionST
const FILTRES: { id: Filtre; label: string }[] = [{ id: "toutes", label: "Toutes" }, { id: "en_cours", label: "En cours" }, { id: "Accepté", label: "Acceptés" }, { id: "En attente", label: "En attente" }, { id: "Refusé", label: "Refusés" }]
const date = (iso: string) => new Date(iso).toLocaleDateString("fr-FR")

export default function QualificationsST() {
  const sections = useQuestionnaire()
  const [lignes, setLignes] = useState<LigneQualification[] | null>(null)
  const [erreur, setErreur] = useState("")
  const [filtre, setFiltre] = useState<Filtre>("toutes")
  const [fiche, setFiche] = useState<string | null>(null)
  const charger = useCallback(() => { chargerQualifications().then((l) => { setLignes(l); setErreur("") }).catch((e) => setErreur(e instanceof Error ? e.message : String(e))) }, [])
  useEffect(() => { const t = setTimeout(charger, 0); return () => clearTimeout(t) }, [charger])
  const visibles = useMemo(() => (lignes ?? []).filter((l) => filtre === "toutes" || (filtre === "en_cours" ? !l.decision : l.decision === filtre)), [lignes, filtre])
  return (
    <div className="page">
      <EnTetePage titre="Qualification" sousTitre="Les sous-traitants en cours de qualification, et la décision prise." />
      {erreur ? <Bandeau role="alerte" className="mb-4">{erreur}</Bandeau> : null}
      <Onglets valeur={filtre} onChange={setFiltre} options={FILTRES} className="mb-4" />
      {!lignes && !erreur ? <Chargement /> : null}
      {lignes && !visibles.length ? <Vide titre="Personne ici" texte="Une qualification commence pendant l'appel, ou depuis la fiche du sous-traitant." /> : null}
      {visibles.length ? (
        <Tableau>
          <thead><tr><Th>Sous-traitant</Th><Th>Métier</Th><Th>Avancement</Th><Th>Avis</Th><Th>Décision</Th><Th>Mis à jour</Th></tr></thead>
          <tbody>
            {visibles.map((l) => {
              const a = avancement(l.reponses, sections), m = moyenneAvis(l.reponses, sections)
              return (
                <Tr key={l.id} onClick={() => setFiche(l.id)} className="cursor-pointer">
                  <Td><span className="font-medium text-encre">{l.entreprise || l.contact || "Sans nom"}</span></Td>
                  <Td>{l.metier || "—"}</Td>
                  <Td><span className="chiffres">{a.fait} / {a.total}</span></Td>
                  <Td><span className="chiffres">{m === null ? "—" : `${m.toLocaleString("fr-FR")} / 5`}</span></Td>
                  <Td>{l.decision ? <Pastille role={l.decision === "Accepté" ? "actif" : l.decision === "Refusé" ? "probleme" : "attente"} point>{l.decision}</Pastille> : <Pastille point>En cours</Pastille>}</Td>
                  <Td><span className="chiffres">{date(l.majLe)}</span></Td>
                </Tr>
              )
            })}
          </tbody>
        </Tableau>
      ) : null}
      {fiche ? <FicheArtisan id={fiche} onFermer={() => setFiche(null)} onChange={charger} /> : null}
    </div>
  )
}
