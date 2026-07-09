import { useEffect, useMemo, useState } from "react"
import { Search, Loader2, UserCheck } from "lucide-react"
import {
  prospects as prospectsDemo,
  couleursVolume,
  estApporteur,
  type Prospect,
} from "../data"
import { classePastille, palette, rangEtat, statutsParDefaut, type Statut } from "../statuts"
import { supabaseConfigure } from "../lib/supabase"
import { chargerProspects, majProspect, majProspectComplet, supprimerProspect } from "../lib/prospectsDb"
import { chargerStatuts } from "../lib/statutsDb"
import ProspectModal from "./ProspectModal"
import BandeauErreur from "./BandeauErreur"

// Un gestionnaire est « complet » s'il a un nom de contact ET un email.
function estComplet(p: Prospect): boolean {
  return Boolean(p.contact?.trim() && p.email?.trim())
}

export default function GestionnairesView() {
  const [data, setData] = useState<Prospect[]>([])
  const [statuts, setStatuts] = useState<Statut[]>(statutsParDefaut)
  const [recherche, setRecherche] = useState("")
  const [chargement, setChargement] = useState(true)
  const [fiche, setFiche] = useState<Prospect | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    if (!supabaseConfigure) {
      setData(prospectsDemo)
      setChargement(false)
      return
    }
    chargerProspects()
      .then(setData)
      .catch((e) => setErreur(e instanceof Error ? e.message : "Erreur inconnue"))
      .finally(() => setChargement(false))
    chargerStatuts().then((r) => r.length && setStatuts(r)).catch(() => {})
  }, [])

  const complets = useMemo(
    () =>
      data
        .filter((p) => estComplet(p) && !estApporteur(p))
        // Classé du meilleur état (Client signé) au pire (Perdu), puis par nom.
        .sort(
          (a, b) =>
            rangEtat(a.statut) - rangEtat(b.statut) ||
            (a.contact || "").localeCompare(b.contact || ""),
        ),
    [data],
  )

  const lignes = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    if (!q) return complets
    return complets.filter((p) =>
      [p.contact, p.email, p.entreprise, p.telephone, p.statut].join(" ").toLowerCase().includes(q),
    )
  }, [recherche, complets])

  // Affichage limité à 100 lignes (rapide même avec des milliers de gestionnaires).
  const lignesAff = lignes.slice(0, 100)

  async function enregistrer(p: Prospect) {
    if (fiche?.id) {
      const id = fiche.id
      setData((arr) => arr.map((x) => (x.id === id ? { ...p, id } : x)))
      await majProspectComplet(id, p).catch(console.error)
    }
    setFiche(null)
  }

  // Changer l'état directement depuis la liste.
  function changerStatut(p: Prospect, valeur: string) {
    if (!p.id) return
    const id = p.id
    setData((arr) => arr.map((x) => (x.id === id ? { ...x, statut: valeur } : x)))
    majProspect(id, { statut: valeur }).catch(console.error)
  }

  return (
    <div className="px-8 pb-10">
      {erreur && <BandeauErreur message={erreur} />}
      {fiche && (
        <ProspectModal
          prospect={fiche}
          statuts={statuts}
          contexte="gestionnaire"
          onClose={() => setFiche(null)}
          onSave={enregistrer}
          onDelete={async (id) => {
            await supprimerProspect(id)
            setData((arr) => arr.filter((x) => x.id !== id))
          }}
        />
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <UserCheck size={16} className="text-emerald-600" />
          <span className="font-medium text-slate-700">{complets.length}</span> gestionnaires complets
          <span className="text-slate-400">(nom + email)</span> sur {data.length.toLocaleString("fr-FR")}
        </p>
        <div className="relative w-72 max-w-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {chargement ? (
          <div className="flex items-center gap-2 px-5 py-8 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" /> Chargement…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3">Nom</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Téléphone</th>
                  <th className="px-5 py-3">Agence</th>
                  <th className="px-5 py-3">Volume OS</th>
                  <th className="px-5 py-3">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lignesAff.map((p, i) => {
                  const cleCouleur = statuts.find((s) => s.libelle === p.statut)?.couleur
                  const teinte =
                    cleCouleur && cleCouleur !== "slate" ? palette[cleCouleur].dot + "66" : undefined
                  return (
                  <tr
                    key={p.id ?? i}
                    onClick={() => setFiche(p)}
                    style={teinte ? { backgroundColor: teinte } : undefined}
                    className="cursor-pointer transition-colors hover:brightness-95"
                  >
                    <td className="px-5 py-3 font-medium text-slate-800">{p.contact}</td>
                    <td className="px-5 py-3 text-slate-600">{p.email}</td>
                    <td className="px-5 py-3 text-slate-600">{p.telephone}</td>
                    <td className="px-5 py-3 text-slate-500">{p.entreprise}</td>
                    <td className="px-5 py-3">
                      {p.volume ? (
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${couleursVolume[p.volume] ?? "bg-slate-100 text-slate-500"}`}>
                          {p.volume}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <select
                        value={p.statut}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation()
                          changerStatut(p, e.target.value)
                        }}
                        className={`cursor-pointer rounded-full border-0 px-2.5 py-1 text-xs font-medium outline-none ${classePastille(p.statut, statuts)}`}
                      >
                        {statuts.map((s) => (
                          <option key={s.id ?? s.libelle} value={s.libelle}>
                            {s.libelle}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                  )
                })}
                {lignes.length > 100 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-3 text-center text-xs font-medium text-slate-400">
                      100 premiers affichés sur {lignes.length.toLocaleString("fr-FR")} — affinez la recherche pour voir les autres.
                    </td>
                  </tr>
                )}
                {lignes.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-400">
                      Aucun gestionnaire complet (avec nom + email) pour l'instant.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
