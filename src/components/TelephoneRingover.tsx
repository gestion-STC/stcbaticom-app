import { useEffect, useRef, useState } from "react"
import RingoverSDK from "ringover-sdk"
import { PhoneIncoming, X, User, Building2 } from "lucide-react"
import type { Prospect } from "../data"
import { statutsParDefaut, type Statut } from "../statuts"
import { supabase, supabaseConfigure } from "../lib/supabase"
import { chargerProspects, majProspectComplet } from "../lib/prospectsDb"
import { chargerStatuts } from "../lib/statutsDb"
import { appelsEntrantsRingover, detailAppelRingover } from "../lib/ringover"
import { cleComparaison, formaterTelephone } from "../lib/telephone"
import { marquerEntrantActif } from "../lib/appelEntrantActif"
import { enregistrerAppel } from "../lib/appelsDb"
import ProspectModal from "./ProspectModal"

// Téléphone Ringover embarqué + détection des appels ENTRANTS.
//
// 1) Le SDK Ringover monte le VRAI téléphone Ringover en iframe (bas-droite, WebRTC) :
//    tu décroches DANS le logiciel, l'audio passe par le navigateur.
// 2) Détection de qui appelle, par 3 sources complémentaires (la 1re qui répond gagne,
//    les suivantes « améliorent » la bannière si elles apportent un meilleur numéro) :
//    a. WEBHOOK Ringover (temps réel, vrai numéro) : Ringover pousse l'événement dans la
//       table « appels_entrants », qu'on écoute via Supabase Realtime. Source idéale.
//    b. SONDAGE toutes les 5 s de /calls/current (filet de secours si le webhook n'est
//       pas configuré) — peut renvoyer le numéro masqué (« Unknown »).
//    c. DÉTAIL de l'appel (par call_id) : si le numéro est arrivé masqué, on le récupère
//       via le relevé d'appel (souvent renseigné) et la bannière se corrige toute seule.
export default function TelephoneRingover() {
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [statuts, setStatuts] = useState<Statut[]>(statutsParDefaut)
  // Appel entrant à signaler (bannière) + fiche éventuellement ouverte.
  const [entrant, setEntrant] = useState<{ callId: string; from: string; prospect: Prospect | null } | null>(null)
  const [fiche, setFiche] = useState<Prospect | null>(null)
  const [ficheOuverte, setFicheOuverte] = useState(false)

  // call_id déjà signalés → ce qu'on savait (prospect reconnu ? numéro exploitable ?).
  // Permet la « mise à niveau » : si une source plus précise arrive après coup
  // (ex. le détail dévoile un numéro d'abord masqué), on corrige au lieu d'ignorer.
  const traitesRef = useRef<Map<string, { prospect: Prospect | null; from: string }>>(new Map())
  const resolutionsRef = useRef<Set<string>>(new Set()) // résolutions de numéro masqué en cours
  const journalisesRef = useRef<Set<string>>(new Set()) // appels entrants déjà écrits au journal
  const prospectsRef = useRef<Prospect[]>([])
  prospectsRef.current = prospects
  const sdkRef = useRef<RingoverSDK | null>(null)

  // Si le numéro est arrivé masqué, tente de le récupérer via le relevé d'appel
  // (jusqu'à ~1 min : le relevé se remplit souvent pendant/juste après l'appel).
  async function resoudreNumeroMasque(callId: string) {
    if (resolutionsRef.current.has(callId)) return
    resolutionsRef.current.add(callId)
    for (let i = 0; i < 10; i++) {
      const det = await detailAppelRingover(callId)
      const num = det.ok ? String(det.from || "") : ""
      if (cleComparaison(num).length >= 6) {
        signalerRef.current(num, callId) // mise à niveau de la bannière
        return
      }
      await new Promise((r) => setTimeout(r, 6000))
    }
  }

  // Traite un appel entrant : reconnaît l'appelant et affiche/corrige la bannière.
  // Placé dans une ref pour rester à jour sans réabonner les écouteurs à chaque rendu.
  const signalerRef = useRef<(from: string, callId: string) => void>(() => {})
  signalerRef.current = (from, callId) => {
    if (!callId) return
    // On compare via une clé qui ignore le format (33… vs 0…) : l'appelant Ringover
    // arrive en « 33783092347 », le prospect est stocké en « 07 83 09 23 47 ».
    const cleAppelant = cleComparaison(from)
    const utilisable = cleAppelant.length >= 6 // faux si masqué ("Unknown", vide…)
    const prospect = utilisable
      ? prospectsRef.current.find((p) => cleComparaison(p.telephone) === cleAppelant) ?? null
      : null

    const precedent = traitesRef.current.get(callId)
    const deja = precedent !== undefined
    if (deja) {
      // Cet appel a déjà été signalé : on ne refait quelque chose QUE si on apporte
      // du neuf (un prospect reconnu, ou un vrai numéro là où c'était masqué).
      const avaitProspect = Boolean(precedent.prospect)
      const avaitNumero = cleComparaison(precedent.from).length >= 6
      const apporteProspect = Boolean(prospect) && !avaitProspect
      const apporteNumero = utilisable && !avaitNumero
      if (avaitProspect || (!apporteProspect && !apporteNumero)) return
    }

    traitesRef.current.set(callId, { prospect, from })
    // Purge : on borne la taille de l'historique anti-répétition.
    if (traitesRef.current.size > 100) {
      traitesRef.current = new Map(Array.from(traitesRef.current.entries()).slice(-50))
    }

    if (!deja) {
      // Nouvel appel → bannière (le téléphone Ringover reste libre pour décrocher).
      setEntrant({ callId, from, prospect })
    } else {
      // Mise à niveau : on corrige la bannière SI c'est encore celle de cet appel
      // (on ne rouvre pas une bannière que l'utilisateur a fermée).
      setEntrant((prev) => (prev && prev.callId === callId ? { callId, from, prospect } : prev))
    }

    // Journalise l'appel ENTRANT dans l'historique du prospect reconnu (une seule fois
    // par appel). On n'écrit rien pour un numéro inconnu (pas de fiche où l'attacher).
    if (prospect?.id && !journalisesRef.current.has(callId)) {
      journalisesRef.current.add(callId)
      if (journalisesRef.current.size > 200) {
        journalisesRef.current = new Set(Array.from(journalisesRef.current).slice(-100))
      }
      enregistrerAppel(prospect.id, "Appel entrant", "", "entrant").catch(() => {})
    }

    // Numéro masqué mais call_id connu → on tente de récupérer le vrai numéro.
    if (!utilisable) void resoudreNumeroMasque(callId)

    // Notification navigateur (marche même sur un autre onglet). Le tag=callId fait
    // que la mise à niveau REMPLACE la notification au lieu d'en empiler une 2e.
    if (!deja || prospect) {
      try {
        if ("Notification" in window && Notification.permission === "granted") {
          const nom = prospect?.entreprise || (utilisable ? formaterTelephone(from) || from : "Numéro masqué")
          new Notification("📞 Appel entrant", { body: nom, tag: callId })
        }
      } catch {
        /* notif indisponible */
      }
    }
  }

  // Charge prospects + états, et rafraîchit les prospects régulièrement (nouveaux numéros).
  useEffect(() => {
    if (!supabaseConfigure) return
    const charger = () => chargerProspects().then(setProspects).catch(() => {})
    charger()
    chargerStatuts().then((r) => r.length && setStatuts(r)).catch(() => {})
    const maj = setInterval(charger, 120000) // toutes les 2 min
    // Autorisation notifications navigateur (une fois).
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {})
    }
    return () => clearInterval(maj)
  }, [])

  // Monte le téléphone Ringover (iframe) pour décrocher / appeler dans le logiciel.
  useEffect(() => {
    if (!supabaseConfigure) return
    let sdk: RingoverSDK | null = null
    try {
      sdk = new RingoverSDK({
        size: "medium",
        position: { bottom: "16px", right: "16px" },
        trayposition: { bottom: "16px", right: "16px" },
        animation: true,
      })
      const iframeEl = sdk.generate()
      sdk.hide() // on ne montre que la pastille ; le panneau s'ouvre à la sonnerie ou au clic
      sdkRef.current = sdk
      // Transforme la minuscule barre grise du haut en vrai bouton « ▾ Réduire » visible.
      if (iframeEl && typeof iframeEl !== "boolean") {
        try {
          const id = iframeEl.id.replace("ringover-iframe-", "")
          const pastille = document.getElementById("ringover-cross-" + id)
          const barre = pastille?.parentElement
          if (pastille && barre) {
            barre.style.height = "30px"
            barre.style.cursor = "pointer"
            barre.title = "Réduire le téléphone"
            barre.onclick = () => sdkRef.current?.hide()
            pastille.textContent = "▾ Réduire"
            pastille.style.width = "auto"
            pastille.style.height = "auto"
            pastille.style.padding = "4px 14px"
            pastille.style.background = "#eef2f7"
            pastille.style.borderRadius = "9px"
            pastille.style.fontSize = "12px"
            pastille.style.fontWeight = "600"
            pastille.style.color = "#475569"
            const conteneur = barre.parentElement
            if (conteneur) conteneur.style.paddingTop = "30px"
          }
        } catch {
          /* si l'habillage échoue, la barre d'origine reste utilisable */
        }
      }
      // Événement d'appel du SDK : bonus s'il se déclenche un jour (non fiable à ce
      // stade — la détection repose sur le webhook + le sondage, pas sur lui).
      sdk.on("ringingCall", (e) => {
        const d = e?.data
        if (d && String(d.direction).toLowerCase() === "in") {
          marquerEntrantActif()
          signalerRef.current(d.from_number, String(d.call_id))
        }
      })
    } catch {
      /* SDK indisponible : la détection webhook + sondage continue de fonctionner */
    }
    return () => {
      try {
        sdk?.off()
        sdk?.destroy()
      } catch {
        /* rien */
      }
      sdkRef.current = null
    }
  }, [])

  // SOURCE PRINCIPALE : webhook Ringover → table « appels_entrants » → temps réel.
  // (Si la table/le webhook ne sont pas encore en place, il ne se passe rien — le
  // sondage ci-dessous prend le relais.)
  useEffect(() => {
    if (!supabase) return
    const sb = supabase // capture non-nulle (pour le nettoyage ci-dessous)
    const canal = sb
      .channel("appels-entrants")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "appels_entrants" },
        (payload) => {
          const r = (payload.new ?? {}) as Record<string, unknown>
          const callId = String(r.call_id ?? "")
          const de = String(r.de ?? "")
          const direction = String(r.direction ?? "").toLowerCase()
          const evenement = String(r.evenement ?? "").toLowerCase()
          if (!callId) return
          if (direction.startsWith("out")) return // nos propres appels sortants
          // On ne signale que le début d'appel (sonnerie / décroché) — pas la fin.
          if (/hangup|end|termin|miss|voicemail|after/.test(evenement)) return
          marquerEntrantActif()
          signalerRef.current(de, callId)
        },
      )
      .subscribe()
    return () => {
      sb.removeChannel(canal)
    }
  }, [])

  // FILET DE SECOURS : sondage des appels entrants en cours toutes les 5 s.
  useEffect(() => {
    if (!supabaseConfigure) return
    let enVol = false
    const iv = setInterval(async () => {
      if (enVol) return
      enVol = true
      let res
      try {
        res = await appelsEntrantsRingover()
      } finally {
        enVol = false
      }
      if (!res.ok) return
      // Un appel entrant est en cours → le mode auto ne doit pas composer par-dessus.
      if (res.entrants.length > 0) marquerEntrantActif()
      // On laisse signalerRef décider : nouvelle bannière, mise à niveau, ou rien.
      const appel = res.entrants.find((e) => e.callId)
      if (!appel) return
      signalerRef.current(appel.from, appel.callId)
    }, 5000)
    return () => clearInterval(iv)
  }, [])

  async function enregistrer(p: Prospect) {
    if (fiche?.id) {
      const id = fiche.id
      setProspects((arr) => arr.map((x) => (x.id === id ? { ...p, id } : x)))
      await majProspectComplet(id, p).catch(() => {})
    }
    setFicheOuverte(false)
  }

  const numeroAffichable = Boolean(entrant) && cleComparaison(entrant!.from).length >= 6
  const estGestionnaire = Boolean(entrant?.prospect?.contact?.trim() && entrant?.prospect?.email?.trim())

  return (
    <>
      {/* Bannière d'appel entrant (bas-GAUCHE, pour ne pas gêner le téléphone Ringover à droite) */}
      {entrant && (
        <div className="fixed bottom-4 left-4 z-[95] w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-green-300 bg-white shadow-xl">
          <div className="flex items-center gap-2 border-b border-green-100 bg-green-50 px-4 py-2.5">
            <PhoneIncoming size={17} className="shrink-0 animate-pulse text-green-600" />
            <span className="text-sm font-semibold text-green-900">Appel entrant</span>
            <button
              onClick={() => setEntrant(null)}
              className="ml-auto text-slate-400 hover:text-slate-600"
              title="Ignorer"
            >
              <X size={16} />
            </button>
          </div>
          <div className="px-4 py-3">
            {entrant.prospect ? (
              <>
                <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <Building2 size={14} className="shrink-0 text-slate-400" />
                  {entrant.prospect.entreprise}
                </p>
                {entrant.prospect.contact && (
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                    <User size={12} className="shrink-0 text-slate-400" />
                    {entrant.prospect.contact}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-slate-500">{formaterTelephone(entrant.from) || entrant.from}</p>
                <button
                  onClick={() => {
                    setFiche(entrant.prospect)
                    setFicheOuverte(true)
                  }}
                  className="mt-3 w-full rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                >
                  Ouvrir la fiche
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-900">
                  {numeroAffichable ? formaterTelephone(entrant.from) || entrant.from : "Numéro masqué"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {numeroAffichable
                    ? "Ce numéro ne correspond à aucun prospect enregistré."
                    : "Recherche du numéro en cours — la bannière se mettra à jour si je le retrouve."}
                </p>
              </>
            )}
            <p className="mt-2 text-[11px] text-slate-400">Décroche dans le téléphone Ringover (à droite).</p>
          </div>
        </div>
      )}

      {ficheOuverte && fiche && (
        <ProspectModal
          prospect={fiche}
          statuts={statuts}
          contexte={estGestionnaire ? "gestionnaire" : "prospect"}
          onClose={() => setFicheOuverte(false)}
          onSave={enregistrer}
        />
      )}
    </>
  )
}
