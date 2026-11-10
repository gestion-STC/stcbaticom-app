// « Relecture : chaque mail » : les textes écrits par l'IA attendent ici. Rien ne part avant d'être validé.
import { useEffect, useState } from "react"
import { Check } from "lucide-react"
import { Bandeau, Bouton, Zone } from "../../../ui"
import { Bloc } from "../../demarchage/aujourdhui/courtier"
import { chargerTextesARelire, validerTexteIA } from "../../../lib/campagnesIa"

type Ligne = { id: string; contactRef: string; texte: string }

export default function TextesARelire({ campagneId, nomDe }: { campagneId: string; nomDe: (id: string) => string }) {
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [erreur, setErreur] = useState("")
  const [occupe, setOccupe] = useState("")
  useEffect(() => { let vivant = true; chargerTextesARelire(campagneId).then((l) => { if (vivant) setLignes(l) }).catch((e) => { if (vivant) setErreur(e instanceof Error ? e.message : String(e)) }); return () => { vivant = false } }, [campagneId])
  if (!lignes.length && !erreur) return null
  const valider = async (l: Ligne) => { setOccupe(l.id); setErreur(""); try { await validerTexteIA(l.id, l.texte); setLignes((x) => x.filter((y) => y.id !== l.id)) } catch (e) { setErreur(e instanceof Error ? e.message : String(e)) } finally { setOccupe("") } }
  const toutValider = async () => { setOccupe("tout"); setErreur(""); try { for (const l of lignes) await validerTexteIA(l.id, l.texte); setLignes([]) } catch (e) { setErreur(e instanceof Error ? e.message : String(e)) } finally { setOccupe("") } }
  return (
    <Bloc titre="Textes à relire avant l'envoi" compte={lignes.length} droite={<Bouton taille="sm" chargement={occupe === "tout"} onClick={() => void toutValider()}>Tout valider</Bouton>}>
      {erreur ? <Bandeau role="alerte" className="mt-3">{erreur}</Bandeau> : null}
      <ul className="mt-2 divide-y-[0.5px] divide-trait">{lignes.map((l) => <li key={l.id} className="grid gap-2 py-3 sm:grid-cols-[170px_minmax(0,1fr)_auto]"><p className="truncate text-legende font-medium">{nomDe(l.contactRef)}</p><Zone rows={2} aria-label={`Texte pour ${nomDe(l.contactRef)}`} value={l.texte} onChange={(e) => setLignes((x) => x.map((y) => (y.id === l.id ? { ...y, texte: e.target.value } : y)))} /><Bouton taille="icone" variante="discret" icone={<Check />} aria-label="Valider" chargement={occupe === l.id} onClick={() => void valider(l)} /></li>)}</ul>
    </Bloc>
  )
}
