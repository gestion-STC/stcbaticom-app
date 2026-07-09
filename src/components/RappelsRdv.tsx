import { useEffect, useRef, useState } from "react"
import { Clock, Phone, Check, X } from "lucide-react"
import type { Rdv } from "../rdv"
import { supabaseConfigure } from "../lib/supabase"
import { chargerRdv, majRdvFait } from "../lib/rdvDb"

function dateAujourdhui(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
function minutes(heure: string): number {
  const [h, m] = heure.split(":").map(Number)
  return h * 60 + (m || 0)
}

// Rappels de RDV : bannière flottante quand l'heure d'un RDV approche.
// Fenêtre d'affichage : de 5 min avant à 20 min après l'heure du RDV.
export default function RappelsRdv() {
  const [rdvs, setRdvs] = useState<Rdv[]>([])
  const [now, setNow] = useState(() => new Date())
  const [ignores, setIgnores] = useState<Set<string>>(new Set())
  // RDV déjà signalés par une notification navigateur (pour ne pas répéter).
  const notifiesRef = useRef<Set<string>>(new Set())

  function recharger() {
    if (!supabaseConfigure) return
    chargerRdv()
      .then((rows) => setRdvs(rows.filter((r) => !r.fait)))
      .catch(() => {})
  }

  useEffect(() => {
    recharger()
    // Demande l'autorisation d'afficher des notifications (une seule fois).
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {})
    }
    const idR = setInterval(recharger, 60000)
    const idT = setInterval(() => setNow(new Date()), 30000)
    return () => {
      clearInterval(idR)
      clearInterval(idT)
    }
  }, [])

  const today = dateAujourdhui(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const actifs = rdvs.filter((r) => {
    if (r.date !== today || (r.id && ignores.has(r.id))) return false
    const rm = minutes(r.heure)
    return nowMin >= rm - 5 && nowMin <= rm + 20
  })

  // Notification navigateur : une seule fois par RDV, dès qu'il entre dans sa fenêtre.
  const cleActifs = actifs.map((r) => r.id).join(",")
  useEffect(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return
    actifs.forEach((r) => {
      if (r.id && !notifiesRef.current.has(r.id)) {
        notifiesRef.current.add(r.id)
        const n = new Notification(`Rappel RDV — ${r.heure}`, {
          body: `${r.entreprise}${r.telephone ? " · " + r.telephone : ""}`,
          tag: r.id,
        })
        n.onclick = () => {
          window.focus()
          n.close()
        }
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleActifs])

  if (actifs.length === 0) return null

  function ignorer(id?: string) {
    if (!id) return
    setIgnores((s) => new Set(s).add(id))
  }
  function marquerFait(r: Rdv) {
    if (r.id) {
      majRdvFait(r.id, true).catch(() => {})
      setRdvs((arr) => arr.filter((x) => x.id !== r.id))
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-[80] flex w-80 flex-col gap-2">
      {actifs.map((r) => (
        <div
          key={r.id}
          className="rounded-xl border border-emerald-300 bg-white p-3 shadow-lg"
        >
          <div className="flex items-start gap-2">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <Clock size={17} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">
                RDV de {r.heure}
              </p>
              <p className="truncate text-sm text-slate-600">{r.entreprise}</p>
              {r.note && <p className="truncate text-xs text-slate-400">{r.note}</p>}
            </div>
            <button
              onClick={() => ignorer(r.id)}
              className="text-slate-300 hover:text-slate-500"
              title="Ignorer"
            >
              <X size={16} />
            </button>
          </div>
          <div className="mt-2 flex gap-2">
            <a
              href={`tel:${(r.telephone ?? "").replace(/\s/g, "")}`}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
            >
              <Phone size={14} /> Appeler
            </a>
            <button
              onClick={() => marquerFait(r)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              <Check size={14} /> Fait
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
