// ════════════════════════════════════════════════════════════════════════════
// SÉQUENCES — la suite d'e-mails et de SMS que reçoit chaque artisan démarré
//
// À gauche, les séquences (une seule est « utilisée » : celle que la machine
// prend pour démarrer les artisans). À droite, les étapes de la séquence
// choisie, dans l'ordre d'envoi. Chaque étape est contrôlée AVANT d'être
// enregistrée (verifierEtape) : rien ne part sans lien de désinscription.
// L'éditeur montre l'étape telle que l'artisan la recevra (aperçu rempli avec
// un artisan d'exemple), et un test peut partir vers une adresse ou un mobile.
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowDown, ArrowUp, Copy, Pencil, Plus, Power, Send, Trash2 } from "lucide-react"
import type { CanalEtape, EtapeST, SequenceST } from "../../recrutement"
import { etapeVide, variablesST } from "../../recrutement"
import { supabaseConfigure } from "../../lib/supabase"
import { chargerSequences, creerSequence, majSequence, supprimerSequence, chargerEtapes, creerEtape, majEtape, supprimerEtape } from "../../lib/sequencesStDb"
import { chargerPilotage, majPilotage } from "../../lib/pilotageStDb"
import { envoyerEmailTest, envoyerSmsTest } from "../../lib/machineDb"
import { numeroValide } from "../../lib/telephone"
import {
  apercuTexte, aUnBloquant, estHtml, exempleObjet, exempleRemplissage, htmlPourEnvoi, libelleSms,
  LIENS_EXEMPLE, LIENS_TAILLE_REELLE, segmentsSms, verifierEtape,
} from "../../lib/sequencesOutils"
import { Bandeau, Bouton, Carte, Case, Champ, Chargement, Dialogue, EnTetePage, Etiquette, Onglets, Panneau, Pastille, Selecteur, TitreCarte, Vide, Zone } from "../../ui"

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))
const libelleCanal = (c: CanalEtape) => (c === "sms" ? "SMS" : "E-mail")

type Dial =
  | { type: "nouvelle" }
  | { type: "renommer"; seq: SequenceST }
  | { type: "supprimerSeq"; seq: SequenceST }
  | { type: "supprimerEtape"; etape: EtapeST }

export default function SequencesST() {
  const [sequences, setSequences] = useState<SequenceST[]>([])
  const [selId, setSelId] = useState<string | null>(null)
  const [etapes, setEtapes] = useState<EtapeST[]>([])
  const [chargement, setChargement] = useState(!!supabaseConfigure)
  const [erreur, setErreur] = useState(supabaseConfigure ? "" : "Base non configurée.")
  const [info, setInfo] = useState("")
  const [occupe, setOccupe] = useState(false)
  // Les réglages de la machine : l'adresse des tests, et la séquence qu'elle prend.
  const [emailTest, setEmailTest] = useState("")
  const [seqReglagesId, setSeqReglagesId] = useState<string | null>(null)
  const [dialogue, setDialogue] = useState<Dial | null>(null)
  const [nom, setNom] = useState("")
  const [editeur, setEditeur] = useState<EtapeST | null>(null)
  const [test, setTest] = useState<EtapeST | null>(null)

  const choisir = (id: string | null) => { setSelId(id); setEtapes([]) }

  const charger = useCallback(() =>
    Promise.all([chargerSequences(), chargerPilotage().catch(() => null)])
      .then(([seqs, pil]) => {
        setSequences(seqs)
        setEmailTest(pil?.emailTest ?? "")
        setSeqReglagesId(pil?.sequenceId ?? null)
        const parDefaut = (pil?.sequenceId && seqs.some((s) => s.id === pil.sequenceId) ? pil.sequenceId : null) ?? seqs.find((s) => s.actif)?.id ?? seqs[0]?.id ?? null
        setSelId((cur) => cur ?? parDefaut)
      })
      .catch((e) => setErreur(msg(e)))
      .finally(() => setChargement(false)),
  [])
  useEffect(() => { if (supabaseConfigure) charger() }, [charger])

  // Les étapes de la séquence choisie (on ignore une réponse arrivée après un changement de choix).
  useEffect(() => {
    if (!selId) return
    let vivant = true
    chargerEtapes(selId).then((l) => { if (vivant) setEtapes(l) }).catch((e) => { if (vivant) setErreur(msg(e)) })
    return () => { vivant = false }
  }, [selId])

  // La séquence que la machine utilise : celle des réglages, sinon celle marquée active.
  const idUtilisee = useMemo(
    () => (seqReglagesId && sequences.some((s) => s.id === seqReglagesId) ? seqReglagesId : sequences.find((s) => s.actif)?.id ?? null),
    [seqReglagesId, sequences],
  )
  const seq = sequences.find((s) => s.id === selId) ?? null

  const agir = async (f: () => Promise<void>, message?: string) => {
    setOccupe(true); setErreur(""); setInfo("")
    try { await f(); if (message) setInfo(message) }
    catch (e) { setErreur(msg(e)) }
    finally { setOccupe(false) }
  }
  const ouvrirDialogue = (d: Dial) => { setNom(d.type === "renommer" ? d.seq.nom : d.type === "nouvelle" ? "Nouvelle séquence" : ""); setDialogue(d) }

  // ── Les séquences ──────────────────────────────────────────────────────────
  const creerNouvelle = () => agir(async () => {
    const s = await creerSequence(nom.trim() || "Nouvelle séquence")
    setSequences((l) => [...l, s]); choisir(s.id ?? null); setDialogue(null)
  })
  const renommer = (s: SequenceST) => agir(async () => {
    const n = nom.trim()
    if (n && n !== s.nom) { await majSequence(s.id!, { nom: n }); setSequences((l) => l.map((x) => (x.id === s.id ? { ...x, nom: n } : x))) }
    setDialogue(null)
  })
  // Une seule séquence utilisée : on l'écrit dans les réglages (c'est là que
  // la machine regarde d'abord) ET sur le drapeau « actif », pour que les deux
  // sources racontent la même chose.
  const utiliser = (s: SequenceST) => agir(async () => {
    await Promise.all(sequences.filter((x) => x.actif && x.id !== s.id).map((x) => majSequence(x.id!, { actif: false })))
    if (!s.actif) await majSequence(s.id!, { actif: true })
    await majPilotage({ sequenceId: s.id })
    setSequences((l) => l.map((x) => ({ ...x, actif: x.id === s.id })))
    setSeqReglagesId(s.id ?? null)
  }, `La machine démarre désormais les artisans avec « ${s.nom} ».`)
  const dupliquer = (s: SequenceST) => agir(async () => {
    const copie = await creerSequence(`${s.nom} (copie)`)
    const source = s.id === selId ? etapes : await chargerEtapes(s.id!)
    for (const e of source) await creerEtape({ ...e, id: undefined, sequenceId: copie.id! })
    setSequences((l) => [...l, copie]); choisir(copie.id ?? null)
  }, `« ${s.nom} » dupliquée avec ses étapes.`)
  const validerNom = () => {
    if (dialogue?.type === "nouvelle") creerNouvelle()
    else if (dialogue?.type === "renommer") renommer(dialogue.seq)
  }
  const supprimerSeq = (s: SequenceST) => agir(async () => {
    await supprimerSequence(s.id!)
    const reste = sequences.filter((x) => x.id !== s.id)
    setSequences(reste)
    if (selId === s.id) choisir(reste[0]?.id ?? null)
    setDialogue(null)
  })

  // ── Les étapes ─────────────────────────────────────────────────────────────
  const rechargerEtapes = async () => { if (selId) setEtapes(await chargerEtapes(selId).catch(() => etapes)) }
  const trier = (l: EtapeST[]) => [...l].sort((a, b) => a.ordre - b.ordre)
  const enregistrer = async (e: EtapeST) => {
    if (e.id) { await majEtape(e.id, e); setEtapes((l) => trier(l.map((x) => (x.id === e.id ? e : x)))) }
    else { const cree = await creerEtape(e); setEtapes((l) => trier([...l, cree])) }
    setEditeur(null)
  }
  const deplacer = (i: number, sens: -1 | 1) => {
    const j = i + sens
    if (j < 0 || j >= etapes.length) return
    const liste = [...etapes]
    ;[liste[i], liste[j]] = [liste[j], liste[i]]
    // L'ordre redevient 0, 1, 2… : seules les deux étapes échangées changent
    // (davantage si la numérotation en base avait des trous — on en profite).
    const renum = liste.map((e, k) => ({ ...e, ordre: k }))
    const changees = renum.filter((e, k) => e.ordre !== liste[k].ordre)
    return agir(async () => {
      try { for (const e of changees) await majEtape(e.id!, e); setEtapes(renum) }
      catch (err) { await rechargerEtapes(); throw err }
    })
  }
  const basculer = (e: EtapeST) => agir(async () => {
    const maj = { ...e, actif: !e.actif }
    await majEtape(e.id!, maj)
    setEtapes((l) => l.map((x) => (x.id === e.id ? maj : x)))
  })
  const supprimerEt = (e: EtapeST) => agir(async () => {
    await supprimerEtape(e.id!)
    setEtapes((l) => l.filter((x) => x.id !== e.id))
    setDialogue(null)
  })

  const resume = useMemo(() => {
    if (etapes.length === 0) return "Aucune étape : rien ne part encore."
    const actives = etapes.filter((e) => e.actif)
    const jours = actives.map((e) => e.delaiJours)
    const plage = jours.length ? ` · de J+${Math.min(...jours)} à J+${Math.max(...jours)}` : ""
    return `${etapes.length} étape${etapes.length > 1 ? "s" : ""} · ${actives.length} active${actives.length > 1 ? "s" : ""}${plage}`
  }, [etapes])

  return (
    <div className="page">
      <EnTetePage
        titre="Séquences"
        sousTitre="La suite d'e-mails et de SMS que reçoit chaque artisan démarré"
        droite={<Bouton icone={<Plus />} disabled={!supabaseConfigure} onClick={() => ouvrirDialogue({ type: "nouvelle" })}>Nouvelle séquence</Bouton>}
      />

      {erreur ? <Bandeau role="alerte" className="mb-4" action={<Bouton variante="discret" taille="sm" onClick={() => setErreur("")}>Fermer</Bouton>}>{erreur}</Bandeau> : null}
      {info ? <Bandeau role="ok" className="mb-4" action={<Bouton variante="discret" taille="sm" onClick={() => setInfo("")}>Fermer</Bouton>}>{info}</Bandeau> : null}

      {chargement ? <Chargement /> : (
        <div className="flex items-start gap-6">
          {/* ── Colonne de gauche : les séquences ── */}
          <Carte className="w-[300px] shrink-0">
            <TitreCarte>Séquences</TitreCarte>
            {sequences.length === 0 ? (
              <Vide titre="Aucune séquence" texte="Créez-en une pour composer les relances." />
            ) : (
              <ul className="divide-y divide-fond-4 border-t border-trait">
                {sequences.map((s) => {
                  const sel = s.id === selId
                  return (
                    <li key={s.id} className={sel ? "bg-fond-2" : ""}>
                      <button
                        type="button"
                        onClick={() => choisir(s.id ?? null)}
                        className={`flex w-full items-center gap-2 px-5 py-3 text-left text-legende transition-colors hover:bg-fond-3 ${sel ? "font-semibold text-encre" : "text-encre-2"}`}
                      >
                        <span className="min-w-0 flex-1 truncate">{s.nom}</span>
                        {s.id === idUtilisee ? <Pastille role="info" point>utilisée</Pastille> : null}
                      </button>
                      {sel ? (
                        <div className="flex flex-wrap gap-1 px-3 pb-3">
                          <Bouton variante="discret" taille="sm" icone={<Pencil />} onClick={() => ouvrirDialogue({ type: "renommer", seq: s })}>Renommer</Bouton>
                          {s.id !== idUtilisee ? <Bouton variante="discret" taille="sm" icone={<Power />} disabled={occupe} onClick={() => utiliser(s)}>Utiliser celle-ci</Bouton> : null}
                          <Bouton variante="discret" taille="sm" icone={<Copy />} disabled={occupe} onClick={() => dupliquer(s)}>Dupliquer</Bouton>
                          <Bouton variante="discret" taille="sm" icone={<Trash2 />} disabled={occupe} onClick={() => ouvrirDialogue({ type: "supprimerSeq", seq: s })}>Supprimer</Bouton>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </Carte>

          {/* ── À droite : les étapes de la séquence choisie ── */}
          <div className="min-w-0 flex-1">
            {!seq ? (
              <Carte><Vide titre="Choisissez une séquence" texte="Ou créez-en une : chaque étape part à J+X après le démarrage de l'artisan, dans la plage horaire de la machine." /></Carte>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-section font-semibold tracking-[-0.015em] text-encre">{seq.nom}</h2>
                    <p className="mt-1 text-legende text-encre-2">{resume}</p>
                  </div>
                  <Bouton variante="plein" icone={<Plus />} onClick={() => setEditeur(etapeVide(seq.id!, etapes.length))}>Ajouter une étape</Bouton>
                </div>

                {etapes.length === 0 ? (
                  <Carte><Vide titre="Aucune étape" texte="Ajoutez un premier e-mail ou SMS : il partira le jour du démarrage (J+0)." /></Carte>
                ) : (
                  <div className="space-y-3">
                    {etapes.map((e, i) => {
                      const avert = verifierEtape(e)
                      return (
                        <Carte key={e.id} className={`p-4 ${e.actif ? "" : "opacity-70"}`}>
                          <div className="flex items-start gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-legende font-semibold text-encre">Étape {i + 1}</span>
                                <Pastille role={e.canal === "sms" ? "info" : "actif"}>{libelleCanal(e.canal)}</Pastille>
                                <span className="chiffres text-legende text-encre-2">J+{e.delaiJours}</span>
                                {!e.actif ? <Pastille role="inerte">désactivée</Pastille> : null}
                              </div>
                              {e.canal === "email" ? (
                                <div className="mt-1.5 truncate text-corps font-medium text-encre">{e.objet || <span className="italic text-encre-2">Sans objet</span>}</div>
                              ) : null}
                              <p className="mt-1 line-clamp-3 whitespace-pre-line text-legende text-encre-2">{apercuTexte(e.contenu) || "Vide"}</p>
                              {avert.map((a, k) => (
                                <Bandeau key={k} role={a.niveau === "bloquant" ? "alerte" : "attention"} className="mt-2">{a.texte}</Bandeau>
                              ))}
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                              <Bouton variante="discret" taille="icone" icone={<ArrowUp />} aria-label="Monter" title="Monter" disabled={occupe || i === 0} onClick={() => deplacer(i, -1)} />
                              <Bouton variante="discret" taille="icone" icone={<ArrowDown />} aria-label="Descendre" title="Descendre" disabled={occupe || i === etapes.length - 1} onClick={() => deplacer(i, 1)} />
                              <Bouton variante="discret" taille="sm" icone={<Pencil />} onClick={() => setEditeur(e)}>Modifier</Bouton>
                              <Bouton variante="discret" taille="sm" icone={<Power />} disabled={occupe} onClick={() => basculer(e)}>{e.actif ? "Désactiver" : "Activer"}</Bouton>
                              <Bouton variante="discret" taille="sm" icone={<Send />} onClick={() => setTest(e)}>Envoyer un test</Bouton>
                              <Bouton variante="discret" taille="sm" icone={<Trash2 />} disabled={occupe} onClick={() => ouvrirDialogue({ type: "supprimerEtape", etape: e })}>Supprimer</Bouton>
                            </div>
                          </div>
                        </Carte>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── L'éditeur d'étape ── */}
      {editeur ? <EditeurEtape etape={editeur} emailTest={emailTest} onFermer={() => setEditeur(null)} onEnregistrer={enregistrer} /> : null}

      {/* ── Le test depuis la liste ── */}
      {test ? <DialogueTest etape={test} emailTest={emailTest} onFermer={() => setTest(null)} /> : null}

      {/* ── Les questions ── */}
      {dialogue?.type === "nouvelle" || dialogue?.type === "renommer" ? (
        <Dialogue
          titre={dialogue.type === "nouvelle" ? "Nouvelle séquence" : "Renommer la séquence"}
          onFermer={() => setDialogue(null)}
          pied={<>
            <Bouton onClick={() => setDialogue(null)}>Annuler</Bouton>
            <Bouton variante="plein" chargement={occupe} disabled={!nom.trim()} onClick={validerNom}>
              {dialogue.type === "nouvelle" ? "Créer" : "Renommer"}
            </Bouton>
          </>}
        >
          <Etiquette texte="Nom">
            <Champ autoFocus value={nom} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && nom.trim() && !occupe) validerNom() }} placeholder="Ex. : Relance artisans 2026" />
          </Etiquette>
        </Dialogue>
      ) : null}
      {dialogue?.type === "supprimerSeq" ? (
        dialogue.seq.id === idUtilisee ? (
          <Dialogue
            titre="Cette séquence est utilisée"
            description={`« ${dialogue.seq.nom} » est celle que la machine prend pour démarrer les artisans. Choisissez-en une autre (« Utiliser celle-ci ») avant de la supprimer.`}
            onFermer={() => setDialogue(null)}
            pied={<Bouton onClick={() => setDialogue(null)}>Fermer</Bouton>}
          />
        ) : (
          <Dialogue
            titre={`Supprimer « ${dialogue.seq.nom} » ?`}
            description="La séquence et toutes ses étapes disparaissent. Les artisans déjà démarrés avec elle ne recevront plus la suite."
            onFermer={() => setDialogue(null)}
            pied={<><Bouton onClick={() => setDialogue(null)}>Annuler</Bouton><Bouton variante="danger" chargement={occupe} onClick={() => supprimerSeq(dialogue.seq)}>Supprimer</Bouton></>}
          />
        )
      ) : null}
      {dialogue?.type === "supprimerEtape" ? (
        <Dialogue
          titre="Supprimer cette étape ?"
          description={`${libelleCanal(dialogue.etape.canal)} à J+${dialogue.etape.delaiJours}${dialogue.etape.objet ? ` · ${dialogue.etape.objet}` : ""}. Pour la suspendre sans la perdre, préférez « Désactiver ».`}
          onFermer={() => setDialogue(null)}
          pied={<><Bouton onClick={() => setDialogue(null)}>Annuler</Bouton><Bouton variante="danger" chargement={occupe} onClick={() => supprimerEt(dialogue.etape)}>Supprimer</Bouton></>}
        />
      ) : null}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// L'ÉDITEUR D'ÉTAPE — un panneau : canal, délai, objet, contenu, variables,
// compteur SMS, aperçu rempli ; les contrôles sous le contenu, un bloquant
// empêche d'enregistrer.
// ════════════════════════════════════════════════════════════════════════════
function EditeurEtape({ etape, emailTest, onFermer, onEnregistrer }: {
  etape: EtapeST
  emailTest: string
  onFermer: () => void
  onEnregistrer: (e: EtapeST) => Promise<void>
}) {
  const [f, setF] = useState<EtapeST>({ ...etape })
  const [onglet, setOnglet] = useState<"contenu" | "apercu">("contenu")
  const [enregistrement, setEnregistrement] = useState(false)
  const [erreur, setErreur] = useState("")
  const [test, setTest] = useState(false)
  // La Zone de la trousse ne prend pas de ref : on retrouve le textarea par son cadre.
  const cadreZone = useRef<HTMLDivElement>(null)
  const set = <K extends keyof EtapeST>(k: K, v: EtapeST[K]) => setF((p) => ({ ...p, [k]: v }))

  const sms = f.canal === "sms"
  const avertissements = useMemo(() => verifierEtape(f), [f])
  const bloque = aUnBloquant(avertissements)
  // Le SMS se compte tel qu'il partira : variables remplies, liens à la taille réelle.
  const compte = sms ? segmentsSms(exempleRemplissage(f, LIENS_TAILLE_REELLE)) : null
  const html = estHtml(f.contenu)

  // La variable s'insère là où est le curseur, pas en fin de texte.
  const inserer = (cle: string) => {
    const ta = cadreZone.current?.querySelector("textarea") ?? null
    const debut = ta?.selectionStart ?? f.contenu.length
    const fin = ta?.selectionEnd ?? debut
    set("contenu", f.contenu.slice(0, debut) + cle + f.contenu.slice(fin))
    setOnglet("contenu")
    requestAnimationFrame(() => { if (ta) { ta.focus(); ta.setSelectionRange(debut + cle.length, debut + cle.length) } })
  }

  const enregistrer = async () => {
    setEnregistrement(true); setErreur("")
    try { await onEnregistrer(f) }
    catch (e) { setErreur(msg(e)) }
    finally { setEnregistrement(false) }
  }

  return (
    <Panneau
      titre={etape.id ? "Modifier l'étape" : "Nouvelle étape"}
      sousTitre={`${libelleCanal(f.canal)} à J+${f.delaiJours} après le démarrage de l'artisan`}
      onFermer={() => { if (!test) onFermer() }}
      largeur="w-[720px]"
      pied={<>
        <Bouton onClick={onFermer}>Annuler</Bouton>
        <Bouton icone={<Send />} disabled={bloque} onClick={() => setTest(true)}>Envoyer un test</Bouton>
        <Bouton variante="plein" chargement={enregistrement} disabled={bloque} onClick={enregistrer}>Enregistrer</Bouton>
      </>}
    >
      {erreur ? <Bandeau role="alerte" className="mb-4">{erreur}</Bandeau> : null}

      <div className="grid grid-cols-[160px_140px_1fr] gap-3">
        <Etiquette texte="Canal">
          <Selecteur value={f.canal} onChange={(e) => set("canal", e.target.value as CanalEtape)}>
            <option value="email">E-mail</option>
            <option value="sms">SMS</option>
          </Selecteur>
        </Etiquette>
        <Etiquette texte="Délai (jours)" aide={`J+${f.delaiJours}`}>
          <Champ type="number" min={0} max={365} value={f.delaiJours} onChange={(e) => set("delaiJours", Math.max(0, parseInt(e.target.value) || 0))} />
        </Etiquette>
        {!sms ? (
          <Etiquette texte="Objet">
            <Champ value={f.objet} onChange={(e) => set("objet", e.target.value)} placeholder="Rejoignez les sous-traitants de STC Bâtiment" />
          </Etiquette>
        ) : <div />}
      </div>

      <Onglets className="mt-5" valeur={onglet} onChange={setOnglet} options={[{ id: "contenu", label: "Contenu" }, { id: "apercu", label: "Aperçu" }]} />

      {onglet === "contenu" ? (
        <div className="mt-4">
          <Etiquette texte={sms ? "Texte du SMS" : html ? "Message (HTML)" : "Message"}>
            <div ref={cadreZone}>
            <Zone
              value={f.contenu}
              onChange={(e) => set("contenu", e.target.value)}
              className={`min-h-[260px] resize-y ${html ? "font-mono" : ""}`}
              placeholder={sms
                ? "Bonjour {{contact}}, STC Batiment recrute des {{metier}}. Deposez votre dossier : {{lien_candidature}} - Stop : {{lien_desinscription}}"
                : "Bonjour {{contact}},\n\nNous recherchons des artisans {{metier}}…\nDéposez votre dossier ici : {{lien_candidature}}\n\nPour ne plus recevoir nos messages : {{lien_desinscription}}"}
            />
            </div>
          </Etiquette>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <span className="mr-1 text-colonne text-encre-2">Insérer :</span>
            {variablesST.map((v) => (
              <Bouton key={v.cle} variante="discret" taille="sm" title={v.desc} className="font-mono" onClick={() => inserer(v.cle)}>{v.cle}</Bouton>
            ))}
          </div>
          {compte ? <p className="chiffres mt-2 text-legende text-encre-2">{libelleSms(compte)}</p> : null}
          {avertissements.length ? (
            <div className="mt-3 space-y-2">
              {avertissements.map((a, k) => <Bandeau key={k} role={a.niveau === "bloquant" ? "alerte" : "attention"}>{a.texte}</Bandeau>)}
            </div>
          ) : null}
          <Case className="mt-4" texte="Étape active (décochez pour la suspendre sans la supprimer)" checked={f.actif} onChange={(e) => set("actif", e.target.checked)} />
        </div>
      ) : (
        <div className="mt-4">
          <p className="mb-3 text-legende text-encre-2">Rempli avec un artisan d'exemple : Karim Benali, Benali Rénovation, Électricité.</p>
          {sms ? (
            <Carte className="max-w-[320px] bg-fond-3 px-4 py-3">
              <p className="whitespace-pre-wrap break-words text-corps text-encre">{exempleRemplissage(f, LIENS_TAILLE_REELLE) || <span className="italic text-encre-2">Vide</span>}</p>
              {compte ? <p className="chiffres mt-2 text-colonne text-encre-2">{libelleSms(compte)}</p> : null}
            </Carte>
          ) : (
            <>
              <p className="mb-2 text-legende text-encre"><span className="text-encre-2">Objet :</span> {exempleObjet(f, LIENS_EXEMPLE) || <span className="italic text-encre-2">Sans objet</span>}</p>
              <iframe sandbox="" srcDoc={htmlPourEnvoi(exempleRemplissage(f, LIENS_EXEMPLE), LIENS_EXEMPLE)} className="h-[480px] w-full rounded-4 border border-trait bg-white" title="Aperçu" />
            </>
          )}
        </div>
      )}

      {test ? <DialogueTest etape={f} emailTest={emailTest} onFermer={() => setTest(false)} /> : null}
    </Panneau>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ENVOYER UN TEST — vers une adresse (celle des réglages par défaut) ou un
// mobile ; le contenu est rempli avec l'artisan d'exemple et des liens qui
// ne désinscrivent personne.
// ════════════════════════════════════════════════════════════════════════════
function DialogueTest({ etape, emailTest, onFermer }: { etape: EtapeST; emailTest: string; onFermer: () => void }) {
  const sms = etape.canal === "sms"
  const [dest, setDest] = useState(sms ? "" : emailTest)
  const [envoi, setEnvoi] = useState(false)
  const [etat, setEtat] = useState<{ role: "ok" | "alerte"; texte: string } | null>(null)
  const contenu = exempleRemplissage(etape, LIENS_EXEMPLE)
  const valide = sms ? numeroValide(dest) : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dest.trim())

  const envoyer = async () => {
    setEnvoi(true); setEtat(null)
    try {
      if (sms) await envoyerSmsTest(dest.trim(), contenu)
      else await envoyerEmailTest(dest.trim(), `[Test] ${exempleObjet(etape, LIENS_EXEMPLE)}`, htmlPourEnvoi(contenu, LIENS_EXEMPLE))
      setEtat({ role: "ok", texte: `Test envoyé à ${dest.trim()}.` })
    } catch (e) {
      setEtat({ role: "alerte", texte: msg(e) })
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Dialogue
      titre={sms ? "Envoyer un SMS de test" : "Envoyer un e-mail de test"}
      description="Le message part rempli avec l'artisan d'exemple (Karim Benali, Benali Rénovation) ; le lien de désinscription du test ne mène nulle part."
      onFermer={onFermer}
      pied={<>
        <Bouton onClick={onFermer}>Fermer</Bouton>
        <Bouton variante="plein" icone={<Send />} chargement={envoi} disabled={!valide} onClick={envoyer}>Envoyer</Bouton>
      </>}
    >
      <Etiquette texte={sms ? "Numéro de mobile" : "Adresse e-mail"} aide={sms ? "Le SMS part réellement par Ringover." : emailTest ? "Par défaut : l'adresse de test des réglages." : "Renseignez une adresse de test dans les réglages pour la retrouver ici."}>
        <Champ autoFocus type={sms ? "tel" : "email"} value={dest} onChange={(e) => setDest(e.target.value)} placeholder={sms ? "06 12 34 56 78" : "vous@stcbatiment.fr"} onKeyDown={(e) => { if (e.key === "Enter" && valide && !envoi) envoyer() }} />
      </Etiquette>
      {sms ? (
        <Carte className="mt-4 bg-fond-3 px-4 py-3">
          <p className="whitespace-pre-wrap break-words text-legende text-encre">{contenu}</p>
        </Carte>
      ) : (
        <p className="mt-4 text-legende text-encre"><span className="text-encre-2">Objet :</span> [Test] {exempleObjet(etape, LIENS_EXEMPLE)}</p>
      )}
      {etat ? <Bandeau role={etat.role} className="mt-4">{etat.texte}</Bandeau> : null}
    </Dialogue>
  )
}
