// Choisir des fichiers : dans l'audience d'une campagne, et comme file d'appel en session de call.
import { useEffect, useState } from "react"
import { Ban } from "lucide-react"
import { Bouton, Selecteur } from "../../../ui"
import { chargerFichiers, useFichiersEnSession, type Fichier } from "../../../lib/fichiersDb"
import type { Espace } from "../../../lib/messagesDb"

/** Dans l'audience : un ou plusieurs fichiers. Sans choix, toute la base est ciblée. */
export function ChoixFichiers({ baseId, valeurs, onChange }: { baseId: string; valeurs: string[]; onChange: (v: string[]) => void }) {
  const [fichiers, setFichiers] = useState<Fichier[]>([])
  useEffect(() => { let vivant = true; chargerFichiers().then((l) => { if (vivant) setFichiers(l.filter((f) => f.baseId === baseId)) }).catch(() => undefined); return () => { vivant = false } }, [baseId])
  if (!fichiers.length) return null
  const total = fichiers.filter((f) => valeurs.includes(f.id)).reduce((s, f) => s + f.mails, 0)
  return (
    <div className="space-y-1.5">
      <p className="text-colonne text-encre-2">Dans quels fichiers ?</p>
      <div className="flex flex-wrap gap-1.5"><button type="button" aria-pressed={!valeurs.length} onClick={() => onChange([])} className={`h-7 rounded-full px-3 text-colonne ${!valeurs.length ? "bg-action text-white" : "border-[0.5px] border-trait text-encre hover:bg-fond-2"}`}>Toute la base</button>{fichiers.map((f) => { const on = valeurs.includes(f.id); return <button key={f.id} type="button" aria-pressed={on} onClick={() => onChange(on ? valeurs.filter((x) => x !== f.id) : [...valeurs, f.id])} className={`h-7 rounded-full px-3 text-colonne ${on ? "bg-action text-white" : "border-[0.5px] border-trait text-encre hover:bg-fond-2"}`}>{f.nom} · {f.mails.toLocaleString("fr-FR")}</button> })}</div>
      {valeurs.length ? <p className="text-colonne text-encre-2">{total.toLocaleString("fr-FR")} contacts avec un mail dans ces fichiers.</p> : null}
    </div>
  )
}

/** En session de call : appeler un fichier plutôt que la file habituelle. */
export function ChoixFichierSession({ espace, moiId, admin, valeur, onChange }: { espace: Espace; moiId: string; admin: boolean; valeur: string; onChange: (id: string) => void }) {
  const fichiers = useFichiersEnSession(espace, moiId, admin)
  if (!fichiers.length) return null
  return <Selecteur className="w-[260px]" value={valeur} aria-label="Fichier à appeler" onChange={(e) => onChange(e.target.value)}><option value="">File habituelle</option>{fichiers.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}</Selecteur>
}

/** Le bouton « Ne plus contacter » : deux clics, car c'est définitif. */
export function BoutonNePlusContacter({ action, onFait }: { action: () => Promise<void>; onFait: () => void }) {
  const [confirmer, setConfirmer] = useState(false)
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState("")
  const agir = () => { setOccupe(true); setErreur(""); action().then(onFait).catch((e) => setErreur(e instanceof Error ? e.message : String(e))).finally(() => { setOccupe(false); setConfirmer(false) }) }
  return <span className="inline-flex flex-wrap items-center gap-2">{confirmer ? <><Bouton taille="sm" variante="danger" chargement={occupe} onClick={agir}>Confirmer : plus aucun mail, SMS ni appel</Bouton><Bouton taille="sm" variante="discret" onClick={() => setConfirmer(false)}>Annuler</Bouton></> : <Bouton taille="sm" variante="discret" icone={<Ban />} onClick={() => setConfirmer(true)}>Ne plus contacter</Bouton>}{erreur ? <span className="text-colonne text-alerte">{erreur}</span> : null}</span>
}
