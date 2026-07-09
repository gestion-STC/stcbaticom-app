import { useState } from "react"
import { X, CalendarPlus, Send, Handshake, Undo2, Trash2, Loader2 } from "lucide-react"
import { palette, type Statut } from "../statuts"
import { toutesPriorites, volumesOs, TYPE_APPORTEUR, estApporteur, type Prospect, type Priorite } from "../data"
import { formaterTelephone } from "../lib/telephone"
import { relanceAutoEntreeEtat } from "../lib/relanceAuto"
import NouveauRdvModal from "./NouveauRdvModal"
import EnvoyerEmailModal from "./EnvoyerEmailModal"
import HistoriqueProspect from "./HistoriqueProspect"
import AgencesProspect from "./AgencesProspect"

// "JJ/MM/AAAA [HH:MM]" <-> "AAAA-MM-JJTHH:MM" (pour l'input date+heure)
function versInputDate(s: string): string {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/)
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4] ?? "09"}:${m[5] ?? "00"}` : ""
}
function depuisInputDate(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : "—"
}

const vide: Prospect = {
  entreprise: "",
  contact: "",
  telephone: "",
  email: "",
  adresse: "",
  arrondissement: "",
  commentaire: "",
  type: "Gestionnaire locatif",
  statut: "Nouveau prospect",
  priorite: "Moyenne",
  prochaineRelance: "—",
}

export default function ProspectModal({
  prospect,
  statuts,
  onClose,
  onSave,
  onDelete,
  contexte = "prospect",
}: {
  prospect: Prospect | null // null = création
  statuts: Statut[]
  onClose: () => void
  onSave: (p: Prospect) => void
  onDelete?: (id: string) => Promise<void> // optionnel : active le bouton Supprimer
  contexte?: "prospect" | "gestionnaire" | "apporteur" // pour le titre de la fiche
}) {
  const motContexte =
    contexte === "gestionnaire" ? "gestionnaire" : contexte === "apporteur" ? "apporteur" : "prospect"
  const [f, setF] = useState<Prospect>(prospect ?? vide)
  const [rdvOuvert, setRdvOuvert] = useState(false)
  const [envoiOuvert, setEnvoiOuvert] = useState(false)
  const [confirmSuppr, setConfirmSuppr] = useState(false)
  const [suppression, setSuppression] = useState(false)

  // Suppression en 2 temps (le bouton ouvre d'abord la barre de confirmation rouge).
  async function supprimer() {
    if (!prospect?.id || !onDelete) return
    setSuppression(true)
    try {
      await onDelete(prospect.id)
      onClose()
    } catch (e) {
      alert("La suppression a échoué : " + (e instanceof Error ? e.message : String(e)))
      setSuppression(false)
    }
  }

  // Ranger / sortir des apporteurs d'affaires : on bascule l'étiquette `type`
  // et on enregistre tout de suite (la fiche change alors d'onglet).
  function basculerApporteur() {
    const cible = estApporteur(f)
      ? { ...f, type: "Gestionnaire locatif" }
      : { ...f, type: TYPE_APPORTEUR }
    setF(cible)
    onSave(cible)
  }
  const set = (champ: keyof Prospect, v: string) =>
    setF((p) => ({ ...p, [champ]: v }))

  // Couleur de l'état de la fiche (pour teinter le haut). Slate (Nouveau) → pas de teinte.
  const cleCouleurFiche = statuts.find((s) => s.libelle === f.statut)?.couleur
  const accentFiche =
    cleCouleurFiche && cleCouleurFiche !== "slate" ? palette[cleCouleurFiche].dot : null

  const champ = (
    label: string,
    cle: keyof Prospect,
    type = "text",
  ) => (
    <label className="block">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <input
        type={type}
        value={(f[cle] as string) ?? ""}
        onChange={(e) => set(cle, e.target.value)}
        // Le téléphone s'espace tout seul quand on quitte le champ (07 69 81 12 15).
        onBlur={(e) => cle === "telephone" && set(cle, formaterTelephone(e.target.value))}
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      />
    </label>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl"
        style={accentFiche ? { borderTop: `4px solid ${accentFiche}` } : undefined}
      >
        <div
          className="flex items-center justify-between border-b border-slate-100 px-5 py-4"
          style={accentFiche ? { backgroundColor: accentFiche + "22" } : undefined}
        >
          <h2 className="text-base font-semibold text-slate-900">
            {prospect ? `Fiche ${motContexte}` : `Nouveau ${motContexte}`}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 px-5 py-5 sm:grid-cols-2">
          {champ("Agence", "entreprise")}
          {champ("Contact", "contact")}
          {champ("Téléphone", "telephone")}
          {champ("Email", "email", "email")}
          {champ("Adresse", "adresse")}
          {champ("Arrondissement", "arrondissement")}
          {champ("Type", "type")}

          <label className="block">
            <span className="text-xs font-medium text-slate-500">Statut</span>
            <select
              value={f.statut}
              onChange={(e) => {
                const nouveau = e.target.value
                // Si l'état d'arrivée a un délai « J+X » et qu'aucune relance future n'est
                // prévue, on remplit la date de relance (visible ci-dessous, modifiable).
                const relance = relanceAutoEntreeEtat(nouveau, statuts, f.prochaineRelance)
                setF((p) => ({ ...p, statut: nouveau, ...(relance ? { prochaineRelance: relance } : {}) }))
              }}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              {statuts.map((s) => (
                <option key={s.id ?? s.libelle} value={s.libelle}>
                  {s.libelle}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-500">Priorité</span>
            <select
              value={f.priorite}
              onChange={(e) => set("priorite", e.target.value as Priorite)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              {toutesPriorites.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label className="block sm:col-span-2">
            <span className="text-xs font-medium text-slate-500">
              Volume d'OS potentiel
            </span>
            <select
              value={f.volume ?? ""}
              onChange={(e) => set("volume", e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">— Non défini —</option>
              {volumesOs.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>

          <label className="block sm:col-span-2">
            <span className="text-xs font-medium text-slate-500">
              Prochaine relance
            </span>
            <input
              type="datetime-local"
              value={versInputDate(f.prochaineRelance)}
              onChange={(e) =>
                set("prochaineRelance", depuisInputDate(e.target.value))
              }
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="text-xs font-medium text-slate-500">Commentaire</span>
            <textarea
              value={f.commentaire}
              onChange={(e) => set("commentaire", e.target.value)}
              rows={3}
              placeholder="Notes, contexte, ce qui a été dit…"
              className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          {/* Aperçu du statut */}
          <div className="sm:col-span-2">
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                palette[statuts.find((s) => s.libelle === f.statut)?.couleur ?? "slate"].pill
              }`}
            >
              {f.statut}
            </span>
          </div>
        </div>

        {prospect?.id && (
          <div className="border-t border-slate-100 px-5 py-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Agences de ce gestionnaire
            </p>
            <AgencesProspect prospectId={prospect.id} />
          </div>
        )}

        {prospect?.id && (
          <div className="border-t border-slate-100 px-5 py-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Historique des actions
            </p>
            <HistoriqueProspect prospectId={prospect.id} />
          </div>
        )}

        <div className="border-t border-slate-100 px-5 py-4">
          {confirmSuppr ? (
            <div className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-red-800">
                <span className="font-semibold">Supprimer définitivement</span> ce prospect et tout
                son historique (appels, RDV, e-mails) ? C'est <span className="font-semibold">irréversible</span>.
              </p>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => setConfirmSuppr(false)}
                  disabled={suppression}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  onClick={supprimer}
                  disabled={suppression}
                  className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {suppression ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  Oui, supprimer définitivement
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {prospect?.id && (
                  <>
                    <button
                      onClick={() => setRdvOuvert(true)}
                      className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
                    >
                      <CalendarPlus size={16} /> RDV
                    </button>
                    <button
                      onClick={() => setEnvoiOuvert(true)}
                      className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
                    >
                      <Send size={16} /> Email
                    </button>
                    {estApporteur(f) ? (
                      <button
                        onClick={basculerApporteur}
                        title="Remettre cette fiche parmi les gestionnaires"
                        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                      >
                        <Undo2 size={16} /> Remettre en gestionnaire
                      </button>
                    ) : (
                      <button
                        onClick={basculerApporteur}
                        title="Ranger cette fiche dans la base des apporteurs d'affaires"
                        className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100"
                      >
                        <Handshake size={16} /> C'est un apporteur
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => setConfirmSuppr(true)}
                        title="Supprimer ce prospect de la base"
                        className="flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={16} /> Supprimer
                      </button>
                    )}
                  </>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={onClose}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  onClick={() => onSave(f)}
                  disabled={!f.entreprise.trim()}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
                >
                  Enregistrer
                </button>
              </div>
            </div>
          )}
        </div>

        {rdvOuvert && prospect?.id && (
          <NouveauRdvModal
            prospectId={prospect.id}
            entreprise={f.entreprise}
            onClose={() => setRdvOuvert(false)}
          />
        )}

        {envoiOuvert && prospect?.id && (
          <EnvoyerEmailModal
            prospect={{ ...f, id: prospect.id }}
            onClose={() => setEnvoiOuvert(false)}
          />
        )}
      </div>
    </div>
  )
}
