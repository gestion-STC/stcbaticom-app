// Sous-traitants › Agenda, façon Google Agenda (Mahdi, 11/11/2026, maquette validée) : SES agendas seulement —
// les rappels prévus après un appel, les appels et LinkedIn demandés par les campagnes artisans, les jours fériés.
import { useCallback, useEffect, useMemo, useState } from "react"
import type { Session } from "@supabase/supabase-js"
import { Check, ExternalLink, Phone } from "lucide-react"
import { Bandeau, Bouton } from "../../ui"
import { estAdmin } from "../../lib/comptes"
import { chargerSousTraitants } from "../../lib/sousTraitantsDb"
import { tacheCampagnePourMoi } from "../../lib/perimetre"
import { chargerTachesCampagne, rechercheLinkedin, terminerTacheCampagne, type TacheCampagne } from "../../lib/tachesCampagne"
import type { SousTraitant } from "../../recrutement"
import CalendrierGoogle, { type AgendaDef, type Bulle, type EvAgenda, type Vue } from "../agenda/CalendrierGoogle"

const AGENDAS: AgendaDef[] = [
  { id: "rappels", nom: "Rappels prévus", couleur: "#1f8a4c" },
  { id: "campagnes", nom: "À appeler pour les campagnes", couleur: "#b25e00" },
  { id: "linkedin", nom: "LinkedIn", couleur: "#0a66c2" },
]
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const debutJour = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

export default function AgendaST({ session, onAppeler }: { session: Session | null; onAppeler: (id: string) => void }) {
  const moiId = session?.user?.id ?? ""
  const admin = estAdmin(session)
  const [vue, setVue] = useState<Vue>("semaine")
  const [ancre, setAncre] = useState(() => new Date())
  const [maintenant, setMaintenant] = useState(() => new Date())
  const [artisans, setArtisans] = useState<SousTraitant[] | null>(null)
  const [campagne, setCampagne] = useState<TacheCampagne[]>([])
  const [erreur, setErreur] = useState("")
  const [occupe, setOccupe] = useState(false)

  const charger = useCallback(() => {
    Promise.all([chargerSousTraitants(), chargerTachesCampagne()])
      .then(([a, t]) => { setArtisans(a); setCampagne(t.filter((x) => x.baseId === "artisans" && tacheCampagnePourMoi(x, moiId, admin, ["recrutement"]))); setMaintenant(new Date()); setErreur("") })
      .catch((e) => setErreur(message(e)))
  }, [moiId, admin])
  useEffect(() => { const t = setTimeout(charger, 0); const h = setInterval(() => setMaintenant(new Date()), 60_000); return () => { clearTimeout(t); clearInterval(h) } }, [charger])

  const aujourdhui = debutJour(maintenant)
  const evenements = useMemo<EvAgenda[]>(() => {
    const out: EvAgenda[] = []
    for (const a of artisans ?? []) {
      if (!a.rappelLe || !a.id) continue
      const debut = new Date(a.rappelLe)
      out.push({ id: `r-${a.id}`, agenda: "rappels", titre: `Rappeler ${a.entreprise || a.contact || "l'artisan"}`, detail: a.contact && a.entreprise ? a.contact : undefined, debut, jour: debut, dureeMin: 15, retard: debut < maintenant })
    }
    for (const t of campagne) out.push({ id: `c-${t.id}`, agenda: t.type === "linkedin" ? "linkedin" : "campagnes", titre: t.type === "linkedin" ? `LinkedIn · ${t.personne || t.nom}` : `Appeler ${t.nom || t.personne || "l'artisan"}`, detail: t.campagneNom, debut: null, jour: aujourdhui })
    return out
  }, [artisans, campagne, maintenant, aujourdhui])

  const bulle = (ev: EvAgenda, fermer: () => void): Bulle => {
    if (ev.id.startsWith("r-")) {
      const a = (artisans ?? []).find((x) => `r-${x.id}` === ev.id)
      if (!a) return { lignes: null }
      return {
        quand: new Date(a.rappelLe!).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }),
        lignes: <>
          <p><b className="font-medium">{a.entreprise || "Sans nom"}</b>{a.contact ? ` · ${a.contact}` : ""}{a.telephone ? <span className="chiffres text-encre-2"> · {a.telephone}</span> : null}</p>
          {a.metier ? <p className="text-encre-2">{a.metier}</p> : null}
          {a.dernierResultat ? <p className="text-encre-2">Dernier appel : {a.dernierResultat}</p> : null}
        </>,
        boutons: <Bouton taille="sm" variante="plein" icone={<Phone />} onClick={() => { fermer(); onAppeler(a.id!) }}>Appeler</Bouton>,
      }
    }
    const t = campagne.find((x) => `c-${x.id}` === ev.id)
    if (!t) return { lignes: null }
    return {
      quand: "À faire maintenant, demandé par la campagne",
      lignes: <>
        <p><b className="font-medium">{t.nom || "Sans nom"}</b>{t.personne ? ` · ${t.personne}` : ""}{t.type === "appel" && t.telephone ? <span className="chiffres text-encre-2"> · {t.telephone}</span> : null}</p>
        {t.consigne ? <p className="text-encre-2">{t.consigne}</p> : null}
        <p className="text-encre-2">Campagne « {t.campagneNom} »</p>
      </>,
      boutons: <>
        {t.type === "appel" ? <Bouton taille="sm" variante="plein" icone={<Phone />} onClick={() => { fermer(); onAppeler(t.contactRef) }}>Appeler</Bouton> : <a className="inline-flex h-8 items-center gap-1.5 rounded-4 bg-action px-3 text-legende font-medium text-white hover:bg-action-survol" href={rechercheLinkedin(t)} target="_blank" rel="noreferrer"><ExternalLink size={14} />Chercher sur LinkedIn</a>}
        <Bouton taille="sm" icone={<Check />} disabled={occupe} onClick={() => { setOccupe(true); terminerTacheCampagne(t.id).then(() => { fermer(); charger() }).catch((e) => setErreur(message(e))).finally(() => setOccupe(false)) }}>Fait</Bouton>
      </>,
    }
  }

  const nb = evenements.filter((e) => !e.fait).length
  return (
    <CalendrierGoogle
      cle="agenda_soustraitants_caches"
      titre="Agenda"
      sousTitre={artisans ? `${nb} à faire` : undefined}
      agendas={AGENDAS}
      evenements={evenements}
      chargement={artisans === null && !erreur}
      erreur={erreur ? <Bandeau role="alerte" className="mx-6 mt-3">{erreur}</Bandeau> : null}
      vue={vue} onVue={setVue} ancre={ancre} onAncre={setAncre} maintenant={maintenant}
      bulle={bulle}
    />
  )
}
