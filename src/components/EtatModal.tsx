import { useState } from "react"
import { X } from "lucide-react"
import {
  palette,
  clesCouleurs,
  categories,
  type Statut,
  type CleCouleur,
  type Categorie,
} from "../statuts"

export default function EtatModal({
  etat,
  ordreParDefaut,
  onClose,
  onSave,
}: {
  etat: Statut | null // null = création
  ordreParDefaut: number
  onClose: () => void
  onSave: (s: Statut) => void
}) {
  const [f, setF] = useState<Statut>(
    etat ?? {
      libelle: "",
      couleur: "blue",
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
            <span className="text-xs font-medium text-slate-500">Couleur</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {clesCouleurs.map((c) => (
                <button
                  key={c}
                  onClick={() => set("couleur", c as CleCouleur)}
                  className={
                    "h-7 w-7 rounded-full border-2 " +
                    (c === f.couleur ? "border-slate-900" : "border-transparent")
                  }
                  style={{ backgroundColor: palette[c].dot }}
                  title={palette[c].label}
                />
              ))}
            </div>
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
