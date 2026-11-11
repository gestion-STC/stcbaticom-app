// ═══════════════════════════════════════════════════════════════════════════
// AGENDA DES GESTIONNAIRES — façon Google Agenda (Mahdi, 11/11/2026, maquette validée).
//
// Les agendas à cocher : Rendez-vous et Tâches (table `activites`, lue par `chargerAgenda`), les appels et LinkedIn
// demandés par les campagnes (`cmp_taches`), les jours fériés. Un clic sur un événement ouvre sa bulle : appeler,
// fait, reporter, ouvrir la fiche, supprimer. « Créer » fait une tâche ou un RDV rattachés à une agence.
// L'agenda des sous-traitants est à part (recrutement/AgendaST.tsx) : chacun ses agendas.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { ArrowUpRight, CalendarClock, Check, ExternalLink, MapPin, Phone, Trash2, Undo2, Video } from "lucide-react"
import { chargerAgence, chargerAgences, chargerAgenda, creerRdv, creerTache, deplacerTache, supprimerActivite, terminerTache, type TacheAgenda } from "../../demarchage/db"
import { nomContact, type Agence, type Contact } from "../../demarchage/modele"
import { composerDate, dateLongue, debutDuJour, decomposerDate, heureCourte, libelleRelatif, majusculeInitiale } from "../../demarchage/aujourdhuiOutils"
import { useSession } from "../../lib/auth"
import { estAdmin, nomAffiche } from "../../lib/comptes"
import { Bandeau, Bouton, Champ, Dialogue, Etiquette, Selecteur, Zone } from "../../ui"
import { aMoi, tacheCampagnePourMoi } from "../../lib/perimetre"
import { chargerTachesCampagne, rechercheLinkedin, terminerTacheCampagne, type TacheCampagne } from "../../lib/tachesCampagne"
import CalendrierGoogle, { type AgendaDef, type Bulle, type EvAgenda } from "../agenda/CalendrierGoogle"
import { bornesVue, type Vue } from "../../lib/agendaGrille"

type TypeRdv = "telephone" | "visio" | "sur_place"
const TYPES_RDV: { code: TypeRdv; libelle: string }[] = [
  { code: "telephone", libelle: "Téléphone" },
  { code: "visio", libelle: "Visio" },
  { code: "sur_place", libelle: "Sur place" },
]
const libelleRdv = (type: string) => TYPES_RDV.find((t) => t.code === type)?.libelle ?? "Téléphone"
function IconeRdv({ type, taille = 14 }: { type: string; taille?: number }) {
  if (type === "visio") return <Video size={taille} />
  if (type === "sur_place") return <MapPin size={taille} />
  return <Phone size={taille} />
}
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const s = (n: number) => (n > 1 ? "s" : "")
const titreDe = (t: TacheAgenda) => t.titre || (t.type === "rdv" ? "RDV" : "Tâche")
const jourMois = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })

const AGENDAS: AgendaDef[] = [
  { id: "rdv", nom: "Rendez-vous", couleur: "#2f6fe0" },
  { id: "taches", nom: "Tâches et rappels", couleur: "#7c3aed" },
  { id: "campagnes", nom: "À appeler pour les campagnes", couleur: "#b25e00" },
  { id: "linkedin", nom: "LinkedIn", couleur: "#0a66c2" },
]
const BOUTON_ICONE = "flex h-9 w-9 items-center justify-center rounded-full text-encre-2 hover:bg-fond-3"

export default function Agenda({ onOuvrirAgence, onOuvrirSession }: {
  onOuvrirAgence?: (agenceId: string) => void
  onOuvrirSession?: (agenceId: string) => void
}) {
  const session = useSession()
  const compteNom = nomAffiche(session)
  const moiId = session?.user?.id ?? ""
  const admin = estAdmin(session)
  const [vue, setVue] = useState<Vue>("semaine")
  const [ancre, setAncre] = useState(() => new Date())
  const [maintenant, setMaintenant] = useState(() => new Date())
  const [taches, setTaches] = useState<TacheAgenda[] | null>(null)
  // Les tâches et RDV non faits d'AVANT la période affichée : en tête d'aujourd'hui, en rouge.
  const [retards, setRetards] = useState<TacheAgenda[]>([])
  const [campagne, setCampagne] = useState<TacheCampagne[]>([])
  // Un administrateur choisit : ses lignes, ou celles de toute l'équipe.
  const [equipe, setEquipe] = useState(true)
  const [erreur, setErreur] = useState("")
  const [occupe, setOccupe] = useState(false)
  const [report, setReport] = useState<{ id: string; jour: string; heure: string } | null>(null)
  const [aSupprimer, setASupprimer] = useState<TacheAgenda | null>(null)
  const [creation, setCreation] = useState<"tache" | "rdv" | null>(null)
  const enVie = useRef(true)
  const toutVoir = admin && equipe
  const bornes = useMemo(() => bornesVue(vue, ancre), [vue, ancre])

  const charger = useCallback(async () => {
    try {
      // Cloisonnement (09/11/2026) : un téléprospecteur ne voit que ses tâches et RDV ; un administrateur tout, s'il le veut.
      const [lignes, anciens, demandes] = await Promise.all([
        chargerAgenda(bornes.de, bornes.a).then((l) => l.filter((t) => aMoi(t, moiId, toutVoir))),
        chargerAgenda(new Date(2020, 0, 1), debutDuJour(new Date()), { seulementOuvertes: true }).then((l) => l.filter((t) => aMoi(t, moiId, toutVoir) && t.echeance !== null && new Date(t.echeance) < bornes.de)),
        chargerTachesCampagne().then((l) => l.filter((t) => t.baseId !== "artisans" && tacheCampagnePourMoi(t, moiId, toutVoir, ["demarchage"]))),
      ])
      if (!enVie.current) return
      setTaches(lignes); setRetards(anciens); setCampagne(demandes); setMaintenant(new Date()); setErreur("")
    } catch (e) {
      if (enVie.current) setErreur(message(e))
    }
  }, [bornes, moiId, toutVoir])

  useEffect(() => {
    enVie.current = true
    const premier = setTimeout(charger, 0)
    const horloge = setInterval(() => setMaintenant(new Date()), 60_000)
    return () => { enVie.current = false; clearTimeout(premier); clearInterval(horloge) }
  }, [charger])

  const agir = async (f: () => Promise<void>) => {
    setOccupe(true); setErreur("")
    try { await f(); await charger() }
    catch (e) { setErreur(message(e)) }
    finally { setOccupe(false) }
  }

  const aujourdhui = debutDuJour(maintenant)
  const evenements = useMemo<EvAgenda[]>(() => {
    const out: EvAgenda[] = []
    for (const t of taches ?? []) {
      if (!t.echeance) continue
      const debut = new Date(t.echeance)
      out.push({ id: t.id, agenda: t.type === "rdv" ? "rdv" : "taches", titre: titreDe(t), detail: [t.agenceNom, t.contactNom].filter(Boolean).join(" · "), debut, jour: debut, dureeMin: t.type === "rdv" ? 45 : 30, fait: Boolean(t.faitLe), retard: !t.faitLe && debut < maintenant })
    }
    for (const t of retards) out.push({ id: t.id, agenda: t.type === "rdv" ? "rdv" : "taches", titre: `${titreDe(t)} · ${t.agenceNom}`, detail: `en retard depuis le ${jourMois(t.echeance!)}`, debut: null, jour: aujourdhui, retard: true })
    for (const t of campagne) out.push({ id: `c-${t.id}`, agenda: t.type === "linkedin" ? "linkedin" : "campagnes", titre: t.type === "linkedin" ? `LinkedIn · ${t.personne || t.nom}` : `Appeler ${t.appelStandard ? "le standard" : t.personne || "le contact"} · ${t.nom}`, detail: t.campagneNom, debut: null, jour: aujourdhui })
    return out
  }, [taches, retards, campagne, maintenant, aujourdhui])

  const parId = useMemo(() => new Map([...(taches ?? []), ...retards].map((t) => [t.id, t])), [taches, retards])
  const nbAFaire = (taches ?? []).filter((t) => !t.faitLe).length + retards.length + campagne.length
  const nbFaits = (taches ?? []).filter((t) => t.faitLe).length

  const bulle = (ev: EvAgenda, fermer: () => void): Bulle => {
    // Une demande de campagne.
    if (ev.id.startsWith("c-")) {
      const t = campagne.find((x) => `c-${x.id}` === ev.id)
      if (!t) return { lignes: null }
      return {
        quand: "À faire maintenant, demandé par la campagne",
        lignes: <>
          <p><b className="font-medium">{t.nom || "Sans nom"}</b>{t.personne ? ` · ${t.personne}` : ""}{t.type === "appel" && t.telephone ? <span className="chiffres text-encre-2"> · {t.appelStandard ? "standard " : ""}{t.telephone}</span> : null}</p>
          {t.consigne ? <p className="text-encre-2">{t.consigne}</p> : null}
          <p className="text-encre-2">Campagne « {t.campagneNom} »</p>
        </>,
        boutons: <>
          {t.type === "appel" ? <Bouton taille="sm" variante="plein" icone={<Phone />} onClick={() => { fermer(); onOuvrirSession?.(t.contactRef) }}>Appeler</Bouton> : <a className="inline-flex h-8 items-center gap-1.5 rounded-4 bg-action px-3 text-legende font-medium text-white hover:bg-action-survol" href={rechercheLinkedin(t)} target="_blank" rel="noreferrer"><ExternalLink size={14} />Chercher sur LinkedIn</a>}
          <Bouton taille="sm" icone={<Check />} disabled={occupe} onClick={() => agir(async () => { await terminerTacheCampagne(t.id); fermer() })}>Fait</Bouton>
          <Bouton taille="sm" icone={<ArrowUpRight />} onClick={() => { fermer(); onOuvrirAgence?.(t.contactRef) }}>Ouvrir la fiche</Bouton>
        </>,
      }
    }
    // Une tâche ou un RDV.
    const t = parId.get(ev.id)
    if (!t) return { lignes: null }
    const enReport = report?.id === t.id ? report : null
    const deplacer = (e: FormEvent) => {
      e.preventDefault()
      if (!enReport) return
      const date = composerDate(enReport.jour, enReport.heure)
      if (!date) { setErreur("Choisis une date et une heure."); return }
      agir(async () => { await deplacerTache(t.id, date.toISOString()); setReport(null); fermer() })
    }
    return {
      quand: t.echeance ? `${majusculeInitiale(dateLongue(new Date(t.echeance)))} · ${heureCourte(t.echeance)} · ${libelleRelatif(t.echeance, maintenant)}` : "Sans date",
      icones: <>
        <button type="button" aria-label="Reporter" title="Reporter" disabled={Boolean(t.faitLe)} onClick={() => setReport(enReport ? null : { id: t.id, ...decomposerDate(t.echeance) })} className={BOUTON_ICONE}><CalendarClock size={18} /></button>
        <button type="button" aria-label="Supprimer" title="Supprimer" onClick={() => { fermer(); setASupprimer(t) }} className={BOUTON_ICONE}><Trash2 size={18} /></button>
      </>,
      lignes: <>
        {t.type === "rdv" ? <p className="flex items-center gap-1.5 text-encre-2"><IconeRdv type={t.rdvType} /> RDV {libelleRdv(t.rdvType).toLowerCase()}</p> : null}
        <p><button type="button" className="font-medium text-encre underline-offset-2 hover:underline" onClick={() => { fermer(); onOuvrirAgence?.(t.agenceId) }}>{t.agenceNom || "—"}</button>{t.agenceTelephone ? <span className="chiffres text-encre-2"> · {t.agenceTelephone}</span> : null}</p>
        {t.contactNom ? <p className="text-encre-2">Contact : {t.contactNom}</p> : null}
        <p className="text-encre-2">{t.faitLe ? `Fait ${libelleRelatif(t.faitLe, maintenant)}` : ev.retard ? "En retard" : "À faire"}{t.compteNom ? ` · par ${t.compteNom}` : ""}</p>
        {t.note ? <p className="whitespace-pre-wrap rounded-4 bg-fond-2 p-2.5 text-encre">{t.note}</p> : null}
        {erreur ? <Bandeau role="alerte">{erreur}</Bandeau> : null}
        {enReport ? (
          <form onSubmit={deplacer} className="grid items-end gap-2 rounded-4 border-[0.5px] border-trait bg-fond-2 p-2.5 sm:grid-cols-[1fr_96px_auto]">
            <Etiquette texte="Nouvelle date"><Champ type="date" value={enReport.jour} onChange={(e) => setReport({ ...enReport, jour: e.target.value })} required /></Etiquette>
            <Etiquette texte="Heure"><Champ type="time" value={enReport.heure} onChange={(e) => setReport({ ...enReport, heure: e.target.value })} required /></Etiquette>
            <Bouton type="submit" taille="sm" chargement={occupe}>Déplacer</Bouton>
          </form>
        ) : null}
      </>,
      boutons: <>
        <Bouton taille="sm" variante="plein" icone={<Phone />} onClick={() => { fermer(); onOuvrirSession?.(t.agenceId) }}>Appeler</Bouton>
        <Bouton taille="sm" icone={t.faitLe ? <Undo2 /> : <Check />} chargement={occupe} onClick={() => agir(async () => { await terminerTache(t.id, !t.faitLe); fermer() })}>{t.faitLe ? "Remettre à faire" : "Fait"}</Bouton>
        <Bouton taille="sm" icone={<ArrowUpRight />} onClick={() => { fermer(); onOuvrirAgence?.(t.agenceId) }}>Ouvrir la fiche</Bouton>
      </>,
    }
  }

  return (
    <>
      <CalendrierGoogle
        cle="agenda_gestionnaires_caches"
        titre="Agenda"
        sousTitre={taches ? `${nbAFaire} à faire${nbFaits ? `, ${nbFaits} fait${s(nbFaits)}` : ""}` : undefined}
        agendas={AGENDAS}
        evenements={evenements}
        chargement={taches === null && !erreur}
        erreur={erreur && !aSupprimer ? <Bandeau role="alerte" className="mx-6 mt-3" action={<Bouton taille="sm" variante="discret" onClick={() => setErreur("")}>Fermer</Bouton>}>{erreur}</Bandeau> : null}
        vue={vue} onVue={setVue} ancre={ancre} onAncre={setAncre} maintenant={maintenant}
        creer={[{ libelle: "Tâche", onClick: () => setCreation("tache") }, { libelle: "Rendez-vous", onClick: () => setCreation("rdv") }]}
        barre={admin ? (
          <div role="group" aria-label="Qui" className="flex overflow-hidden rounded-[6px] border-[0.5px] border-trait-fort">
            <button type="button" aria-pressed={!equipe} onClick={() => setEquipe(false)} className={`h-9 px-3.5 text-colonne ${!equipe ? "bg-fond-4 font-medium text-encre" : "text-encre-2 hover:bg-fond-3"}`}>Moi</button>
            <button type="button" aria-pressed={equipe} onClick={() => setEquipe(true)} className={`h-9 border-l-[0.5px] border-trait-fort px-3.5 text-colonne ${equipe ? "bg-fond-4 font-medium text-encre" : "text-encre-2 hover:bg-fond-3"}`}>Toute l'équipe</button>
          </div>
        ) : null}
        bulle={bulle}
      />

      {aSupprimer ? (
        <Dialogue
          titre="Supprimer cette ligne ?"
          description={`« ${titreDe(aSupprimer)} » pour ${aSupprimer.agenceNom} disparaît de l'agenda et du fil de l'agence. On ne peut pas revenir en arrière.`}
          onFermer={() => setASupprimer(null)}
          pied={<><Bouton onClick={() => setASupprimer(null)}>Annuler</Bouton><Bouton variante="danger" icone={<Trash2 />} chargement={occupe} onClick={() => agir(async () => { await supprimerActivite(aSupprimer.id); setASupprimer(null) })}>Supprimer</Bouton></>}
        >{erreur ? <Bandeau role="alerte">{erreur}</Bandeau> : null}</Dialogue>
      ) : null}

      {creation ? (
        <DialogueCreation
          type={creation}
          compteNom={compteNom}
          jourParDefaut={ancre}
          onFermer={() => setCreation(null)}
          onCree={() => { setCreation(null); charger() }}
        />
      ) : null}
    </>
  )
}

/** Créer une tâche ou un RDV : une agence cherchée par son nom, un contact facultatif, un titre, une date et une heure. */
function DialogueCreation({ type, compteNom, jourParDefaut, onFermer, onCree }: {
  type: "tache" | "rdv"
  compteNom: string
  jourParDefaut: Date
  onFermer: () => void
  onCree: () => void
}) {
  const [recherche, setRecherche] = useState("")
  const [resultats, setResultats] = useState<Agence[]>([])
  const [agence, setAgence] = useState<Agence | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactId, setContactId] = useState("")
  const [titre, setTitre] = useState(type === "rdv" ? "RDV" : "Rappeler")
  const [jour, setJour] = useState(() => decomposerDate(jourParDefaut.toISOString()).jour)
  const [heure, setHeure] = useState("10:00")
  const [rdvType, setRdvType] = useState<TypeRdv>("telephone")
  const [note, setNote] = useState("")
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState("")

  // La recherche d'agence, 250 ms après la dernière frappe ; les résultats ne
  // s'affichent que tant que le texte tapé n'est pas celui d'une agence choisie.
  useEffect(() => {
    const texte = recherche.trim()
    if (texte.length < 2) return
    let vivant = true
    const t = setTimeout(() => {
      chargerAgences({ recherche: texte, limite: 10 })
        .then((r) => { if (vivant) setResultats(r) })
        .catch((e) => { if (vivant) setErreur(message(e)) })
    }, 250)
    return () => { vivant = false; clearTimeout(t) }
  }, [recherche])
  const propositions = recherche.trim().length >= 2 && (!agence || recherche !== agence.nom) ? resultats : []

  const choisir = (a: Agence) => {
    setAgence(a); setRecherche(a.nom); setContacts([]); setContactId("")
    chargerAgence(a.id)
      .then(({ contacts: c }) => {
        const actifs = c.filter((x) => !x.parti)
        setContacts(actifs)
        setContactId(actifs.find((x) => x.principal)?.id ?? "")
      })
      .catch((e) => setErreur(message(e)))
  }

  const valider = async (e: FormEvent) => {
    e.preventDefault()
    if (!agence) { setErreur("Choisis une agence dans la liste."); return }
    const date = composerDate(jour, heure)
    if (!date) { setErreur("Choisis une date et une heure."); return }
    if (!titre.trim()) { setErreur("Donne un titre."); return }
    setOccupe(true); setErreur("")
    try {
      const commun = { agenceId: agence.id, contactId: contactId || null, compteNom, titre: titre.trim(), echeance: date.toISOString(), note: note.trim() }
      if (type === "rdv") await creerRdv({ ...commun, rdvType })
      else await creerTache(commun)
      onCree()
    } catch (err) {
      setErreur(message(err))
      setOccupe(false)
    }
  }

  return (
    <Dialogue
      titre={type === "rdv" ? "Nouveau RDV" : "Nouvelle tâche"}
      description={type === "rdv" ? "Le rendez-vous ira dans l'agenda et dans le fil de l'agence." : "Une tâche datée : elle ressortira dans « À rappeler aujourd'hui » à sa date."}
      onFermer={onFermer}
      largeur="max-w-xl"
      pied={<><Bouton onClick={onFermer}>Annuler</Bouton><Bouton variante="plein" type="submit" form="form-creation" chargement={occupe}>{type === "rdv" ? "Créer le RDV" : "Créer la tâche"}</Bouton></>}
    >
      {erreur ? <Bandeau role="alerte" className="mb-3">{erreur}</Bandeau> : null}
      <form id="form-creation" onSubmit={valider} className="grid gap-3">
        <Etiquette texte="Agence" aide={agence ? <span className="text-ok">{agence.nom}{agence.secteurLibelle ? ` · ${agence.secteurLibelle}` : ""}</span> : "Tape le nom, puis choisis dans la liste."}>
          <span className="relative block">
            <Champ value={recherche} onChange={(e) => { setRecherche(e.target.value); if (agence && e.target.value !== agence.nom) { setAgence(null); setContacts([]); setContactId("") } }} placeholder="Nom de l'agence" autoFocus autoComplete="off" />
            {propositions.length ? (
              <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-4 border border-trait bg-fond shadow-flottante">
                {propositions.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => choisir(a)} className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-legende hover:bg-fond-3">
                      <span className="min-w-0 truncate font-medium text-encre">{a.nom}</span>
                      <span className="shrink-0 text-encre-2">{a.secteurLibelle || a.telephone}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </span>
        </Etiquette>
        <div className={"grid gap-3 " + (type === "rdv" ? "sm:grid-cols-2" : "")}>
          <Etiquette texte="Contact (facultatif)">
            <Selecteur value={contactId} onChange={(e) => setContactId(e.target.value)} disabled={!agence}>
              <option value="">{agence ? (contacts.length ? "Le standard" : "Aucun contact sur cette agence") : "Choisis d'abord une agence"}</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{nomContact(c)}{c.principal ? " (principal)" : ""}</option>)}
            </Selecteur>
          </Etiquette>
          {type === "rdv" ? (
            <Etiquette texte="Type de RDV">
              <Selecteur value={rdvType} onChange={(e) => setRdvType(e.target.value as TypeRdv)}>
                {TYPES_RDV.map((t) => <option key={t.code} value={t.code}>{t.libelle}</option>)}
              </Selecteur>
            </Etiquette>
          ) : null}
        </div>
        <Etiquette texte="Titre"><Champ value={titre} onChange={(e) => setTitre(e.target.value)} required /></Etiquette>
        <div className="grid gap-3 sm:grid-cols-2">
          <Etiquette texte="Date"><Champ type="date" value={jour} onChange={(e) => setJour(e.target.value)} required /></Etiquette>
          <Etiquette texte="Heure"><Champ type="time" value={heure} onChange={(e) => setHeure(e.target.value)} required /></Etiquette>
        </div>
        <Etiquette texte="Note (facultatif)"><Zone value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Ce qu'il faut avoir en tête au moment de l'appel" /></Etiquette>
      </form>
    </Dialogue>
  )
}
