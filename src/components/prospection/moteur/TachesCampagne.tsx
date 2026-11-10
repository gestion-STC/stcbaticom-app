// Les tâches Appel et LinkedIn des campagnes : la liste de l'Agenda, et le rappel sur la fiche en session de call.
// Rien à faire : rien ne s'affiche.
import { useCallback, useEffect, useState } from "react"
import { Check, ExternalLink, Phone } from "lucide-react"
import { Bandeau, Bouton } from "../../../ui"
import { Bloc } from "../../demarchage/aujourdhui/courtier"
import { chargerTachesCampagne, rechercheLinkedin, terminerTacheCampagne, type TacheCampagne } from "../../../lib/tachesCampagne"
import { tacheCampagnePourMoi } from "../../../lib/perimetre"
import type { Espace } from "../../../lib/messagesDb"

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const LIBELLE = { appel: "Appel", linkedin: "LinkedIn" } as const

function Ligne({ t, occupe, onFait, ouvrir }: { t: TacheCampagne; occupe: boolean; onFait: () => void; ouvrir?: () => void }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-legende text-encre"><b className="font-medium">{LIBELLE[t.type]}</b> · {t.nom || "Sans nom"}{t.personne ? ` · ${t.personne}` : ""}</p>
        <p className="mt-0.5 text-colonne text-encre-2">{[t.consigne, t.campagneNom, t.type === "appel" ? `${t.appelStandard ? "Standard : " : ""}${t.telephone}` : ""].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {t.type === "linkedin" ? <a className="inline-flex h-8 items-center gap-1.5 rounded-4 px-2 text-legende text-encre hover:bg-fond-2" href={rechercheLinkedin(t)} target="_blank" rel="noreferrer"><ExternalLink size={14} />Chercher sur LinkedIn</a> : null}
        {ouvrir && t.type === "appel" ? <Bouton taille="sm" icone={<Phone />} onClick={ouvrir}>Appeler</Bouton> : null}
        <Bouton taille="sm" variante="plein" icone={<Check />} disabled={occupe} onClick={onFait}>Fait</Bouton>
      </div>
    </li>
  )
}

function useTaches(contactRef?: string) {
  const [taches, setTaches] = useState<TacheCampagne[]>([])
  const [erreur, setErreur] = useState("")
  const [occupe, setOccupe] = useState(false)
  const charger = useCallback(() => { chargerTachesCampagne(contactRef).then((l) => { setTaches(l); setErreur("") }).catch((e) => setErreur(message(e))) }, [contactRef])
  useEffect(() => { const t = setTimeout(charger, 0); const i = setInterval(charger, 60_000); return () => { clearTimeout(t); clearInterval(i) } }, [charger])
  const fait = (id: string) => { setOccupe(true); terminerTacheCampagne(id).then(charger).catch((e) => setErreur(message(e))).finally(() => setOccupe(false)) }
  return { taches, erreur, occupe, fait }
}

/** L'Agenda : ce que les campagnes demandent, selon la base et les agences du compte. */
export function TachesCampagneAgenda({ service, appelsSeulement, moiId, admin, espaces, onAppelerAgence, onAppelerArtisan }: { service: "gestionnaires" | "soustraitants"; appelsSeulement?: boolean; moiId: string; admin: boolean; espaces: Espace[]; onAppelerAgence: (id: string) => void; onAppelerArtisan: (id: string) => void }) {
  const { taches, erreur, occupe, fait } = useTaches()
  const visibles = taches.filter((t) => (service === "soustraitants") === (t.baseId === "artisans") && (!appelsSeulement || t.type === "appel") && tacheCampagnePourMoi(t, moiId, admin, espaces))
  if (!visibles.length && !erreur) return null
  return (
    <div className="mb-5">
      <Bloc titre={appelsSeulement ? "À appeler pour les campagnes" : "À faire pour les campagnes"} droite={String(visibles.length)}>
        {erreur ? <Bandeau role="alerte" className="mt-3">{erreur}</Bandeau> : null}
        <ul className="mt-1 divide-y-[0.5px] divide-trait">{visibles.map((t) => <Ligne key={t.id} t={t} occupe={occupe} onFait={() => fait(t.id)} ouvrir={() => (t.baseId === "agences" ? onAppelerAgence(t.contactRef) : onAppelerArtisan(t.contactRef))} />)}</ul>
      </Bloc>
    </div>
  )
}

/** La fiche en session de call : ce que la campagne demande pour CE contact. */
export function TachesDuContact({ contactRef }: { contactRef: string }) {
  const { taches, erreur, occupe, fait } = useTaches(contactRef)
  if (!taches.length && !erreur) return null
  return (
    <Bloc titre="Demandé par la campagne">
      {erreur ? <Bandeau role="alerte" className="mt-3">{erreur}</Bandeau> : null}
      <ul className="mt-1 divide-y-[0.5px] divide-trait">{taches.map((t) => <Ligne key={t.id} t={t} occupe={occupe} onFait={() => fait(t.id)} />)}</ul>
    </Bloc>
  )
}
