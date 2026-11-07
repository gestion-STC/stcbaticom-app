// ── LA SESSION DE CALL, UNE SEULE POUR TOUTES LES BASES (07/11/2026) ──
// Ses files viennent de MES bases : les leads (nés des campagnes), les étapes « Appel » des campagnes, la
// prospection à froid (seulement si la base l'autorise) et les rappels datés. La fiche montre tout ce que
// le contact a reçu et fait ; l'appel se déroule (ça sonne, en ligne, raccroché), l'IA propose le résultat,
// les issues sont celles de la base, le mail de suivi part en validant, puis on passe au suivant.
// Dans la maquette, le téléphone est simulé ; en production, c'est Ringover (comme la session actuelle).
import { useEffect, useRef, useState } from "react"
import { Check, Mail, Phone, PhoneOff, Sparkles } from "lucide-react"
import { Bouton, Interrupteur, Pastille, Selecteur, Zone } from "../../ui"
import { Etiquette } from "../demarchage/aujourdhui/courtier"
import { useDepot } from "../../prospection/depot"
import type { Appel, Contact } from "../../prospection/modele"
import { dateHeure, fr, useVue } from "./outils"

type File = "leads" | "appels" | "prospection" | "rappels"
type Item = { contact: Contact; pourquoi: string; quand: string; campagneId: string | null; tacheId?: string; leadId?: string }
type Phase = "pret" | "sonne" | "en_ligne" | "ecoute" | "resultat"
const RESULTATS: { code: Appel["resultat"]; libelle: string; aide: string }[] = [
  { code: "pas_de_reponse", libelle: "Pas de réponse", aide: "Répondeur, occupé" }, { code: "standard", libelle: "Standard / accueil", aide: "Pas le décideur" },
  { code: "joint", libelle: "Décideur joint", aide: "La bonne personne en ligne" }, { code: "faux_numero", libelle: "Faux numéro", aide: "Sort en hors cible" },
]

function GrosBouton({ touche, libelle, aide, choisi, ia, onClick }: { touche: string; libelle: string; aide?: string; choisi: boolean; ia?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`relative flex min-h-[52px] flex-1 basis-[150px] flex-col items-start justify-center gap-0.5 rounded-4 border px-3 py-2 text-left ${choisi ? "border-action bg-fond-3 ring-1 ring-action" : "border-trait bg-fond hover:bg-fond-4"}`}>
      <span className="flex items-center gap-2"><kbd className="rounded-3 bg-fond-4 px-1.5 text-[10px] font-semibold leading-4 text-encre-2">{touche}</kbd><span className="text-legende font-medium">{libelle}</span></span>
      {aide ? <span className="text-colonne text-encre-2">{aide}</span> : null}
      {ia ? <span className="absolute right-2 top-2 flex items-center gap-1 text-[10px] font-medium text-encre-2"><span className="h-1.5 w-1.5 rounded-full bg-signature" />IA</span> : null}
    </button>
  )
}

export default function Session() {
  const v = useVue()
  const depot = useDepot()
  const [baseId, setBaseId] = useState(v.bases[0]?.id ?? "")
  const base = v.base(baseId)
  const [file, setFile] = useState<File>("leads")
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>("pret")
  const [secondes, setSecondes] = useState(0)
  const [resultat, setResultat] = useState<Appel["resultat"] | null>(null)
  const [issue, setIssue] = useState("")
  const [proposition, setProposition] = useState<{ resultat: Appel["resultat"]; issue: string; preuve: string } | null>(null)
  const [note, setNote] = useState("")
  const [envoyerMail, setEnvoyerMail] = useState(true)
  const [auto, setAuto] = useState(false)
  const [fait, setFait] = useState<string[]>([])
  const debut = useRef(0)

  // ── Les files, à partir de MES contacts uniquement ──
  const files = (() => {
    const mes = v.contacts.filter((k) => k.baseId === baseId)
    const parId = new Map(mes.map((k) => [k.id, k]))
    const leads: Item[] = v.leads.filter((l) => l.baseId === baseId && l.statut === "a_traiter" && parId.has(l.contactId)).map((l) => ({ contact: parId.get(l.contactId)!, pourquoi: l.signal, quand: l.creeLe, campagneId: l.campagneId, leadId: l.id }))
    const appels: Item[] = v.etat.taches.filter((t) => t.type === "appel" && !t.faiteLe && parId.has(t.contactId)).map((t) => ({ contact: parId.get(t.contactId)!, pourquoi: t.consigne || "Étape « Appel » de la campagne", quand: t.creeLe, campagneId: t.campagneId, tacheId: t.id }))
    const appeles = new Set(v.etat.appels.map((a) => a.contactId))
    const enCampagne = new Set(v.etat.inscriptions.filter((i) => i.statut === "en_cours").map((i) => i.contactId))
    const prospection: Item[] = base?.prospection ? mes.filter((k) => k.statut === "libre" && !appeles.has(k.id) && !enCampagne.has(k.id) && k.telephone).slice(0, 200).map((k) => ({ contact: k, pourquoi: "Jamais appelée", quand: "", campagneId: null })) : []
    const rappels: Item[] = v.etat.appels.filter((a) => a.issue === "a_rappeler" && parId.has(a.contactId)).map((a) => ({ contact: parId.get(a.contactId)!, pourquoi: "À rappeler", quand: a.le, campagneId: a.campagneId }))
    return { leads, appels, prospection, rappels }
  })()
  const liste = files[file].filter((x) => !fait.includes(x.contact.id + file))
  const courant = liste[Math.min(index, Math.max(0, liste.length - 1))]
  const k = courant?.contact

  // L'historique du contact : ce qu'il a reçu, ce qu'il a fait, les appels.
  const fil = (() => {
    if (!k) return []
    const l: { le: string; texte: string; ton?: string }[] = []
    for (const e of v.etat.envois.filter((x) => x.contactId === k.id && x.le <= v.etat.maintenant)) {
      const c = v.etat.campagnes.find((x) => x.id === e.campagneId)
      const et = c?.etapes.find((x) => x.id === e.etapeId)
      const objet = et && "variantes" in et ? et.variantes.find((x) => x.id === e.varianteId)?.objet : ""
      l.push({ le: e.le, texte: `${e.canal === "sms" ? "SMS" : "Mail"} ${e.statut === "envoye" ? "reçu" : e.statut === "erreur" ? "en erreur" : "sauté"}${objet ? ` · « ${objet} »` : ""} · ${c?.nom ?? ""}`, ton: e.statut === "envoye" ? undefined : "text-alerte" })
    }
    for (const e of v.evenements.filter((x) => x.contactId === k.id && ["ouvert", "clic", "reponse", "desinscription"].includes(x.type))) l.push({ le: e.le, texte: ({ ouvert: "A ouvert le mail", clic: `A cliqué${e.lien === "principal" ? ` « ${base?.liens[0]?.libelle} »` : e.lien ? ` « ${e.lien} »` : ""}`, reponse: "A répondu au mail", desinscription: "S'est désinscrit" } as Record<string, string>)[e.type], ton: e.type === "clic" || e.type === "reponse" ? "text-ok" : undefined })
    for (const a of v.etat.appels.filter((x) => x.contactId === k.id)) l.push({ le: a.le, texte: `Appel · ${RESULTATS.find((x) => x.code === a.resultat)?.libelle}${a.issue ? ` · ${base?.issues.find((x) => x.code === a.issue)?.libelle}` : ""} · ${v.etat.comptes.find((x) => x.id === a.compteId)?.nom.split(" ")[0]}` })
    return l.sort((a, b) => (a.le < b.le ? 1 : -1))
  })()

  const conseils = (() => {
    if (!k) return []
    const evs = v.evenements.filter((x) => x.contactId === k.id)
    const out: string[] = []
    if (evs.some((x) => x.type === "reponse")) out.push("Il a répondu au mail : commence par sa réponse, elle est dans la boîte de réception.")
    else if (evs.some((x) => x.type === "clic" && x.lien === "principal")) out.push(base?.id === "artisans" ? "Il a cliqué la candidature sans déposer : demande ce qui bloque (Kbis, assurance ?)." : "Il a cliqué « Créer un compte » : demande s'il a pu s'inscrire, propose une première intervention test.")
    else if (evs.some((x) => x.type === "ouvert")) out.push(`Il a ouvert ${evs.filter((x) => x.type === "ouvert").length} fois sans cliquer : rappelle le mail en une phrase.`)
    else out.push("Aucun signal : présente-toi en 15 secondes et pose une question fermée.")
    out.push(base?.id === "artisans" ? "Objection la plus fréquente : « pas le temps ». Ce qui marche : « le dossier prend 3 minutes, je reste en ligne avec vous »." : "Objection la plus fréquente : « on a déjà nos artisans ». Ce qui marche : « vous restez ouvert à un prestataire plus réactif ? ».")
    out.push("Avant de raccrocher, fixe une date.")
    return out
  })()

  // ── L'appel simulé ──
  useEffect(() => {
    if (phase === "sonne") { const t = setTimeout(() => { setPhase("en_ligne"); debut.current = Date.now() }, 1800); return () => clearTimeout(t) }
    if (phase === "en_ligne") { const t = setInterval(() => setSecondes(Math.floor((Date.now() - debut.current) / 1000)), 500); return () => clearInterval(t) }
    if (phase === "ecoute" && k) {
      const t = setTimeout(() => {
        const evs = v.evenements.filter((x) => x.contactId === k.id)
        const chaud = evs.some((x) => x.type === "reponse" || x.type === "clic")
        const p = secondes < 8 ? { resultat: "pas_de_reponse" as const, issue: "", preuve: "Appel de quelques secondes : personne n'a parlé." }
          : chaud ? { resultat: "joint" as const, issue: base?.issues[0].code ?? "", preuve: base?.id === "artisans" ? "« Oui, je voulais justement finir mon dossier, il me manquait l'attestation. »" : "« Oui, j'ai vu votre mail, envoyez-moi la plaquette, on a un T2 à remettre en état. »" }
          : { resultat: "standard" as const, issue: "", preuve: "« Il n'est pas là aujourd'hui, envoyez un mail à l'agence. »" }
        setProposition(p); setResultat((r) => r ?? p.resultat); setIssue((s) => s || p.issue); setPhase("resultat")
      }, 3500)
      return () => clearTimeout(t)
    }
  }, [phase, k, v.evenements, secondes, base])
  // Le mode automatique : le suivant se compose tout seul, 8 s après la validation.
  useEffect(() => { if (auto && phase === "pret" && k) { const t = setTimeout(() => setPhase("sonne"), 8000); return () => clearTimeout(t) } }, [auto, phase, k])

  const valider = () => {
    if (!k || !resultat || (resultat === "joint" && !issue)) return
    depot.noterAppel({ contactId: k.id, compteId: v.compte.id, resultat, issue: resultat === "joint" ? issue : "", campagneId: courant.campagneId })
    if (courant.tacheId) depot.faireTache(courant.tacheId)
    if (envoyerMail && (resultat === "joint" || resultat === "standard") && k.email) depot.repondre({ contactId: k.id, de: "contact@crm.stcbatiment.fr", a: k.email, objet: base?.id === "artisans" ? "Votre dossier STC Bâtiment" : "STC Bâtiment – suite à notre échange", corps: note || "Mail de suivi écrit par l'IA d'après l'appel, avec les documents de base et le lien suivi.", campagneId: courant.campagneId })
    setFait((f) => [...f, k.id + file]); setPhase("pret"); setResultat(null); setIssue(""); setProposition(null); setNote(""); setSecondes(0)
  }
  useEffect(() => {
    const t = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "TEXTAREA" || phase !== "resultat") return
      if (e.key === "Enter") { e.preventDefault(); valider() }
      const n = Number(e.key)
      if (n >= 1 && n <= 4) { if (resultat === "joint" && base) setIssue(base.issues[n - 1]?.code ?? ""); else setResultat(RESULTATS[n - 1].code) }
    }
    window.addEventListener("keydown", t); return () => window.removeEventListener("keydown", t)
  })

  if (!base) return <p className="text-legende text-encre-2">Aucune base pour ce compte.</p>
  const onglets: [File, string, number][] = [["leads", "Leads", files.leads.length], ["appels", "Étapes Appel", files.appels.length], ...(base.prospection ? [["prospection", "Prospection", files.prospection.length] as [File, string, number]] : []), ["rappels", "Rappels", files.rappels.length]]
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b-[0.5px] border-trait pb-3">
        <div className="flex flex-wrap items-center gap-5 text-legende">{onglets.map(([f, l, n]) => <button key={f} type="button" onClick={() => { setFile(f); setIndex(0); setPhase("pret") }} className={file === f ? "font-medium text-encre" : "text-encre-2 hover:text-encre"}>{l} <span className="chiffres">{fr(n - fait.filter((x) => x.endsWith(f)).length)}</span></button>)}</div>
        <div className="flex items-center gap-3">
          {v.bases.length > 1 ? <span className="w-56"><Selecteur value={baseId} onChange={(e) => { setBaseId(e.target.value); setFile("leads"); setIndex(0) }} aria-label="Base">{v.bases.map((b) => <option key={b.id} value={b.id}>Base : {b.nom}</option>)}</Selecteur></span> : null}
          <label className="flex items-center gap-2 border-l-[0.5px] border-trait pl-3 text-legende"><Interrupteur allume={auto} onChange={setAuto} libelle="Mode automatique" /> Auto · 8 s</label>
        </div>
      </div>
      {!base.prospection ? <p className="text-colonne text-encre-2">Pas de file « Prospection » : la base {base.nom} n'est jamais appelée à froid (réglage de la base).</p> : null}

      <div className="grid gap-8 @min-[1100px]:grid-cols-[250px_minmax(0,1fr)_minmax(0,0.85fr)]">
        <aside className="space-y-1">
          <Etiquette>{onglets.find((o) => o[0] === file)?.[1]} · {liste.length}</Etiquette>
          <ul className="mt-2 max-h-[640px] space-y-1 overflow-y-auto">{liste.slice(0, 60).map((x, i) => (
            <li key={x.contact.id}><button type="button" onClick={() => { if (phase === "pret") setIndex(i) }} className={`w-full rounded-4 px-2.5 py-2 text-left ${x === courant ? "bg-fond-4" : "hover:bg-fond-3"}`}>
              <span className="block truncate text-legende font-medium">{x.contact.nom}</span><span className="block truncate text-colonne text-encre-2">{x.pourquoi}</span>{x.quand ? <span className="chiffres block text-colonne text-encre-3">{dateHeure(x.quand)}</span> : null}
            </button></li>))}
            {!liste.length ? <li className="py-6 text-legende text-encre-2">File vide.</li> : null}
          </ul>
        </aside>

        {k ? (<>
          <div className="min-w-0 space-y-5">
            <div>
              <h2 className="text-h1 font-semibold">{k.nom}</h2>
              <p className="mt-1.5 text-legende"><span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-signature" /><b className="font-medium">{file === "leads" ? "Lead" : file === "appels" ? "Étape Appel" : file === "rappels" ? "Rappel" : "Prospection"}</b> · {courant.pourquoi}{courant.campagneId ? <span className="text-encre-2"> · {v.etat.campagnes.find((c) => c.id === courant.campagneId)?.nom}</span> : null}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-colonne text-encre-2">{base.champs.map((ch) => <span key={ch.cle}>{ch.libelle} : <span className="text-encre">{k.champs[ch.cle] || "—"}</span></span>)}{k.personne ? <span>Contact : <span className="text-encre">{k.personne}</span></span> : null}</div>
            </div>
            <section className="border-y-[0.5px] border-trait py-3"><span className="flex items-center gap-2 text-colonne font-medium"><span className="h-1.5 w-1.5 rounded-full bg-signature" />Avant d'appeler · ce que dit l'IA</span><ol className="mt-2 space-y-1 text-legende">{conseils.map((x, i) => <li key={i} className="flex gap-2"><span className="chiffres w-3 text-encre-2">{i + 1}</span>{x}</li>)}</ol></section>

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span><span className="chiffres text-legende font-medium">{k.mobile || k.telephone || "pas de numéro"}</span><span className="block text-colonne text-encre-2">{k.mobile ? "mobile" : "standard"}</span></span>
                {phase === "pret" ? <Bouton variante="plein" icone={<Phone />} disabled={!k.mobile && !k.telephone} onClick={() => setPhase("sonne")}>Appeler</Bouton>
                  : phase === "sonne" ? <span className="flex items-center gap-2 text-legende text-attention"><span className="h-2 w-2 animate-pulse rounded-full bg-attention" />Ça sonne…</span>
                  : phase === "en_ligne" ? <span className="flex items-center gap-3"><span className="chiffres flex items-center gap-2 text-legende text-ok"><span className="h-2 w-2 rounded-full bg-ok" />En ligne · {Math.floor(secondes / 60)}:{String(secondes % 60).padStart(2, "0")}</span><Bouton variante="danger" icone={<PhoneOff />} onClick={() => setPhase("ecoute")}>Raccrocher</Bouton></span>
                  : <span className="chiffres text-legende text-encre-2">Appel de {Math.floor(secondes / 60)}:{String(secondes % 60).padStart(2, "0")}</span>}
              </div>
              {phase === "en_ligne" ? <p className="text-colonne text-encre-2">Maquette : le téléphone est simulé. En production, c'est Ringover qui sonne sur ton poste, et le logiciel voit le raccroché tout seul.</p> : null}
            </section>

            {phase === "ecoute" || phase === "resultat" ? (
              <section className="space-y-3 border-y-[0.5px] border-trait py-4">
                <h3 className="flex items-center gap-2 text-sous-titre font-semibold">{phase === "ecoute" ? <><span className="h-2 w-2 animate-pulse rounded-full bg-signature" />L'IA écoute l'appel…</> : proposition ? <><Sparkles size={15} className="text-signature" />L'IA propose · à toi de valider</> : "Qu'est-ce qui s'est passé ?"}</h3>
                <div className="flex flex-wrap gap-2">{RESULTATS.map((r, i) => <GrosBouton key={r.code} touche={String(i + 1)} libelle={r.libelle} aide={r.aide} choisi={resultat === r.code} ia={proposition?.resultat === r.code} onClick={() => setResultat(r.code)} />)}</div>
                {resultat === "joint" ? <div className="flex flex-wrap gap-2 border-t border-fond-4 pt-3">{base.issues.map((x, i) => <GrosBouton key={x.code} touche={String(i + 1)} libelle={x.libelle} choisi={issue === x.code} ia={proposition?.issue === x.code} onClick={() => setIssue(x.code)} />)}</div> : null}
                {proposition ? <blockquote className="border-l-2 border-signature/50 pl-3 text-legende">{proposition.preuve} <span className="text-encre-2">· d'après l'appel</span></blockquote> : null}
                {resultat === "joint" || resultat === "standard" ? (
                  <div className="space-y-2 rounded-4 border-[0.5px] border-trait p-3">
                    <label className="flex items-center justify-between gap-3 text-legende"><span className="flex items-center gap-2 font-medium"><Mail size={14} />Le mail de suivi {k.email ? `· à ${k.email}` : "· pas d'adresse"}</span><span className="flex items-center gap-2"><input type="checkbox" className="accent-[var(--color-action)]" checked={envoyerMail && Boolean(k.email)} disabled={!k.email} onChange={(e) => setEnvoyerMail(e.target.checked)} />L'envoyer en validant</span></label>
                    <Zone rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="L'IA écrit le mail d'après l'appel ; tu peux le retoucher ici." />
                    <p className="text-colonne text-encre-2">{base.id === "artisans" ? "Lien candidature + barème joints d'office." : "Kbis, assurance, 2 plaquettes et lien « Créer un compte » joints d'office."}</p>
                  </div>
                ) : null}
                <div className="flex justify-end"><Bouton variante="plein" icone={<Check />} disabled={!resultat || (resultat === "joint" && !issue)} onClick={valider}>{(resultat === "joint" || resultat === "standard") && envoyerMail && k.email ? "Valider et envoyer le mail · Entrée" : "Valider · Entrée"}</Bouton></div>
              </section>
            ) : null}
          </div>

          <aside className="min-w-0">
            <Etiquette>Ce qui s'est passé avec ce contact</Etiquette>
            <ol className="mt-2 space-y-2 border-l-[0.5px] border-trait pl-3">{fil.length ? fil.slice(0, 20).map((x, i) => <li key={i} className="text-colonne"><span className="chiffres text-encre-3">{dateHeure(x.le)}</span><span className={`block ${x.ton ?? "text-encre"}`}>{x.texte}</span></li>) : <li className="text-colonne text-encre-2">Rien encore.</li>}</ol>
            {k.statut === "gagne" ? <p className="mt-4"><Pastille role="fait">{base.gagne}</Pastille></p> : null}
          </aside>
        </>) : <p className="py-10 text-legende text-encre-2 @min-[1100px]:col-span-2">Rien à appeler dans cette file. Lance une campagne, puis fais avancer le temps : les leads et les étapes « Appel » arrivent ici.</p>}
      </div>
    </div>
  )
}
