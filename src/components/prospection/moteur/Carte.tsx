// ── LE CIBLAGE SUR UNE CARTE, COMME META (Mahdi, 09/11/2026) : Monde, France, Île-de-France, Paris par arrondissement ──
// Chargé à la demande (les contours pèsent 300 Ko). Une zone = un pays (« pays:250 »), un département (« 92 ») ou un
// arrondissement (« 75011 ») ; Paris se garde arrondissement par arrondissement.
import { useMemo, useState } from "react"
import { Search, X } from "lucide-react"
import { Champ, Onglets } from "../../../ui"
import cartes from "./carte.json"

type Zone = { id: string; nom: string; d: string; x: number; y: number }
type Vue = "monde" | "france" | "idf" | "paris"
const DATA = cartes as Record<Vue, { vb: string; zones: Zone[] }>
const ARRS = DATA.paris.zones.map((z) => z.id)
const FRANCE = "pays:250"
const NOMS = new Map([...DATA.monde.zones, ...DATA.france.zones, ...DATA.paris.zones].map((z) => [z.id, z.nom] as const))
const fr = (n: number) => n.toLocaleString("fr-FR")

export default function Carte({ zones, onChange, compter, avertissement, lecture }: { zones: string[]; onChange: (z: string[]) => void; compter: ((id: string) => number) | null; avertissement?: string; lecture?: boolean }) {
  const [vue, setVue] = useState<Vue>("idf")
  const [survol, setSurvol] = useState<Zone | null>(null)
  const [q, setQ] = useState("")
  const set = useMemo(() => new Set(zones), [zones])
  const toutFrance = set.has(FRANCE)
  const nbArr = ARRS.filter((a) => set.has(a)).length
  const pris = (id: string) => (toutFrance && !id.startsWith("pays:") ? true : id === "75" ? nbArr === ARRS.length : set.has(id))
  const partiel = (id: string) => id === "75" && !toutFrance && nbArr > 0 && nbArr < ARRS.length

  const basculer = (id: string) => {
    if (lecture) return
    // « Toute la France » cochée : un clic sur une zone la remplace par le détail, moins cette zone.
    if (toutFrance && !id.startsWith("pays:")) {
      const tout = [...DATA.france.zones.map((z) => z.id).filter((d) => d !== "75"), ...ARRS]
      const retire = id === "75" ? ARRS : [id]
      onChange([...zones.filter((z) => z !== FRANCE && !tout.includes(z)), ...tout.filter((z) => !retire.includes(z))])
      return
    }
    if (id === "75") { onChange(nbArr === ARRS.length ? zones.filter((z) => !ARRS.includes(z)) : [...zones.filter((z) => !ARRS.includes(z)), ...ARRS]); return }
    onChange(set.has(id) ? zones.filter((z) => z !== id) : [...zones, id])
  }

  const pastilles = [...(nbArr === ARRS.length ? ["75"] : ARRS.filter((a) => set.has(a))), ...zones.filter((z) => !ARRS.includes(z))]
  const retirer = (id: string) => onChange(id === "75" ? zones.filter((z) => !ARRS.includes(z)) : zones.filter((z) => z !== id))
  const recherche = q.trim().toLowerCase()
  const resultats = recherche.length < 2 ? [] : [...DATA.paris.zones, ...DATA.france.zones, ...DATA.monde.zones].filter((z) => z.nom.toLowerCase().includes(recherche) || z.id === recherche).slice(0, 8)
  const carte = DATA[vue]
  const etiquettes = vue === "idf" || vue === "paris"
  const remplissage = (z: Zone) => (pris(z.id) ? "var(--color-signature)" : partiel(z.id) ? "color-mix(in srgb, var(--color-signature) 40%, var(--color-fond))" : survol?.id === z.id ? "#b4b4bc" : "var(--color-trait-fort)")

  return (
    <div className="grid gap-6 @min-[760px]:grid-cols-[minmax(0,1fr)_230px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Onglets<Vue> className="!border-b-0" valeur={vue} onChange={setVue} options={[{ id: "monde", label: "Monde" }, { id: "france", label: "France" }, { id: "idf", label: "Île-de-France" }, { id: "paris", label: "Paris" }]} />
          <div className="relative w-[260px]">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-encre-3" />
            <Champ className="pl-8" value={q} disabled={lecture} placeholder="Pays, département, arrondissement" aria-label="Chercher une zone" onChange={(e) => setQ(e.target.value)} />
            {resultats.length ? <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-4 border-[0.5px] border-trait bg-fond shadow-flottante">{resultats.map((z) => <button key={z.id} type="button" onClick={() => { if (!pris(z.id)) basculer(z.id); setQ("") }} className="block w-full border-b-[0.5px] border-trait px-3 py-2 text-left text-legende last:border-0 hover:bg-fond-2">{z.nom}{z.id.length === 2 ? <span className="text-encre-2"> ({z.id})</span> : null}</button>)}</div> : null}
          </div>
        </div>
        <div className="mt-2 rounded-6 bg-fond-2">
          <svg viewBox={carte.vb} className="block max-h-[440px] w-full" role="group" aria-label="Carte du ciblage">
            {carte.zones.map((z) => <path key={z.id} d={z.d} fillRule="evenodd" role="button" aria-label={z.nom} aria-pressed={pris(z.id)} onClick={() => basculer(z.id)} onMouseEnter={() => setSurvol(z)} onMouseLeave={() => setSurvol(null)} style={{ fill: remplissage(z), stroke: "var(--color-fond)", strokeWidth: vue === "monde" ? 0.4 : 0.8, cursor: lecture ? "default" : "pointer" }} />)}
            {etiquettes ? carte.zones.map((z) => <text key={z.id} x={z.x} y={z.y} textAnchor="middle" dominantBaseline="central" pointerEvents="none" style={{ fontSize: 13, fontWeight: 500, fill: pris(z.id) ? "#fff" : "var(--color-encre-2)" }}>{vue === "paris" ? Number(z.id.slice(3)) : z.id}</text>) : null}
          </svg>
          <div className="px-3 pb-2.5 text-legende">{survol ? <><b className="font-medium">{survol.nom}</b>{compter && !survol.id.startsWith("pays:") ? <span className="text-encre-2"> · {fr(compter(survol.id))} contacts</span> : null}</> : <span className="text-encre-2">{lecture ? "Zones de cette campagne" : "Clique pour ajouter ou retirer. Aucune zone : toute la base."}</span>}</div>
        </div>
      </div>
      <aside className="min-w-0">
        {avertissement ? <p className="mb-3 text-colonne text-attention">{avertissement}</p> : null}
        <div className="flex flex-wrap gap-1.5">
          {pastilles.map((id) => <span key={id} className="inline-flex h-7 max-w-full items-center gap-1 rounded-full bg-fond-3 pl-3 pr-1 text-colonne"><span className="truncate">{id === "75" ? "Paris" : NOMS.get(id) ?? id}</span>{lecture ? <span className="w-1" /> : <button type="button" aria-label={`Retirer ${NOMS.get(id) ?? id}`} className="rounded-full p-1 hover:bg-fond-4" onClick={() => retirer(id)}><X size={11} /></button>}</span>)}
          {!pastilles.length ? <p className="text-legende text-encre-2">Toute la base, sans limite de zone.</p> : null}
        </div>
        {pastilles.length && !lecture ? <button type="button" onClick={() => onChange([])} className="mt-3 text-colonne text-encre-2 hover:text-encre">Tout retirer</button> : null}
      </aside>
    </div>
  )
}
