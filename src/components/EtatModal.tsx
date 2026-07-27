import { useState } from "react"
import { X } from "lucide-react"
import {
  palette,
  clesCouleurs,
  categories,
  couleursPrises,
  type Statut,
  type CleCouleur,
  type Categorie,
} from "../statuts"

export default function EtatModal({
  etat,
  etats,
  ordreParDefaut,
  onClose,
  onSave,
}: {
  etat: Statut | null // null = création
  etats: Statut[] // tous les états existants (pour repérer les couleurs déjà prises)
  ordreParDefaut: number
  onClose: () => void
  onSave: (s: Statut) => void
}) {
  // Couleur déjà utilisée par un AUTRE état → on la bloque, pour ne pas avoir deux
  // états de la même couleur (impossible à distinguer dans les listes).
  // La couleur de l'état qu'on est en train de modifier reste évidemment sélectionnable.
  const prisePar = couleursPrises(etats, etat)
  const couleursLibres = clesCouleurs.filter((c) => !prisePar.has(c))

  const [f, setF] = useState<Statut>(
    etat ?? {
      libelle: "",
      // À la création : on propose d'emblée une couleur encore libre.
      couleur: (couleursLibres[0] ?? "slate") as CleCouleur,
      ordre: ordreParDefaut,
      estObjectif: false,
      categorie: "Prospection",
      relanceJours: null,
    },
  )
  const set = (champ: keyof Statut, v: unknown) =>
    setF((p) => ({ ...p, [champ]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            {etat ? "Modifier l'état" : "Nouvel état"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {/* Nom */}
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Nom de l'état</span>
            <input
              value={f.libelle}
              onChange={(e) => set("libelle", e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          {/* Couleur */}
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium text-slate-500">Couleur</span>
              <span className="text-[11px] text-slate-400">
                {couleursLibres.length} libre{couleursLibres.length > 1 ? "s" : ""} sur {clesCouleurs.length}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {clesCouleurs.map((c) => {
                const pris = prisePar.get(c)
                const choisie = c === f.couleur
                return (
                  <button
                    key={c}
                    onClick={() => !pris && set("couleur", c as CleCouleur)}
                    disabled={Boolean(pris)}
                    className={
                      "relative h-7 w-7 rounded-full border-2 " +
                      (choisie ? "border-slate-900 " : "border-transparent ") +
                      (pris ? "cursor-not-allowed " : "hover:scale-110 ") +
                      // Une couleur prise est estompée, SAUF si c'est celle de l'état
                      // en cours (sinon elle paraîtrait à la fois choisie et désactivée).
                      (pris && !choisie ? "opacity-25" : "")
                    }
                    style={{ backgroundColor: palette[c].dot }}
                    title={pris ? `${palette[c].label} — déjà pris par « ${pris} »` : palette[c].label}
                  >
                    {/* Barre oblique : cette couleur est déjà attribuée à un autre état */}
                    {pris && !choisie && (
                      <span className="pointer-events-none absolute left-1/2 top-1/2 h-[2px] w-[26px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded bg-slate-900" />
                    )}
                  </button>
                )
              })}
            </div>
            {prisePar.has(f.couleur) ? (
              <p className="mt-2 text-[11px] text-amber-600">
                Cette couleur est aussi celle de « {prisePar.get(f.couleur)} » — choisissez-en une libre
                pour bien distinguer les deux états.
              </p>
            ) : couleursLibres.length === 0 ? (
              <p className="mt-2 text-[11px] text-amber-600">
                Toutes les couleurs sont utilisées. Libérez-en une en changeant la couleur d'un autre état.
              </p>
            ) : (
              <p className="mt-2 text-[11px] text-slate-400">
                Les couleurs barrées sont déjà prises par un autre état.
              </p>
            )}
          </div>

          {/* Catégorie */}
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Catégorie</span>
            <select
              value={f.categorie}
              onChange={(e) => set("categorie", e.target.value as Categorie)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">— Aucune —</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>

          {/* Délai de relance auto */}
          <label className="block">
            <span className="text-xs font-medium text-slate-500">
              Relance automatique après (jours)
            </span>
            <span className="mt-0.5 block text-[11px] text-slate-400">
              Pose une date de relance à J+X quand un prospect entre dans cet état (apparaît dans
              « À relancer » + le Calendrier). N'envoie pas d'email. Vide = aucune.
            </span>
            <input
              type="number"
              min={0}
              value={f.relanceJours ?? ""}
              onChange={(e) =>
                set("relanceJours", e.target.value === "" ? null : Number(e.target.value))
              }
              placeholder="ex. 3"
              className="mt-1 w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          {/* Objectif */}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={f.estObjectif}
              onChange={(e) => set("estObjectif", e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm text-slate-700">
              Objectif atteint (ex. « Demande d'OS envoyée »)
            </span>
          </label>

          {/* Aperçu */}
          <div>
            <span className="text-xs font-medium text-slate-500">Aperçu</span>
            <div className="mt-1">
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${palette[f.couleur].pill}`}
              >
                {f.libelle || "Nom de l'état"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Annuler
          </button>
          <button
            onClick={() => onSave(f)}
            disabled={!f.libelle.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}
