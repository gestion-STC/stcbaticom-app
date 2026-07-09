import { useEffect, useMemo, useState } from "react"
import { Search, Loader2, Handshake, Download } from "lucide-react"
import { estApporteur, type Prospect } from "../data"
import { classePastille, palette, statutsParDefaut, type Statut } from "../statuts"
import { supabaseConfigure } from "../lib/supabase"
import { chargerProspects, majProspectComplet, supprimerProspect } from "../lib/prospectsDb"
import { chargerStatuts } from "../lib/statutsDb"
import { exporterProspectsExcel } from "../lib/exportProspects"
import ProspectModal from "./ProspectModal"

export default function ApporteursView() {
  const [data, setData] = useState<Prospect[]>([])
  const [statuts, setStatuts] = useState<Statut[]>(statutsParDefaut)
  const [recherche, setRecherche] = useState("")
  const [chargement, setChargement] = useState(true)
  const [fiche, setFiche] = useState<Prospect | null>(null)

  function recharger() {
    if (!supabaseConfigure) {
      setData([])
      setChargement(false)
      return
    }
    chargerProspects()
      .then((rows) => setData(rows))
      .catch(() => setData([]))
      .finally(() => setChargement(false))
    chargerStatuts().then((r) => r.length && setStatuts(r)).catch(() => {})
  }
  useEffect(recharger, [])

  const apporteurs = useMemo(() => data.filter(estApporteur), [data])

  const lignes = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    if (!q) return apporteurs
    return apporteurs.filter((p) =>
      [p.contact, p.email, p.entreprise, p.telephone, p.commentaire, p.statut]
        .join(" ")
        .toLowerCase()
        .includes(q),
    )
  }, [recherche, apporteurs])

  async function enregistrer(p: Prospect) {
    if (fiche?.id) {
      await majProspectComplet(fiche.id, p).catch(console.error)
    }
    setFiche(null)
    recharger() // une fiche peut avoir quitté (ou rejoint) les apporteurs
  }

  return (
    <div className="px-8 pb-10">
      {fiche && (
        <ProspectModal
          prospect={fiche}
          statuts={statuts}
          contexte="apporteur"
          onClose={() => setFiche(null)}
          onSave={enregistrer}
          onDelete={async (id) => {
            await supprimerProspect(id)
            setData((arr) => arr.filter((x) => x.id !== id))
          }}
        />
      )}

      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="font-medium">Apporteurs d'affaires — base mise de côté</p>
        <p className="mt-0.5 text-amber-700">
          Ces contacts ne sont pas démarchés (ils n'apparaissent pas dans Prospects, Sessions de call
          ni Pipeline), mais tout leur historique est conservé. Vous pouvez les exporter en Excel pour
          les transmettre à la personne qui s'en occupera.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Handshake size={16} className="text-amber-600" />
          <span className="font-medium text-slate-700">{apporteurs.length}</span> apporteur
          {apporteurs.length > 1 ? "s" : ""} d'affaires
        </p>
        <div className="flex items-center gap-2">
          <div className="relative w-64 max-w-full">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher…"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <button
            onClick={() =>
              exporterProspectsExcel(lignes, {
                nomFeuille: "Apporteurs",
                nomFichier: "apporteurs-affaires-stc.xlsx",
              })
            }
            disabled={lignes.length === 0}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            <Download size={16} />
            Exporter
          </button>
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
                  <th className="px-5 py-3">Contact</th>
                  <th className="px-5 py-3">Agence</th>
                  <th className="px-5 py-3">Téléphone</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Note</th>
                  <th className="px-5 py-3">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lignes.map((p, i) => {
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
                    <td className="px-5 py-3 font-medium text-slate-800">{p.contact || "—"}</td>
                    <td className="px-5 py-3 text-slate-600">{p.entreprise}</td>
                    <td className="px-5 py-3 text-slate-600">{p.telephone}</td>
                    <td className="px-5 py-3 text-slate-500">{p.email || "—"}</td>
                    <td className="max-w-xs truncate px-5 py-3 text-slate-500">{p.commentaire || "—"}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${classePastille(p.statut, statuts)}`}>
                        {p.statut}
                      </span>
                    </td>
                  </tr>
                  )
                })}
                {lignes.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-400">
                      Aucun apporteur d'affaires pour l'instant. Ouvrez une fiche prospect et cliquez
                      sur « C'est un apporteur » pour la ranger ici.
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
