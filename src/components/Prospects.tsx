import { useEffect, useMemo, useRef, useState } from "react"
import {
  Search,
  Plus,
  Upload,
  Download,
  ChevronDown,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Copy,
  X,
} from "lucide-react"
import {
  prospects as prospectsDemo,
  couleursPriorite,
  toutesPriorites,
  estApporteur,
  type Prospect,
  type Priorite,
} from "../data"
import { palette, classePastille, rangEtat, statutsParDefaut, type Statut } from "../statuts"
import { importerProspects, type ResultatImport } from "../lib/importProspects"
import { filtrerSansDoublons } from "../lib/dedup"
import { exporterProspectsExcel } from "../lib/exportProspects"
import { supabaseConfigure } from "../lib/supabase"
import {
  chargerProspects,
  insererProspects,
  majProspect,
  majProspectComplet,
  creerProspect,
  supprimerProspect,
} from "../lib/prospectsDb"
import { chargerStatuts } from "../lib/statutsDb"
import ProspectModal from "./ProspectModal"
import DoublonsModal from "./DoublonsModal"

// Filtre déroulant générique
function FiltreSelect({
  label,
  options,
  valeur,
  onChange,
}: {
  label: string
  options: string[]
  valeur: string | null
  onChange: (v: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={
          "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors " +
          (valeur
            ? "border-blue-300 bg-blue-50 text-blue-700"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
        }
      >
        {valeur ?? label}
        {valeur ? (
          <X
            size={14}
            onClick={(e) => {
              e.stopPropagation()
              onChange(null)
            }}
          />
        ) : (
          <ChevronDown size={15} className="text-slate-400" />
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 mt-1 max-h-64 w-48 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
            <button
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
              className="flex w-full px-3 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-50"
            >
              Tous
            </button>
            {options.map((o) => (
              <button
                key={o}
                onClick={() => {
                  onChange(o)
                  setOpen(false)
                }}
                className="flex w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                {o}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

type ModalState = { mode: "create" } | { mode: "edit"; prospect: Prospect } | null

export default function Prospects() {
  const [recherche, setRecherche] = useState("")
  const [data, setData] = useState<Prospect[]>(prospectsDemo)
  const [importEnCours, setImportEnCours] = useState(false)
  const [resultat, setResultat] = useState<ResultatImport | null>(null)
  const [bilan, setBilan] = useState<{ ajoutes: number; ignores: number; apporteurs: number } | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [connecte, setConnecte] = useState(false)
  const [statuts, setStatuts] = useState<Statut[]>(statutsParDefaut)
  const [filtreStatut, setFiltreStatut] = useState<string | null>(null)
  const [filtreArrond, setFiltreArrond] = useState<string | null>(null)
  const [filtrePriorite, setFiltrePriorite] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>(null)
  const [doublonsOuvert, setDoublonsOuvert] = useState(false)
  const [page, setPage] = useState(0)
  const [menu, setMenu] = useState<{
    cible: Prospect
    champ: "statut" | "priorite"
    x: number
    y: number
  } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function ouvrirMenu(
    e: React.MouseEvent<HTMLButtonElement>,
    cible: Prospect,
    champ: "statut" | "priorite",
  ) {
    e.stopPropagation()
    if (menu?.cible === cible && menu.champ === champ) {
      setMenu(null)
      return
    }
    const r = e.currentTarget.getBoundingClientRect()
    setMenu({ cible, champ, x: r.left, y: r.bottom + 4 })
  }

  useEffect(() => {
    if (!supabaseConfigure) return
    chargerProspects()
      .then((rows) => {
        setConnecte(true)
        if (rows.length) setData(rows)
      })
      .catch((err) => {
        console.error(err)
        setErreur(
          "Connexion à la base impossible. Détail : " +
            (err instanceof Error ? err.message : String(err)),
        )
      })
    chargerStatuts()
      .then((rows) => rows.length && setStatuts(rows))
      .catch(() => {})
  }, [])

  // Vise la bonne fiche par id (fiable même après un rechargement), sinon par référence.
  const estCible = (p: Prospect, cible: Prospect) =>
    cible.id ? p.id === cible.id : p === cible

  function changerStatut(cible: Prospect, valeur: string) {
    setData((prev) => prev.map((p) => (estCible(p, cible) ? { ...p, statut: valeur } : p)))
    setMenu(null)
    if (connecte && cible.id)
      majProspect(cible.id, { statut: valeur }).catch(console.error)
  }

  function changerPriorite(cible: Prospect, valeur: Priorite) {
    setData((prev) => prev.map((p) => (estCible(p, cible) ? { ...p, priorite: valeur } : p)))
    setMenu(null)
    if (connecte && cible.id)
      majProspect(cible.id, { priorite: valeur }).catch(console.error)
  }

  async function enregistrer(p: Prospect) {
    if (modal?.mode === "edit") {
      const cible = modal.prospect
      setData((arr) => arr.map((x) => (estCible(x, cible) ? { ...p, id: cible.id } : x)))
      if (connecte && cible.id)
        majProspectComplet(cible.id, p).catch(console.error)
    } else {
      if (connecte) {
        try {
          const cree = await creerProspect(p)
          setData((arr) => [cree, ...arr])
        } catch (e) {
          console.error(e)
          setData((arr) => [p, ...arr])
        }
      } else {
        setData((arr) => [p, ...arr])
      }
    }
    setModal(null)
  }

  async function onFichier(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setErreur(null)
    setResultat(null)
    setBilan(null)
    setImportEnCours(true)
    try {
      const res = await importerProspects(file)
      if (res.total === 0) {
        setErreur("Aucun prospect lu dans le fichier.")
        return
      }
      // Mode « ajouter sans doublons » : on écarte une ligne seulement si la MÊME
      // identité (même téléphone ET même nom d'agence) est déjà présente — ainsi deux
      // gestionnaires différents partageant le standard d'une agence sont tous les deux gardés.
      // (Logique testée dans src/lib/dedup.ts.)
      const aGarder = filtrerSansDoublons(data, res.prospects)
      const ignores = res.total - aGarder.length
      const apporteurs = aGarder.filter(estApporteur).length

      if (connecte) {
        const crees = await insererProspects(aGarder)
        setData((arr) => [...crees, ...arr])
      } else {
        setData((arr) => [...aGarder, ...arr])
      }
      setResultat(res)
      setBilan({ ajoutes: aGarder.length, ignores, apporteurs })
    } catch (err) {
      setErreur(
        err instanceof Error
          ? err.message
          : "Impossible de lire ce fichier. Exportez votre feuille en Excel (.xlsx).",
      )
      console.error(err)
    } finally {
      setImportEnCours(false)
    }
  }

  const arrondissements = useMemo(
    () => [...new Set(data.map((p) => p.arrondissement).filter(Boolean))].sort(),
    [data],
  )
  const optionsStatut = statuts.length
    ? statuts.map((s) => s.libelle)
    : [...new Set(data.map((p) => p.statut))]

  const lignes = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return data
      .filter((p) => {
        if (estApporteur(p)) return false // les apporteurs ont leur propre onglet
        if (filtreStatut && p.statut !== filtreStatut) return false
        if (filtreArrond && p.arrondissement !== filtreArrond) return false
        if (filtrePriorite && p.priorite !== filtrePriorite) return false
        if (
          q &&
          ![p.entreprise, p.contact, p.adresse, p.arrondissement, p.email, p.statut, p.type]
            .join(" ")
            .toLowerCase()
            .includes(q)
        )
          return false
        return true
      })
      // Classé du meilleur état (Client signé) au pire (Perdu), puis par agence.
      .sort(
        (a, b) =>
          rangEtat(a.statut) - rangEtat(b.statut) ||
          a.entreprise.localeCompare(b.entreprise),
      )
  }, [recherche, data, filtreStatut, filtreArrond, filtrePriorite])

  // Pagination : on n'affiche que 50 lignes à la fois (rapide même à 5000+ prospects).
  const PAR_PAGE = 50
  const pageMax = Math.max(0, Math.ceil(lignes.length / PAR_PAGE) - 1)
  const pageSure = Math.min(page, pageMax)
  const lignesPage = lignes.slice(pageSure * PAR_PAGE, (pageSure + 1) * PAR_PAGE)
  useEffect(() => {
    setPage(0)
  }, [recherche, filtreStatut, filtreArrond, filtrePriorite])

  return (
    <div className="px-8 pb-10">
      {/* Menu déroulant statut / priorité */}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
          <div
            className="fixed z-50 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
            style={{ left: menu.x, top: menu.y }}
          >
            {menu.champ === "statut"
              ? statuts.map((st) => (
                  <button
                    key={st.id ?? st.libelle}
                    onClick={() => changerStatut(menu.cible, st.libelle)}
                    className="flex w-full items-center px-3 py-1.5 text-left hover:bg-slate-50"
                  >
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${palette[st.couleur].pill}`}
                    >
                      {st.libelle}
                    </span>
                  </button>
                ))
              : toutesPriorites.map((pr) => (
                  <button
                    key={pr}
                    onClick={() => changerPriorite(menu.cible, pr)}
                    className={`flex w-full px-4 py-1.5 text-left text-sm font-medium hover:bg-slate-50 ${couleursPriorite[pr]}`}
                  >
                    {pr}
                  </button>
                ))}
          </div>
        </>
      )}

      {doublonsOuvert && (
        <DoublonsModal
          onClose={() => {
            setDoublonsOuvert(false)
            if (connecte)
              chargerProspects().then((r) => r.length && setData(r)).catch(() => {})
          }}
        />
      )}

      {/* Modal Ajouter / Fiche */}
      {modal && (
        <ProspectModal
          prospect={modal.mode === "edit" ? modal.prospect : null}
          statuts={statuts}
          onClose={() => setModal(null)}
          onSave={enregistrer}
          onDelete={
            connecte
              ? async (id) => {
                  await supprimerProspect(id)
                  setData((arr) => arr.filter((x) => x.id !== id))
                }
              : undefined
          }
        />
      )}

      {/* Bandeau résultat d'import */}
      {resultat && bilan && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-600" />
          <div className="flex-1 text-sm text-emerald-900">
            <p className="font-medium">
              {bilan.ajoutes} prospect{bilan.ajoutes > 1 ? "s" : ""} ajouté
              {bilan.ajoutes > 1 ? "s" : ""} depuis « {resultat.feuille} »
              {bilan.ignores > 0 && (
                <span className="font-normal text-emerald-700">
                  {" "}· {bilan.ignores} doublon{bilan.ignores > 1 ? "s" : ""} ignoré
                  {bilan.ignores > 1 ? "s" : ""} (numéro déjà présent)
                </span>
              )}
            </p>
            {bilan.apporteurs > 0 && (
              <p className="mt-0.5 text-amber-700">
                Dont {bilan.apporteurs} apporteur{bilan.apporteurs > 1 ? "s" : ""} d'affaires rangé
                {bilan.apporteurs > 1 ? "s" : ""} à part (onglet Apporteurs).
              </p>
            )}
            {resultat.ignorees > 0 && (
              <p className="mt-0.5 text-orange-700">
                ⚠️ {resultat.ignorees} ligne{resultat.ignorees > 1 ? "s" : ""} non importée
                {resultat.ignorees > 1 ? "s" : ""} (pas de nom d'agence dans la 1re colonne).
              </p>
            )}
            <p className="mt-0.5 text-emerald-700">
              Statuts détectés :{" "}
              {Object.entries(resultat.parStatut)
                .map(([s, n]) => `${n} ${s}`)
                .join(" · ")}
            </p>
          </div>
          <button
            onClick={() => {
              setResultat(null)
              setBilan(null)
            }}
            className="text-emerald-600 hover:text-emerald-800"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {erreur && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-500" />
          <p className="flex-1">{erreur}</p>
          <button onClick={() => setErreur(null)} className="text-red-500 hover:text-red-700">
            <X size={18} />
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* En-tête */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">Prospects</h2>
            {connecte && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Base connectée
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setModal({ mode: "create" })}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <Plus size={16} strokeWidth={2.3} />
              Ajouter
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={onFichier}
            />
            <button
              onClick={() => inputRef.current?.click()}
              disabled={importEnCours}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
            >
              {importEnCours ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Upload size={16} />
              )}
              {importEnCours ? "Lecture…" : "Importer"}
            </button>
            <button
              onClick={() => exporterProspectsExcel(lignes)}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <Download size={16} />
              Exporter
            </button>
            <button
              onClick={() => setDoublonsOuvert(true)}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <Copy size={16} />
              Doublons
            </button>
          </div>
        </div>

        {/* Recherche + filtres */}
        <div className="flex flex-wrap items-center gap-2 px-5 py-3">
          <div className="relative min-w-56 flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher…"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <FiltreSelect label="Statut" options={optionsStatut} valeur={filtreStatut} onChange={setFiltreStatut} />
          <FiltreSelect label="Arrondissement" options={arrondissements} valeur={filtreArrond} onChange={setFiltreArrond} />
          <FiltreSelect
            label="Priorité"
            options={[...toutesPriorites]}
            valeur={filtrePriorite}
            onChange={setFiltrePriorite}
          />
        </div>

        {/* Tableau */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">Agence</th>
                <th className="px-5 py-3">Contact</th>
                <th className="px-5 py-3">Téléphone</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Adresse</th>
                <th className="px-5 py-3">Arr.</th>
                <th className="px-5 py-3">Statut</th>
                <th className="px-5 py-3">Priorité</th>
                <th className="px-5 py-3">Prochaine relance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lignesPage.map((p, i) => {
                // Teinte de la ligne selon la couleur de l'état du prospect (comme dans le Sheet).
                const cleCouleur = statuts.find((s) => s.libelle === p.statut)?.couleur
                // Gris/slate (Nouveau prospect, Injoignable…) → on laisse blanc.
                const teinte =
                  cleCouleur && cleCouleur !== "slate" ? palette[cleCouleur].dot + "66" : undefined
                return (
                <tr
                  key={p.id ?? i}
                  onClick={() => setModal({ mode: "edit", prospect: p })}
                  style={teinte ? { backgroundColor: teinte } : undefined}
                  className="cursor-pointer transition-colors hover:brightness-95"
                >
                  <td className="px-5 py-3 font-medium text-slate-800">{p.entreprise}</td>
                  <td className="px-5 py-3 text-slate-600">{p.contact}</td>
                  <td className="px-5 py-3 text-slate-600">{p.telephone}</td>
                  <td className="px-5 py-3 text-slate-500">{p.email}</td>
                  <td className="px-5 py-3 text-slate-600">{p.adresse}</td>
                  <td className="px-5 py-3 text-slate-600">{p.arrondissement}</td>
                  <td className="px-5 py-3">
                    <button
                      onClick={(e) => ouvrirMenu(e, p, "statut")}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-80 ${classePastille(p.statut, statuts)}`}
                    >
                      {p.statut}
                      <ChevronDown size={12} className="opacity-60" />
                    </button>
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={(e) => ouvrirMenu(e, p, "priorite")}
                      className={`inline-flex items-center gap-1 font-medium transition-opacity hover:opacity-80 ${couleursPriorite[p.priorite]}`}
                    >
                      {p.priorite}
                      <ChevronDown size={12} className="opacity-60" />
                    </button>
                  </td>
                  <td className="px-5 py-3 text-slate-500">{p.prochaineRelance}</td>
                </tr>
                )
              })}
              {lignes.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-sm text-slate-400">
                    Aucun prospect ne correspond.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pied + pagination */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
          <span>
            {lignes.length.toLocaleString("fr-FR")} prospect{lignes.length > 1 ? "s" : ""} trouvé
            {lignes.length > 1 ? "s" : ""} sur {data.length.toLocaleString("fr-FR")}
          </span>
          {pageMax > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={pageSure === 0}
                className="rounded-lg border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                ← Précédent
              </button>
              <span className="text-xs">
                Page {pageSure + 1} / {pageMax + 1}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pageMax, p + 1))}
                disabled={pageSure === pageMax}
                className="rounded-lg border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                Suivant →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
