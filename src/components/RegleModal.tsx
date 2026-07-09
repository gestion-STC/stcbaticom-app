import { useState } from "react"
import { X } from "lucide-react"
import { type Statut } from "../statuts"
import type { Email } from "../emails"
import { joursLabels } from "../creneaux"
import { regleVide, type Regle } from "../regles"

export default function RegleModal({
  regle,
  statuts,
  emails,
  types,
  arrondissements,
  onClose,
  onSave,
}: {
  regle: Regle | null
  statuts: Statut[]
  emails: Email[]
  types: string[]
  arrondissements: string[]
  onClose: () => void
  onSave: (r: Regle) => void
}) {
  const [f, setF] = useState<Regle>(
    regle ?? regleVide(statuts[0]?.id ?? "", emails[0]?.id ?? ""),
  )
  const set = (champs: Partial<Regle>) => setF((p) => ({ ...p, ...champs }))
  const champ =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"

  function basculerJour(n: number) {
    set({ jours: f.jours.includes(n) ? f.jours.filter((j) => j !== n) : [...f.jours, n].sort() })
  }

  const Section = ({ titre, children }: { titre: string; children: React.ReactNode }) => (
    <div className="border-t border-slate-100 pt-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{titre}</p>
      {children}
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            {regle ? "Modifier la règle" : "Nouvelle règle"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {/* Déclencheur + email */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Quand le prospect passe à</span>
              <select value={f.etatId} onChange={(e) => set({ etatId: e.target.value })} className={champ}>
                {statuts.map((s) => (
                  <option key={s.id} value={s.id}>{s.libelle}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Envoyer l'email</span>
              <select value={f.emailId} onChange={(e) => set({ emailId: e.target.value })} className={champ}>
                {emails.map((em) => (
                  <option key={em.id} value={em.id}>{em.nom}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Délai */}
          <Section titre="Délai">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={f.delaiValeur}
                onChange={(e) => set({ delaiValeur: Number(e.target.value) || 0 })}
                className="w-20 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              <select value={f.delaiUnite} onChange={(e) => set({ delaiUnite: e.target.value as Regle["delaiUnite"] })} className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm">
                <option value="heures">heures</option>
                <option value="jours">jours</option>
              </select>
              <select value={f.delaiSens} onChange={(e) => set({ delaiSens: e.target.value as Regle["delaiSens"] })} className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm">
                <option value="apres">après</option>
                <option value="avant">avant</option>
              </select>
            </div>
          </Section>

          {/* Plage horaire */}
          <Section titre="Plage horaire d'envoi (optionnel)">
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span>entre</span>
              <input type="time" value={f.heureMin} onChange={(e) => set({ heureMin: e.target.value })} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" />
              <span>et</span>
              <input type="time" value={f.heureMax} onChange={(e) => set({ heureMax: e.target.value })} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" />
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              {joursLabels.map((j, k) => {
                const actif = f.jours.includes(j.num)
                return (
                  <button
                    key={k}
                    onClick={() => basculerJour(j.num)}
                    className={
                      "flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium " +
                      (actif ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200")
                    }
                  >
                    {j.court}
                  </button>
                )
              })}
              <span className="ml-1 text-xs text-slate-400">(aucun = tous les jours)</span>
            </div>
          </Section>

          {/* Ciblage */}
          <Section titre="Cibler un segment (optionnel)">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-slate-500">Type</span>
                <select value={f.filtreType} onChange={(e) => set({ filtreType: e.target.value })} className={champ}>
                  <option value="">Tous</option>
                  {types.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-500">Arrondissement</span>
                <select value={f.filtreArrondissement} onChange={(e) => set({ filtreArrondissement: e.target.value })} className={champ}>
                  <option value="">Tous</option>
                  {arrondissements.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </label>
            </div>
          </Section>

          {/* Relance multiple */}
          <Section titre="Relance multiple (optionnel)">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={f.repeter} onChange={(e) => set({ repeter: e.target.checked })} className="h-4 w-4" />
              <span className="text-sm text-slate-700">Renvoyer si pas de réponse</span>
            </label>
            {f.repeter && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span>jusqu'à</span>
                <input type="number" min={1} value={f.repeterMax} onChange={(e) => set({ repeterMax: Number(e.target.value) || 0 })} className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                <span>fois, tous les</span>
                <input type="number" min={1} value={f.repeterIntervalle} onChange={(e) => set({ repeterIntervalle: Number(e.target.value) || 0 })} className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                <span>jours</span>
              </div>
            )}
          </Section>

          <label className="flex items-center gap-2 border-t border-slate-100 pt-4">
            <input type="checkbox" checked={f.actif} onChange={(e) => set({ actif: e.target.checked })} className="h-4 w-4" />
            <span className="text-sm text-slate-700">Règle active</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            Annuler
          </button>
          <button
            onClick={() => onSave(f)}
            disabled={!f.etatId || !f.emailId}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}
