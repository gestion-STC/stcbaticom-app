import { useEffect, useMemo, useState } from "react"
import { Phone, Plus, Trash2, Loader2, Check, ShieldCheck, Pause, Play, AlertTriangle } from "lucide-react"
import {
  chargerNumerosComplet,
  enregistrerNumerosComplet,
  normaliser,
  compterAppelsParNumero,
  type NumeroEmission,
} from "../lib/numerosEmission"
import { chargerProspects } from "../lib/prospectsDb"
import { chargerAppelsDuJour } from "../lib/appelsDb"
import { lireParametre, ecrireParametre } from "../lib/parametresDb"
import { supabaseConfigure } from "../lib/supabase"
import BandeauErreur from "./BandeauErreur"

const QUOTA_DEFAUT = 100 // appels/jour/numéro recommandés pour rester sous le radar « spam »

export default function NumerosManager() {
  const [numeros, setNumeros] = useState<NumeroEmission[]>([])
  const [saisie, setSaisie] = useState("")
  const [chargement, setChargement] = useState(true)
  const [enregistre, setEnregistre] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  // Jauge d'usage : appels passés AUJOURD'HUI par numéro (clé = chiffres du numéro).
  const [usage, setUsage] = useState<Map<string, number>>(new Map())
  const [quota, setQuota] = useState(QUOTA_DEFAUT)

  useEffect(() => {
    if (!supabaseConfigure) {
      setChargement(false)
      return
    }
    chargerNumerosComplet()
      .then(setNumeros)
      .catch((e) => setErreur(e instanceof Error ? e.message : "Erreur inconnue"))
      .finally(() => setChargement(false))
    lireParametre("quota_appels_jour")
      .then((v) => {
        const n = Number(v)
        if (Number.isFinite(n) && n >= 10) setQuota(n)
      })
      .catch(() => {})
    // Usage du jour : journal d'appels + numéro attribué à chaque prospect appelé.
    // Rafraîchi toutes les 60 s (la jauge avance pendant tes sessions).
    const majUsage = () =>
      Promise.all([chargerAppelsDuJour(), chargerProspects()])
        .then(([appels, prospects]) =>
          // Seuls les appels SORTANTS consomment un numéro d'émission (un entrant ne « spamme » pas).
          setUsage(compterAppelsParNumero(appels.filter((a) => a.sens !== "entrant"), prospects)),
        )
        .catch(() => {})
    majUsage()
    const iv = setInterval(majUsage, 60000)
    return () => clearInterval(iv)
  }, [])

  async function sauver(liste: NumeroEmission[]) {
    setNumeros(liste)
    try {
      await enregistrerNumerosComplet(liste)
      setEnregistre(true)
      setTimeout(() => setEnregistre(false), 1500)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Enregistrement impossible")
    }
  }

  function ajouter() {
    const n = saisie.trim()
    if (!n) return
    // Évite le doublon (comparaison sur les chiffres).
    if (numeros.some((x) => normaliser(x.numero) === normaliser(n))) {
      setSaisie("")
      return
    }
    sauver([...numeros, { numero: n, pause: false }])
    setSaisie("")
  }

  function retirer(numero: string) {
    sauver(numeros.filter((x) => x.numero !== numero))
  }

  // Met en pause / réactive un numéro (le retire / le remet dans la rotation, sans le supprimer).
  function basculerPause(numero: string) {
    sauver(numeros.map((x) => (x.numero === numero ? { ...x, pause: !x.pause } : x)))
  }

  function changerQuota(v: string) {
    const n = Math.max(10, Math.min(500, Number(v) || QUOTA_DEFAUT))
    setQuota(n)
    ecrireParametre("quota_appels_jour", String(n)).catch(() => {})
  }

  const nbActifs = numeros.filter((n) => !n.pause).length
  // Numéros actifs ayant atteint le seuil du jour (à mettre en pause).
  const auSeuil = useMemo(
    () => numeros.filter((n) => !n.pause && (usage.get(normaliser(n.numero)) ?? 0) >= quota),
    [numeros, usage, quota],
  )

  return (
    <div className="px-8 pb-10">
      {erreur && <BandeauErreur message={erreur} />}

      {/* MÉMO ANTI-SPAM — en tête de l'écran des numéros */}
      <div className="mb-5 overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50 px-5 py-3">
          <ShieldCheck size={18} className="shrink-0 text-emerald-600" />
          <h2 className="text-sm font-semibold text-emerald-900">Mémo anti-spam — garde tes numéros « propres »</h2>
        </div>
        <div className="space-y-3 px-5 py-4 text-sm text-slate-700">
          <p className="leading-relaxed">
            Avec 300 appels/jour, un numéro seul se fait vite signaler « spam » (les prospects voient
            « spam » et décrochent moins). Le logiciel <b>répartit tes appels sur plusieurs numéros</b> :
            chaque prospect garde <b>toujours le même numéro</b> (il te reconnaît), et le volume se
            répartit pour qu'<b>aucun numéro ne dépasse le seuil « spam »</b>.
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-relaxed">
              <p className="font-semibold text-slate-800">🔄 Plusieurs numéros</p>
              Aie <b>2-3 numéros ou plus</b> ici → plus tu en as, mieux le volume se répartit (chacun reste sous le seuil).
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-relaxed">
              <p className="font-semibold text-slate-800">⏱️ Espace les rappels</p>
              Attends <b>1-2 min</b> avant de rerappeler un même numéro. Évite les appels <b>très courts répétés</b> (signal spam n°1).
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-relaxed">
              <p className="font-semibold text-slate-800">📩 Sois « légitime »</p>
              Laisse un <b>message vocal clair</b> (nom + STC + objet), et <b>rappelle les appels manqués</b> → usage normal aux yeux des opérateurs.
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-relaxed">
              <p className="font-semibold text-slate-800">👀 Surveille</p>
              La <b>jauge sous chaque numéro</b> montre son usage du jour. À 100 % → <b>mets-le en pause</b> jusqu'à demain.
            </div>
          </div>

          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
            ⚠️ <b>Important :</b> n'ajoute ci-dessous que des numéros <b>attribués à TON utilisateur</b> dans
            Ringover (Utilisateurs → ta fiche). Un numéro attribué à un collègue ferait sonner <b>son</b>
            téléphone à ta place — l'appel semblerait ne jamais partir.
          </p>
        </div>
      </div>

      {/* Alerte globale : numéro(s) au seuil */}
      {auSeuil.length > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-3">
          <AlertTriangle size={18} className="shrink-0 text-red-600" />
          <p className="text-sm text-red-800">
            <b>{auSeuil.map((n) => n.numero).join(", ")}</b> {auSeuil.length > 1 ? "ont" : "a"} atteint
            les {quota} appels aujourd'hui — mets-{auSeuil.length > 1 ? "les" : "le"} en pause jusqu'à demain.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Phone size={16} className="text-blue-600" /> Mes numéros d'émission
          </h3>
          <div className="flex items-center gap-2">
            {enregistre && (
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                <Check size={14} /> Enregistré
              </span>
            )}
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              Seuil / jour / numéro :
              <input
                type="number"
                min={10}
                max={500}
                value={quota}
                onChange={(e) => setQuota(Number(e.target.value) || 0)}
                onBlur={(e) => changerQuota(e.target.value)}
                className="w-16 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 outline-none focus:border-blue-400"
              />
              appels
            </label>
          </div>
        </div>

        {/* Ajout */}
        <div className="mb-4 flex gap-2">
          <input
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ajouter()}
            placeholder="+33 1 84 80 77 86"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
          <button
            onClick={ajouter}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Plus size={16} /> Ajouter
          </button>
        </div>

        {/* Liste */}
        {chargement ? (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" /> Chargement…
          </div>
        ) : numeros.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            Aucun numéro pour l'instant. Ajoute ton premier numéro ci-dessus.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {numeros.map((n) => {
              const compte = usage.get(normaliser(n.numero)) ?? 0
              const pct = quota > 0 ? Math.min(100, Math.round((compte / quota) * 100)) : 0
              const plein = compte >= quota
              const barre = plein ? "bg-red-500" : pct >= 70 ? "bg-amber-400" : "bg-emerald-500"
              const texteJauge = plein ? "text-red-600 font-semibold" : pct >= 70 ? "text-amber-600" : "text-slate-400"
              return (
                <li key={n.numero} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`flex items-center gap-2 font-medium ${n.pause ? "text-slate-400" : "text-slate-700"}`}
                    >
                      <span className={`text-base ${n.pause ? "opacity-40" : ""}`}>🇫🇷</span>
                      <span className={n.pause ? "line-through" : ""}>{n.numero}</span>
                      {n.pause && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          En pause
                        </span>
                      )}
                      {!n.pause && plein && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                          Seuil atteint
                        </span>
                      )}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => basculerPause(n.numero)}
                        title={n.pause ? "Remettre dans la rotation" : "Mettre en pause (garde le numéro, ne l'utilise plus)"}
                        className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                          n.pause
                            ? "text-emerald-600 hover:bg-emerald-50"
                            : plein
                              ? "animate-pulse rounded-md bg-red-600 text-white hover:bg-red-700"
                              : "text-amber-600 hover:bg-amber-50"
                        }`}
                      >
                        {n.pause ? <Play size={14} /> : <Pause size={14} />}
                        {n.pause ? "Réactiver" : "Pause"}
                      </button>
                      <button
                        onClick={() => retirer(n.numero)}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={14} /> Retirer
                      </button>
                    </div>
                  </div>
                  {/* Jauge d'usage du jour (appels passés aujourd'hui avec ce numéro) */}
                  {!n.pause && (
                    <div className="mt-1.5 flex items-center gap-2 pl-7">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full transition-all ${barre}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className={`shrink-0 text-[11px] tabular-nums ${texteJauge}`}>
                        {compte} / {quota} aujourd'hui
                      </span>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {!chargement && nbActifs <= 1 && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            💡 {nbActifs === 0
              ? "Aucun numéro actif : ajoute-en (ou réactive un numéro en pause) pour pouvoir appeler."
              : "Avec un seul numéro actif, il n'y a pas de rotation. Ajoute-en 2 ou 3 (ou réactive) pour répartir tes appels et éviter le « spam »."}
          </p>
        )}
        {numeros.some((n) => n.pause) && (
          <p className="mt-2 text-xs text-slate-400">
            Les numéros « en pause » restent enregistrés mais ne sont plus utilisés pour appeler.
            Leurs prospects sont <b>bloqués</b> (jamais appelés avec un autre numéro) jusqu'à la
            réactivation — ou réattribution consciente depuis leur fiche en session.
          </p>
        )}
      </div>
    </div>
  )
}
