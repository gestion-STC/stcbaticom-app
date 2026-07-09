import { Search, Phone, Bell, Plus, ChevronDown } from "lucide-react"
import { commercial } from "../data"

export default function Topbar() {
  return (
    <header className="flex items-center justify-between gap-4 px-8 pt-7 pb-2">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          Bonjour {commercial.prenom} <span className="text-2xl">👋</span>
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Voici ce qui se passe aujourd'hui.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700">
          <Plus size={17} strokeWidth={2.3} />
          Ajouter un prospect
        </button>

        <button className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50">
          <Search size={18} />
        </button>
        <button className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50">
          <Phone size={18} />
        </button>
        <button className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50">
          <Bell size={18} />
          <span className="absolute -right-1 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            3
          </span>
        </button>

        <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">
          Mercredi 21 Juin 2024
          <ChevronDown size={16} className="text-slate-400" />
        </button>

        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500 text-sm font-semibold text-white">
          {commercial.initiales}
        </div>
      </div>
    </header>
  )
}
