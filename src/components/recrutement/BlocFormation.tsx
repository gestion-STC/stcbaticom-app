// Dans la qualification : où en est la formation de ce sous-traitant.
import { useState } from "react"
import { Copy, Send } from "lucide-react"
import { Bouton, Champ, Pastille } from "../../ui"
import { accorderDerogation, envoyerLienFormation, preparerLien, type Formation } from "../../lib/formationDb"
import { LIBELLE_ETAT, type ReglesFormation } from "../../recrutement/formationST"

export default function BlocFormation({ id, formation, regles, parNom, admin, recharger }: { id: string; formation: Formation | null; regles: ReglesFormation; parNom: string; admin: boolean; recharger: () => Promise<void> }) {
  const [occupe, setOccupe] = useState(false)
  const [info, setInfo] = useState("")
  const [erreur, setErreur] = useState("")
  const [motif, setMotif] = useState("")
  const [ouvert, setOuvert] = useState(false)
  const agir = async (f: () => Promise<string>) => { setOccupe(true); setErreur(""); setInfo(""); try { setInfo(await f()); await recharger() } catch (e) { setErreur(e instanceof Error ? e.message : String(e)) } finally { setOccupe(false) } }
  const etat = formation?.etat ?? "a_envoyer"
  const dernier = formation?.journal.at(-1)
  return (
    <div className="space-y-2 border-t-[0.5px] border-trait pt-4">
      <div className="flex flex-wrap items-center gap-2"><p className="text-legende font-medium text-encre">Formation</p><Pastille role={etat === "reussi" ? "fait" : etat === "a_refaire" ? "probleme" : etat === "en_cours" ? "attente" : "inerte"} point>{LIBELLE_ETAT[etat]}{formation?.score != null ? ` · ${formation.score} %` : ""}</Pastille>{formation ? <span className="chiffres text-colonne text-encre-2">{formation.essais} / {regles.essais} essais · {formation.vues} questions vues</span> : null}</div>
      {dernier?.ratees.length ? <div className="text-colonne text-encre-2"><p>Questions ratées au dernier essai :</p><ul className="mt-1 list-disc space-y-0.5 pl-4">{dernier.ratees.slice(0, 8).map((q) => <li key={q}>{q}</li>)}</ul></div> : null}
      {formation?.derogationLe ? <p className="text-colonne text-attention">Dérogation accordée par {formation.derogationPar || "un administrateur"} : {formation.derogationMotif}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Bouton taille="sm" icone={<Send />} chargement={occupe} onClick={() => void agir(async () => `Lien envoyé à ${await envoyerLienFormation(id)}.`)}>{formation?.lienEnvoyeLe ? "Renvoyer le lien" : "Envoyer le lien"}</Bouton>
        <Bouton taille="sm" variante="discret" icone={<Copy />} onClick={() => void agir(async () => { await navigator.clipboard.writeText(await preparerLien(id)); return "Lien copié." })}>Copier le lien</Bouton>
        {admin && regles.bloque && regles.derogation && etat !== "reussi" && !formation?.derogationLe ? <Bouton taille="sm" variante="discret" onClick={() => setOuvert((x) => !x)}>Accorder une dérogation</Bouton> : null}
      </div>
      {ouvert ? <div className="flex flex-wrap gap-2"><span className="min-w-[220px] flex-1"><Champ value={motif} placeholder="Motif de la dérogation" aria-label="Motif de la dérogation" onChange={(e) => setMotif(e.target.value)} /></span><Bouton taille="sm" disabled={!motif.trim()} chargement={occupe} onClick={() => void agir(async () => { await accorderDerogation(id, motif.trim(), parNom); setOuvert(false); return "Dérogation enregistrée." })}>Confirmer</Bouton></div> : null}
      {info ? <p className="text-colonne text-ok">{info}</p> : null}
      {erreur ? <p className="text-colonne text-alerte">{erreur}</p> : null}
    </div>
  )
}
