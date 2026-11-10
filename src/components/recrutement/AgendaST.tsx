// Sous-traitants › Agenda : ce que les campagnes demandent, et les rappels prévus.
import { useEffect, useMemo, useState } from "react"
import type { Session } from "@supabase/supabase-js"
import { Phone } from "lucide-react"
import { Bandeau, Bouton, Chargement, EnTetePage, Vide } from "../../ui"
import { Bloc } from "../demarchage/aujourdhui/courtier"
import { TachesCampagneAgenda } from "../prospection/moteur/TachesCampagne"
import { estAdmin } from "../../lib/comptes"
import { chargerSousTraitants } from "../../lib/sousTraitantsDb"
import type { SousTraitant } from "../../recrutement"

const quand = (iso: string) => new Date(iso).toLocaleString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })

export default function AgendaST({ session, onAppeler }: { session: Session | null; onAppeler: (id: string) => void }) {
  const [artisans, setArtisans] = useState<SousTraitant[] | null>(null)
  const [erreur, setErreur] = useState("")
  useEffect(() => { let vivant = true; chargerSousTraitants().then((l) => { if (vivant) setArtisans(l) }).catch((e) => { if (vivant) setErreur(e instanceof Error ? e.message : String(e)) }); return () => { vivant = false } }, [])
  const rappels = useMemo(() => (artisans ?? []).filter((a) => a.rappelLe).sort((a, b) => String(a.rappelLe).localeCompare(String(b.rappelLe))), [artisans])
  return (
    <div className="page">
      <EnTetePage titre="Agenda" sousTitre="Les appels demandés par les campagnes et les rappels prévus." />
      {erreur ? <Bandeau role="alerte" className="mb-4">{erreur}</Bandeau> : null}
      <TachesCampagneAgenda service="soustraitants" moiId={session?.user?.id ?? ""} admin={estAdmin(session)} espaces={["recrutement"]} onAppelerAgence={() => undefined} onAppelerArtisan={onAppeler} />
      {!artisans && !erreur ? <Chargement /> : null}
      {artisans ? (
        <Bloc titre="Rappels prévus" droite={String(rappels.length)}>
          {rappels.length ? (
            <ul className="mt-1 divide-y-[0.5px] divide-trait">
              {rappels.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0"><p className="truncate text-legende font-medium text-encre">{a.entreprise || a.contact || "Sans nom"}</p><p className="mt-0.5 text-colonne text-encre-2">{[quand(String(a.rappelLe)), a.metier, a.telephone].filter(Boolean).join(" · ")}</p></div>
                  <Bouton taille="sm" icone={<Phone />} onClick={() => onAppeler(a.id!)}>Appeler</Bouton>
                </li>
              ))}
            </ul>
          ) : <div className="mt-3"><Vide titre="Aucun rappel prévu" texte="Un rappel se programme à la fin d'un appel." /></div>}
        </Bloc>
      ) : null}
    </div>
  )
}
