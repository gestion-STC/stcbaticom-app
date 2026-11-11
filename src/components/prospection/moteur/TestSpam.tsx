// « Arrive-t-il en spam ? » (Mahdi, 11/11/2026) : le vrai mail, envoyé par les vraies boîtes vers les boîtes de test
// d'Instantly (Gmail et Outlook). Aucun contact n'est touché, rien n'est compté dans la campagne.
import { useCallback, useEffect, useState } from "react"
import { Inbox } from "lucide-react"
import { Bouton, Selecteur } from "../../../ui"
import { lectureSpam, type Mentions, type PlacementMesure } from "../../../prospection/instantlyOutils"
import { lancerTestSpam, resultatsTestSpam, type TestSpam as Test } from "../../../lib/testSpamDb"

export type MailATester = { id: string; libelle: string; objet: string; corps: string }
const COULEUR = { attente: "text-encre-2", bon: "text-ok", moyen: "text-attention", mauvais: "text-alerte" } as const
const ligne = (titre: string, m: PlacementMesure | null) => { const l = lectureSpam(m); return <li key={titre} className="min-w-0"><span className="font-medium">{titre}</span> <span className={COULEUR[l.niveau]}>{l.texte}</span></li> }

export default function TestSpam({ campagneId, campagneNom, baseId, mails, mentions, suivi }: { campagneId: string; campagneNom: string; baseId: string; mails: MailATester[]; mentions: Mentions; suivi: boolean }) {
  const [choix, setChoix] = useState("")
  const [tests, setTests] = useState<Test[] | null>(null)
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState("")
  const mail = mails.find((m) => m.id === choix) ?? mails[0]
  const lire = useCallback(() => { if (!campagneId) return; resultatsTestSpam(campagneId).then((t) => { setTests(t); setErreur("") }).catch((e) => setErreur(e instanceof Error ? e.message : String(e))) }, [campagneId])
  useEffect(() => { const t = setTimeout(lire, 0); return () => clearTimeout(t) }, [lire])
  const lancer = async () => {
    if (!mail) return
    setOccupe(true); setErreur("")
    try { await lancerTestSpam({ campagneId, baseId, nom: `${campagneNom || "Campagne"} · ${mail.libelle}`, objet: mail.objet, corps: mail.corps, mentions, suivi }); lire() }
    catch (e) { setErreur(e instanceof Error ? e.message : String(e)) } finally { setOccupe(false) }
  }
  if (!mails.length) return null
  return (
    <div className="space-y-2 rounded-4 border-[0.5px] border-trait p-3">
      <div className="flex items-center gap-2"><Inbox size={14} className="shrink-0 text-encre-2" /><b className="text-legende font-medium">Boîte de réception ou spam ?</b></div>
      <p className="text-colonne text-encre-2">Le vrai mail part de tes boîtes vers environ 90 boîtes de test Gmail et Outlook (cela compte dans leurs envois du jour). Aucun contact n'est touché.</p>
      {!campagneId ? <p className="text-colonne text-encre-2">Enregistre la campagne pour pouvoir la tester.</p> : <>
        {mails.length > 1 ? <Selecteur aria-label="Mail à tester" value={mail?.id ?? ""} onChange={(e) => setChoix(e.target.value)}>{mails.map((m) => <option key={m.id} value={m.id}>{m.libelle}</option>)}</Selecteur> : null}
        <div className="flex flex-wrap gap-2"><Bouton taille="sm" chargement={occupe} onClick={() => void lancer()}>Tester {mails.length > 1 ? "ce mail" : "le mail"}</Bouton>{tests?.length ? <Bouton taille="sm" variante="discret" onClick={lire}>Actualiser</Bouton> : null}</div>
      </>}
      {erreur ? <p className="text-colonne text-alerte">{erreur}</p> : null}
      {tests?.length ? <ul className="space-y-3 border-t-[0.5px] border-trait pt-2">{tests.map((t) => <li key={t.id} className="space-y-0.5 text-colonne">
        <p className="text-encre-2">{t.nom} · {new Date(t.le).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</p>
        <ul className="space-y-0.5">{ligne("En tout :", t.tout)}{t.tout?.count ? <>{ligne("Gmail :", t.google)}{ligne("Outlook :", t.outlook)}</> : null}</ul>
      </li>)}</ul> : null}
      <p className="text-colonne text-encre-2">Les boîtes de test d'Instantly sont américaines : Orange, Free ou SFR ne sont pas testés.</p>
    </div>
  )
}
