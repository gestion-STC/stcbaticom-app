import { useEffect, useRef, useState } from "react"
import RingoverSDK from "ringover-sdk"
import { PhoneIncoming, X, User, Building2 } from "lucide-react"
import { supabase, supabaseConfigure } from "../lib/supabase"
import { appelsEntrantsRingover, detailAppelRingover } from "../lib/ringover"
import { cleComparaison, formaterTelephone } from "../lib/telephone"
import { marquerEntrantActif } from "../lib/appelEntrantActif"
import {
  brancherTelephone,
  debrancherTelephone,
  diffuserEvenementAppel,
} from "../lib/sdkRingover"
import { useSession } from "../lib/auth"
import { nomAffiche } from "../lib/comptes"
import { agenceParTelephone, journaliserAppelEntrant } from "../demarchage/db"
import { nomContact, type Agence, type Contact } from "../demarchage/modele"
import { Bouton } from "../ui"

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
// 3) L'appelant est reconnu dans les AGENCES (09/10/2026) : le standard de l'agence, ou la
//    ligne directe / le mobile d'un contact (`agenceParTelephone`). L'appel entrant reconnu
//    est journalisé dans le fil de l'agence, sans toucher à son étape.
type Reconnu = { agence: Agence; contact: Contact | null }
type Entrant = { callId: string; from: string; reconnu: Reconnu | null; recherche: boolean }

export default function TelephoneRingover({ onOuvrirAgence }: { onOuvrirAgence?: (agenceId: string) => void }) {
  // Appel entrant à signaler (bannière) : le numéro, l'agence reconnue, la recherche en cours.
  const [entrant, setEntrant] = useState<Entrant | null>(null)
  // Le compte connecté : c'est lui qui « reçoit » l'appel dans le journal.
  const session = useSession()
  const compteNomRef = useRef("Compte")
  useEffect(() => {
    compteNomRef.current = nomAffiche(session)
  }, [session])

  // call_id déjà signalés → ce qu'on savait (agence reconnue ? numéro exploitable ?).
  // Permet la « mise à niveau » : si une source plus précise arrive après coup
  // (ex. le détail dévoile un numéro d'abord masqué), on corrige au lieu d'ignorer.
  const traitesRef = useRef<Map<string, { reconnu: Reconnu | null; from: string }>>(new Map())
  const resolutionsRef = useRef<Set<string>>(new Set()) // résolutions de numéro masqué en cours
  const journalisesRef = useRef<Set<string>>(new Set()) // appels entrants déjà écrits au journal
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

  // Notification navigateur (marche même sur un autre onglet). Le tag=callId fait
  // qu'une mise à niveau REMPLACE la notification au lieu d'en empiler une 2e.
  function notifier(callId: string, corps: string) {
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("📞 Appel entrant", { body: corps, tag: callId })
      }
    } catch {
      /* notif indisponible */
    }
  }

  // Cherche l'agence (ou le contact) qui porte ce numéro, puis corrige la bannière
  // et journalise l'appel entrant dans son fil (une seule fois par appel).
  async function reconnaitre(from: string, callId: string) {
    let reconnu: Reconnu | null
    try {
      reconnu = await agenceParTelephone(from)
    } catch {
      reconnu = null
    }
    if (!reconnu) {
      setEntrant((prev) => (prev && prev.callId === callId ? { ...prev, recherche: false } : prev))
      return
    }
    const t = traitesRef.current.get(callId)
    if (t) t.reconnu = reconnu
    // On ne corrige la bannière QUE si c'est encore celle de cet appel (jamais rouvrir une bannière fermée).
    setEntrant((prev) => (prev && prev.callId === callId ? { ...prev, reconnu, recherche: false } : prev))
    notifier(callId, reconnu.agence.nom + (reconnu.contact ? ` · ${nomContact(reconnu.contact)}` : ""))
    if (!journalisesRef.current.has(callId)) {
      journalisesRef.current.add(callId)
      if (journalisesRef.current.size > 200) {
        journalisesRef.current = new Set(Array.from(journalisesRef.current).slice(-100))
      }
      journaliserAppelEntrant(reconnu.agence.id, reconnu.contact?.id ?? null, callId, compteNomRef.current).catch(() => {})
    }
  }

  // Traite un appel entrant : affiche/corrige la bannière et lance la reconnaissance.
  // Placé dans une ref (remplie dans un effet) pour rester à jour sans réabonner les écouteurs.
  const signalerRef = useRef<(from: string, callId: string) => void>(() => {})
  useEffect(() => {
    signalerRef.current = (from, callId) => {
      if (!callId) return
      // On compare via une clé qui ignore le format (33… vs 0…) : l'appelant Ringover
      // arrive en « 33783092347 », l'agence est stockée en « 07 83 09 23 47 ».
      const utilisable = cleComparaison(from).length >= 6 // faux si masqué ("Unknown", vide…)

      const precedent = traitesRef.current.get(callId)
      const deja = precedent !== undefined
      if (deja) {
        // Cet appel a déjà été signalé : on ne refait quelque chose QUE si on apporte
        // un vrai numéro là où c'était masqué (l'agence, elle, arrive par la recherche).
        const avaitNumero = cleComparaison(precedent.from).length >= 6
        if (precedent.reconnu || avaitNumero || !utilisable) return
      }

      traitesRef.current.set(callId, { reconnu: precedent?.reconnu ?? null, from })
      // Purge : on borne la taille de l'historique anti-répétition.
      if (traitesRef.current.size > 100) {
        traitesRef.current = new Map(Array.from(traitesRef.current.entries()).slice(-50))
      }

      if (!deja) {
        // Nouvel appel → bannière (le téléphone Ringover reste libre pour décrocher).
        setEntrant({ callId, from, reconnu: null, recherche: utilisable })
      } else {
        // Mise à niveau : on corrige la bannière SI c'est encore celle de cet appel.
        setEntrant((prev) => (prev && prev.callId === callId ? { ...prev, from, recherche: utilisable } : prev))
      }

      if (!utilisable) {
        notifier(callId, "Numéro masqué")
        // Numéro masqué mais call_id connu → on tente de récupérer le vrai numéro.
        void resoudreNumeroMasque(callId)
        return
      }
      notifier(callId, formaterTelephone(from) || from)
      void reconnaitre(from, callId)
    }
  })

  // Autorisation notifications navigateur (une fois).
  useEffect(() => {
    if (!supabaseConfigure) return
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {})
    }
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
      // Le reste du logiciel (sessions de call) peut maintenant composer DANS ce
      // téléphone et ouvrir son panneau.
      brancherTelephone(
        (numero, depuis) => {
          try {
            return Boolean(sdkRef.current?.dial(numero, depuis ?? null))
          } catch {
            return false
          }
        },
        () => {
          try {
            sdkRef.current?.show()
          } catch {
            /* rien */
          }
        },
      )

      // Événements d'appel du SDK. Pour les appels ENTRANTS ils alimentent la
      // bannière ; pour TOUS ils renseignent les sessions de call en temps réel
      // (décroché / raccroché), ce qui évite d'interroger Ringover en boucle.
      const relais = (type: "sonne" | "decroche" | "raccroche") => (e: {
        data?: { direction?: string; from_number?: string; call_id?: string | number }
      }) => {
        const d = e?.data
        if (!d) return
        const direction = String(d.direction ?? "").toLowerCase() === "in" ? "in" : "out"
        if (direction === "in" && type === "sonne") {
          marquerEntrantActif()
          signalerRef.current(String(d.from_number ?? ""), String(d.call_id ?? ""))
        }
        diffuserEvenementAppel({ type, callId: String(d.call_id ?? ""), direction })
      }
      sdk.on("ringingCall", relais("sonne"))
      sdk.on("answeredCall", relais("decroche"))
      sdk.on("hangupCall", relais("raccroche"))
    } catch {
      /* SDK indisponible : la détection webhook + sondage continue de fonctionner */
    }
    return () => {
      debrancherTelephone()
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

  if (!entrant) return null
  const numeroAffichable = cleComparaison(entrant.from).length >= 6
  const reconnu = entrant.reconnu
  const numero = formaterTelephone(entrant.from) || entrant.from

  // Bannière d'appel entrant (bas-GAUCHE, pour ne pas gêner le téléphone Ringover à droite).
  return (
    <div className="fixed bottom-4 left-4 z-[95] w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-6 border border-trait bg-fond shadow-flottante">
      <div className="flex items-center gap-2 border-b border-trait bg-ok-fond px-4 py-2.5">
        <PhoneIncoming size={16} className="shrink-0 animate-pulse text-ok" />
        <span className="text-legende font-semibold text-encre">Appel entrant</span>
        <button
          type="button"
          onClick={() => setEntrant(null)}
          className="ml-auto rounded-3 p-0.5 text-encre-2 hover:bg-fond-4 hover:text-encre"
          title="Ignorer"
          aria-label="Ignorer"
        >
          <X size={16} />
        </button>
      </div>
      <div className="px-4 py-3">
        {reconnu ? (
          <>
            <p className="flex items-center gap-1.5 text-corps font-semibold text-encre">
              <Building2 size={14} className="shrink-0 text-encre-3" />
              {reconnu.agence.nom}
            </p>
            {reconnu.contact && (
              <p className="mt-0.5 flex items-center gap-1.5 text-legende text-encre-2">
                <User size={14} className="shrink-0 text-encre-3" />
                {nomContact(reconnu.contact)}
              </p>
            )}
            <p className="mt-0.5 text-legende text-encre-2">
              <span className="chiffres">{numero}</span>
              {reconnu.agence.secteurLibelle ? ` · ${reconnu.agence.secteurLibelle}` : ""}
            </p>
            {onOuvrirAgence ? (
              <Bouton variante="plein" className="mt-3 w-full" onClick={() => onOuvrirAgence(reconnu.agence.id)}>
                Ouvrir la fiche
              </Bouton>
            ) : null}
          </>
        ) : (
          <>
            <p className="chiffres text-corps font-semibold text-encre">{numeroAffichable ? numero : "Numéro masqué"}</p>
            <p className="mt-1 text-legende text-encre-2">
              {!numeroAffichable
                ? "Recherche du numéro en cours — la bannière se mettra à jour si je le retrouve."
                : entrant.recherche
                  ? "Je cherche ce numéro dans les agences…"
                  : "Ce numéro ne correspond à aucune agence ni à aucun contact connu."}
            </p>
          </>
        )}
        <p className="mt-2 text-colonne text-encre-3">Décroche dans le téléphone Ringover (à droite).</p>
      </div>
    </div>
  )
}
