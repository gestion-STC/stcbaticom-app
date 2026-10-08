// ════════════════════════════════════════════════════════════════════════════
// LA FICHE ARTISAN — un panneau à droite, ouvert depuis n'importe quelle liste
//
// Tout ce qui est arrivé à cet artisan, dans l'ordre : démarrage, chaque envoi
// (réussi, rejoué, en erreur), chaque clic, chaque message échangé, le dépôt,
// la désinscription. Et les quatre gestes : appeler, relancer maintenant,
// mettre en pause, ne plus contacter.
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState } from "react"
import { Phone, Play, PauseCircle, Ban, RotateCcw } from "lucide-react"
import type { ClicST, EnvoiST, EtapeST, SousTraitant } from "../../recrutement"
import { chronologie, dateHeure, type Evenement } from "../../lib/chronologieArtisan"
import { libelleStatutST, rolePastilleStatut } from "../../recrutement"
import { chargerSousTraitant, nePlusContacter, remettreAContacter } from "../../lib/sousTraitantsDb"
import { chargerClicsDe, chargerEnvoisDe, chargerMessagesDe, mettreEnPause, relancerMaintenant, type MessageDeFiche } from "../../lib/machineDb"
import { chargerEtapes, chargerSequences } from "../../lib/sequencesStDb"
import { chargerPilotage } from "../../lib/pilotageStDb"
import { lancerAppelRingover } from "../../lib/ringover"
import { Bouton, Champ, Chargement, Dialogue, Etiquette, Ligne, Panneau, Pastille, Zone } from "../../ui"

const POINT: Record<Evenement["role"], string> = {
  ok: "bg-signature", sms: "bg-info", erreur: "bg-alerte", clic: "bg-ok", message: "bg-encre", etat: "bg-encre-3",
}

export default function FicheArtisan({ id, onFermer, onChange }: { id: string; onFermer: () => void; onChange?: () => void }) {
  const [st, setSt] = useState<SousTraitant | null>(null)
  const [envois, setEnvois] = useState<EnvoiST[]>([])
  const [clics, setClics] = useState<ClicST[]>([])
  const [messages, setMessages] = useState<MessageDeFiche[]>([])
  const [etapes, setEtapes] = useState<EtapeST[]>([])
  const [erreur, setErreur] = useState("")
  const [info, setInfo] = useState("")
  const [occupe, setOccupe] = useState(false)
  const [question, setQuestion] = useState<"stop" | "pause" | null>(null)
  const [enPause, setEnPause] = useState(false)
  const [motif, setMotif] = useState("")
  const [pauseJours, setPauseJours] = useState(7)

  const charger = useCallback(async () => {
    try {
      const fiche = await chargerSousTraitant(id)
      setSt(fiche)
      setEnPause(!!fiche.pauseJusquAu && new Date(fiche.pauseJusquAu).getTime() > Date.now())
      const [ev, cl, ms] = await Promise.all([chargerEnvoisDe(id), chargerClicsDe(id), chargerMessagesDe(id).catch(() => [])])
      setEnvois(ev); setClics(cl); setMessages(ms)
      // Les étapes de SA séquence, sinon celle des réglages, sinon la séquence active.
      let seqId = fiche.sequenceId
      if (!seqId) {
        const pil = await chargerPilotage().catch(() => null)
        seqId = pil?.sequenceId ?? (await chargerSequences()).find((s) => s.actif)?.id ?? null
      }
      setEtapes(seqId ? await chargerEtapes(seqId) : [])
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    }
  }, [id])
  useEffect(() => { const t = setTimeout(charger, 0); return () => clearTimeout(t) }, [charger])

  const evenements = useMemo(() => (st ? chronologie(st, envois, clics, messages, etapes) : []), [st, envois, clics, messages, etapes])

  const agir = async (f: () => Promise<void>, message: string) => {
    setOccupe(true); setErreur(""); setInfo("")
    try { await f(); setInfo(message); await charger(); onChange?.() }
    catch (e) { setErreur(e instanceof Error ? e.message : String(e)) }
    finally { setOccupe(false) }
  }
  const appeler = async () => {
    if (!st?.telephone) { setErreur("Cette fiche n'a pas de numéro."); return }
    const r = await lancerAppelRingover(st.telephone)
    if (!r.ok) setErreur(r.message || "Appel impossible pour le moment.")
  }

  const arretee = st ? ["depose", "desinscrit"].includes(st.statut) : true

  return (
    <Panneau
      titre={st?.entreprise || "Fiche artisan"}
      sousTitre={st ? <span className="flex flex-wrap items-center gap-2"><Pastille role={rolePastilleStatut[st.statut]} point>{libelleStatutST[st.statut]}</Pastille>{st.metier ? <Pastille>{st.metier}</Pastille> : null}{st.source ? <Pastille>{st.source}</Pastille> : null}{enPause ? <Pastille role="attente">en pause</Pastille> : null}</span> : null}
      onFermer={onFermer}
      pied={st ? (
        <>
          <Bouton variante="danger" icone={<Ban />} disabled={occupe || st.statut === "desinscrit"} onClick={() => { setMotif(""); setQuestion("stop") }}>Ne plus contacter</Bouton>
          {enPause
            ? <Bouton icone={<PauseCircle />} disabled={occupe} onClick={() => agir(() => mettreEnPause(st.id!, null), "Pause levée.")}>Lever la pause</Bouton>
            : <Bouton icone={<PauseCircle />} disabled={occupe || arretee} onClick={() => setQuestion("pause")}>Mettre en pause</Bouton>}
          {["termine", "injoignable", "exclu"].includes(st.statut)
            ? <Bouton icone={<RotateCcw />} disabled={occupe} onClick={() => agir(() => remettreAContacter(st.id!), "Fiche remise « à contacter ».")}>Remettre à contacter</Bouton>
            : null}
          <Bouton icone={<Play />} disabled={occupe || arretee || etapes.length === 0} onClick={() => agir(() => relancerMaintenant(st, etapes), "Prochaine étape due maintenant : elle partira au prochain passage.")}>Relancer maintenant</Bouton>
          <Bouton variante="plein" icone={<Phone />} onClick={appeler}>Appeler</Bouton>
        </>
      ) : null}
    >
      {!st && !erreur ? <Chargement /> : null}
      {erreur ? <p className="mb-3 rounded-4 border border-alerte/20 bg-alerte-fond px-3 py-2 text-legende text-alerte">{erreur}</p> : null}
      {info ? <p className="mb-3 rounded-4 border border-ok/20 bg-ok-fond px-3 py-2 text-legende text-ok">{info}</p> : null}
      {st ? (
        <>
          <div className="divide-y divide-fond-4">
            <Ligne libelle="Contact">{st.contact || "—"}</Ligne>
            <Ligne libelle="Mobile">{st.telephone || "—"}</Ligne>
            <Ligne libelle="E-mail"><span className={st.emailInvalide ? "text-alerte line-through" : ""}>{st.email || "—"}</span>{st.emailInvalide ? <span className="ml-2 text-colonne text-alerte">injoignable</span> : null}</Ligne>
            <Ligne libelle="Zone">{st.zone || "—"}</Ligne>
            <Ligne libelle="Envois">{st.nbEnvoisOk} réussi{st.nbEnvoisOk > 1 ? "s" : ""}{st.nbEnvoisErreur ? ` · ${st.nbEnvoisErreur} en erreur` : ""}</Ligne>
            {st.derniereErreur ? <Ligne libelle="Dernière erreur"><span className="text-alerte">{st.derniereErreur}</span></Ligne> : null}
            {st.statutMotif ? <Ligne libelle="Pourquoi ce statut">{st.statutMotif}</Ligne> : null}
            {enPause ? <Ligne libelle="En pause jusqu'au">{new Date(st.pauseJusquAu!).toLocaleDateString("fr-FR")}</Ligne> : null}
          </div>

          <h3 className="mb-3 mt-6 text-colonne font-semibold uppercase tracking-[0.07em] text-encre-2">Chronologie</h3>
          {evenements.length === 0 ? <p className="text-legende text-encre-2">Rien encore : la fiche n'a pas été démarrée.</p> : (
            <ol className="ml-1.5 space-y-3 border-l-2 border-trait pl-5">
              {evenements.map((e, i) => (
                <li key={i} className="relative text-legende">
                  <span className={`absolute -left-[27px] top-1 h-2.5 w-2.5 rounded-full border-2 border-fond ${POINT[e.role]}`} />
                  <div className="text-colonne text-encre-2">{dateHeure(e.quand)}</div>
                  <div className={e.role === "erreur" ? "text-alerte" : "text-encre"}>{e.texte}</div>
                  {e.detail ? <div className="text-colonne text-encre-2">{e.detail}</div> : null}
                </li>
              ))}
            </ol>
          )}
        </>
      ) : null}

      {question === "stop" && st ? (
        <Dialogue
          titre="Ne plus contacter cet artisan ?"
          description="Sa séquence s'arrête tout de suite. Son adresse et son numéro passent dans la liste d'exclusion : même réimporté, il ne sera jamais recontacté."
          onFermer={() => setQuestion(null)}
          pied={<><Bouton onClick={() => setQuestion(null)}>Annuler</Bouton><Bouton variante="danger" chargement={occupe} onClick={() => agir(async () => { await nePlusContacter(st, motif); setQuestion(null) }, "Fiche désinscrite et exclue.")}>Ne plus contacter</Bouton></>}
        >
          <Etiquette texte="Motif (facultatif)"><Zone value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. : a demandé par téléphone à ne plus être sollicité" /></Etiquette>
        </Dialogue>
      ) : null}
      {question === "pause" && st ? (
        <Dialogue
          titre="Mettre en pause"
          description="La machine n'écrira plus à cet artisan pendant la pause, puis reprendra sa séquence là où elle en était."
          onFermer={() => setQuestion(null)}
          pied={<><Bouton onClick={() => setQuestion(null)}>Annuler</Bouton><Bouton variante="plein" chargement={occupe} onClick={() => agir(async () => { await mettreEnPause(st.id!, new Date(Date.now() + pauseJours * 86_400_000).toISOString()); setQuestion(null) }, `En pause pour ${pauseJours} jours.`)}>Mettre en pause</Bouton></>}
        >
          <Etiquette texte="Pendant combien de jours ?"><Champ type="number" min={1} max={365} value={pauseJours} onChange={(e) => setPauseJours(Math.max(1, Number(e.target.value) || 1))} className="w-32" /></Etiquette>
        </Dialogue>
      ) : null}
    </Panneau>
  )
}
