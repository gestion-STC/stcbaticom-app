// ════════════════════════════════════════════════════════════════════════════
// AGENDA — les tâches et les RDV du démarchage, par semaine ou par jour.
//
// Une seule source : la table `activites` (types tâche et RDV), lue par
// `chargerAgenda`. Une ligne cliquée s'ouvre dans un dialogue (fait, reporter,
// appeler, ouvrir la fiche, supprimer). « + Tâche » et « + RDV » créent une
// activité rattachée à une agence (cherchée par son nom) et, au choix, à un de
// ses contacts. Les calculs de dates sont dans aujourdhuiOutils.ts.
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { ArrowUpRight, CalendarClock, Check, ChevronLeft, ChevronRight, MapPin, Phone, Plus, Trash2, Undo2, Video } from "lucide-react"
import { chargerAgence, chargerAgences, chargerAgenda, creerRdv, creerTache, deplacerTache, supprimerActivite, terminerTache, type TacheAgenda } from "../../demarchage/db"
import { nomContact, type Agence, type Contact } from "../../demarchage/modele"
import { ajouterJours, composerDate, dateLongue, debutDeSemaine, debutDuJour, decomposerDate, estEnRetard, finDeSemaine, finDuJour, grouperParHeure, heureCourte, joursDeLaSemaine, libelleRelatif, libelleSemaine, majusculeInitiale, memeJour } from "../../demarchage/aujourdhuiOutils"
import { useSession } from "../../lib/auth"
import { nomAffiche } from "../../lib/comptes"
import { Bandeau, Bouton, Carte, Case, Champ, Chargement, Dialogue, EnTetePage, Etiquette, Ligne, Onglets, Pastille, Selecteur, Vide, Zone } from "../../ui"

type Vue = "semaine" | "jour"
type TypeRdv = "telephone" | "visio" | "sur_place"
const TYPES_RDV: { code: TypeRdv; libelle: string }[] = [
  { code: "telephone", libelle: "Téléphone" },
  { code: "visio", libelle: "Visio" },
  { code: "sur_place", libelle: "Sur place" },
]
const libelleRdv = (type: string) => TYPES_RDV.find((t) => t.code === type)?.libelle ?? "Téléphone"
function IconeRdv({ type, taille = 12 }: { type: string; taille?: number }) {
  if (type === "visio") return <Video size={taille} />
  if (type === "sur_place") return <MapPin size={taille} />
  return <Phone size={taille} />
}
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const s = (n: number) => (n > 1 ? "s" : "")
const titreDe = (t: TacheAgenda) => t.titre || (t.type === "rdv" ? "RDV" : "Tâche")

export default function Agenda({ onOuvrirAgence, onOuvrirSession }: {
  onOuvrirAgence?: (agenceId: string) => void
  onOuvrirSession?: (agenceId: string) => void
}) {
  const session = useSession()
  const compteNom = nomAffiche(session)
  const [vue, setVue] = useState<Vue>("semaine")
  // Le jour sur lequel l'agenda est posé (sa semaine en vue Semaine).
  const [ancre, setAncre] = useState(() => new Date())
  // L'heure de la dernière lecture : « aujourd'hui » et « en retard » s'y rapportent.
  const [maintenant, setMaintenant] = useState(() => new Date())
  const [taches, setTaches] = useState<TacheAgenda[] | null>(null)
  const [masquerFaits, setMasquerFaits] = useState(false)
  const [erreur, setErreur] = useState("")
  const [occupe, setOccupe] = useState(false)
  const [selection, setSelection] = useState<TacheAgenda | null>(null)
  const [report, setReport] = useState<{ jour: string; heure: string } | null>(null)
  const [confirmerSuppression, setConfirmerSuppression] = useState(false)
  const [creation, setCreation] = useState<"tache" | "rdv" | null>(null)
  const enVie = useRef(true)

  const bornes = useMemo(
    () => (vue === "semaine" ? { de: debutDeSemaine(ancre), a: finDeSemaine(ancre) } : { de: debutDuJour(ancre), a: finDuJour(ancre) }),
    [vue, ancre],
  )

  const charger = useCallback(async () => {
    try {
      const lignes = await chargerAgenda(bornes.de, bornes.a)
      if (!enVie.current) return
      setTaches(lignes)
      setMaintenant(new Date())
      setErreur("")
    } catch (e) {
      if (enVie.current) setErreur(message(e))
    }
  }, [bornes])

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
  const decaler = (sens: -1 | 1) => setAncre((a) => ajouterJours(a, vue === "semaine" ? 7 * sens : sens))
  const fermerSelection = () => { setSelection(null); setReport(null); setConfirmerSuppression(false) }

  const basculerFait = (t: TacheAgenda) => agir(async () => { await terminerTache(t.id, !t.faitLe); fermerSelection() })
  const supprimer = (t: TacheAgenda) => agir(async () => { await supprimerActivite(t.id); fermerSelection() })
  const reporter = (e: FormEvent) => {
    e.preventDefault()
    if (!selection || !report) return
    const date = composerDate(report.jour, report.heure)
    if (!date) { setErreur("Choisis une date et une heure."); return }
    const t = selection
    agir(async () => { await deplacerTache(t.id, date.toISOString()); fermerSelection() })
  }

  const visibles = useMemo(() => (taches ?? []).filter((t) => !masquerFaits || !t.faitLe), [taches, masquerFaits])
  const nbAFaire = (taches ?? []).filter((t) => !t.faitLe).length
  const nbFaits = (taches ?? []).length - nbAFaire
  const jours = useMemo(() => joursDeLaSemaine(ancre), [ancre])

  const vignette = (t: TacheAgenda, pleine = false) => {
    const retard = estEnRetard(t, maintenant)
    const teinte = t.faitLe
      ? "border-trait bg-fond-2 text-encre-3 line-through"
      : retard
        ? "border-alerte/30 bg-alerte-fond text-alerte"
        : t.type === "rdv"
          ? "border-signature/20 bg-signature-doux text-encre"
          : "border-trait bg-fond-2 text-encre"
    return (
      <button
        key={t.id}
        type="button"
        onClick={() => { setSelection(t); setReport(null); setConfirmerSuppression(false) }}
        title={`${titreDe(t)} · ${t.agenceNom}`}
        className={`w-full rounded-4 border px-2 py-1 text-left text-legende transition-colors hover:border-trait-fort focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signature ${teinte} ${pleine ? "flex items-center gap-3" : ""}`}
      >
        <span className={"flex min-w-0 items-center gap-1 " + (pleine ? "shrink-0" : "")}>
          {t.type === "rdv" ? <span className="shrink-0"><IconeRdv type={t.rdvType} /></span> : null}
          <span className="chiffres shrink-0 font-semibold">{t.echeance ? heureCourte(t.echeance) : "—"}</span>
          {!pleine ? <span className="truncate">{titreDe(t)}</span> : null}
        </span>
        {pleine ? <span className="min-w-0 flex-1 truncate font-medium">{titreDe(t)}</span> : null}
        <span className={"block truncate " + (t.faitLe ? "" : "text-encre-2") + (pleine ? " shrink-0 max-w-[40%]" : "")}>{t.agenceNom}{pleine && t.contactNom ? ` · ${t.contactNom}` : ""}</span>
      </button>
    )
  }

  const sousTitre = vue === "semaine"
    ? `${libelleSemaine(ancre)} · ${nbAFaire} à faire${nbFaits ? `, ${nbFaits} fait${s(nbFaits)}` : ""}`
    : `${dateLongue(ancre)} · ${nbAFaire} à faire${nbFaits ? `, ${nbFaits} fait${s(nbFaits)}` : ""}`

  return (
    <div className="page">
      <EnTetePage
        titre="Agenda"
        sousTitre={majusculeInitiale(sousTitre)}
        droite={<>
          <Bouton onClick={() => setAncre(new Date())}>Aujourd'hui</Bouton>
          <Bouton taille="icone" aria-label={vue === "semaine" ? "Semaine précédente" : "Jour précédent"} icone={<ChevronLeft />} onClick={() => decaler(-1)} />
          <Bouton taille="icone" aria-label={vue === "semaine" ? "Semaine suivante" : "Jour suivant"} icone={<ChevronRight />} onClick={() => decaler(1)} />
          <Onglets<Vue> valeur={vue} onChange={setVue} options={[{ id: "semaine", label: "Semaine" }, { id: "jour", label: "Jour" }]} className="mx-2" />
          <Bouton icone={<Plus />} onClick={() => setCreation("rdv")}>RDV</Bouton>
          <Bouton variante="plein" icone={<Plus />} onClick={() => setCreation("tache")}>Tâche</Bouton>
        </>}
      />

      {erreur ? <Bandeau role="alerte" className="mb-4" action={<Bouton taille="sm" variante="discret" onClick={() => setErreur("")}>Fermer</Bouton>}>{erreur}</Bandeau> : null}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Case texte="Masquer ce qui est fait" checked={masquerFaits} onChange={(e) => setMasquerFaits(e.target.checked)} />
        <span className="flex items-center gap-4 text-colonne text-encre-2">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-3 border border-signature/20 bg-signature-doux" /> RDV</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-3 border border-trait bg-fond-2" /> Tâche</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-3 border border-alerte/30 bg-alerte-fond" /> En retard</span>
        </span>
      </div>

      {taches === null ? (
        <Carte>{erreur ? null : <Chargement texte="Lecture de l'agenda…" />}</Carte>
      ) : vue === "semaine" ? (
        <Carte className="overflow-hidden">
          <div className="grid grid-cols-7 border-b border-trait bg-fond-2">
            {jours.map((j) => {
              const auj = memeJour(j, maintenant)
              return (
                <div key={j.getTime()} className={"border-l border-trait px-2 py-2 text-center first:border-l-0 " + (auj ? "bg-signature-doux" : "")}>
                  <div className="text-colonne font-semibold uppercase tracking-[0.07em] text-encre-2">{j.toLocaleDateString("fr-FR", { weekday: "short" })}</div>
                  <div className={"chiffres text-sous-titre font-semibold " + (auj ? "text-signature" : "text-encre")}>{j.getDate()}</div>
                </div>
              )
            })}
          </div>
          <div className="grid min-h-[440px] grid-cols-7">
            {jours.map((j) => {
              const duJour = visibles.filter((t) => t.echeance && memeJour(new Date(t.echeance), j))
              const auj = memeJour(j, maintenant)
              return (
                <div key={j.getTime()} className={"flex flex-col gap-1 border-l border-trait p-1.5 first:border-l-0 " + (auj ? "bg-signature-doux/40" : "")}>
                  {duJour.map((t) => vignette(t))}
                </div>
              )
            })}
          </div>
          {visibles.length === 0 ? <div className="border-t border-trait"><Vide titre="Rien cette semaine" texte={masquerFaits && taches.length ? "Tout est fait. Décoche « Masquer ce qui est fait » pour le revoir." : "Aucune tâche ni RDV sur ces sept jours."} /></div> : null}
        </Carte>
      ) : (
        <Carte>
          {visibles.length === 0 ? (
            <Vide titre="Rien ce jour-là" texte={masquerFaits && taches.length ? "Tout est fait. Décoche « Masquer ce qui est fait » pour le revoir." : "Aucune tâche ni RDV ce jour-là."} />
          ) : (
            <div>
              {grouperParHeure(visibles).map((g) => (
                <div key={g.heure} className="grid grid-cols-[72px_1fr] border-b border-fond-4 last:border-b-0">
                  <div className="chiffres border-r border-trait px-3 py-2 text-legende font-semibold text-encre-2">{g.heure}</div>
                  <div className="flex flex-col gap-1 p-1.5">{g.taches.map((t) => vignette(t, true))}</div>
                </div>
              ))}
            </div>
          )}
        </Carte>
      )}

      {/* ── Le détail d'une ligne ── */}
      {selection ? (
        <Dialogue
          titre={<span className="flex items-center gap-2">{titreDe(selection)}{selection.type === "rdv" ? <Pastille role="info"><IconeRdv type={selection.rdvType} /> {libelleRdv(selection.rdvType)}</Pastille> : <Pastille>Tâche</Pastille>}</span>}
          description={selection.echeance ? <span>{majusculeInitiale(dateLongue(new Date(selection.echeance)))} à {heureCourte(selection.echeance)} · {libelleRelatif(selection.echeance, maintenant)}</span> : "Sans date"}
          onFermer={fermerSelection}
          largeur="max-w-xl"
          pied={<>
            <Bouton variante="danger" icone={<Trash2 />} disabled={occupe} onClick={() => setConfirmerSuppression(true)}>Supprimer</Bouton>
            <span className="flex-1" />
            <Bouton icone={<Phone />} onClick={() => { onOuvrirSession?.(selection.agenceId); fermerSelection() }}>Appeler</Bouton>
            <Bouton icone={<ArrowUpRight />} onClick={() => { onOuvrirAgence?.(selection.agenceId); fermerSelection() }}>Ouvrir la fiche</Bouton>
            <Bouton icone={<CalendarClock />} disabled={occupe || !!selection.faitLe} onClick={() => setReport(report ? null : decomposerDate(selection.echeance))}>Reporter</Bouton>
            <Bouton variante="plein" icone={selection.faitLe ? <Undo2 /> : <Check />} chargement={occupe} onClick={() => basculerFait(selection)}>{selection.faitLe ? "Remettre à faire" : "Fait"}</Bouton>
          </>}
        >
          <Ligne libelle="Agence">
            <button type="button" className="font-medium text-encre underline-offset-2 hover:underline" onClick={() => { onOuvrirAgence?.(selection.agenceId); fermerSelection() }}>{selection.agenceNom || "—"}</button>
            {selection.agenceTelephone ? <span className="chiffres text-encre-2"> · {selection.agenceTelephone}</span> : null}
          </Ligne>
          <Ligne libelle="Contact">{selection.contactNom || "—"}</Ligne>
          <Ligne libelle="Créée par">{selection.compteNom || "—"}</Ligne>
          <Ligne libelle="État">
            {selection.faitLe
              ? <Pastille role="fait" point>faite {libelleRelatif(selection.faitLe, maintenant)}</Pastille>
              : estEnRetard(selection, maintenant) ? <Pastille role="probleme" point>en retard</Pastille> : <Pastille role="actif" point>à faire</Pastille>}
          </Ligne>
          {selection.note ? <p className="mt-3 whitespace-pre-wrap rounded-4 bg-fond-2 p-3 text-legende text-encre">{selection.note}</p> : null}
          {report ? (
            <form onSubmit={reporter} className="mt-4 grid items-end gap-3 rounded-4 border border-trait bg-fond-2 p-3 sm:grid-cols-[1fr_1fr_auto]">
              <Etiquette texte="Nouvelle date"><Champ type="date" value={report.jour} onChange={(e) => setReport({ ...report, jour: e.target.value })} required /></Etiquette>
              <Etiquette texte="Heure"><Champ type="time" value={report.heure} onChange={(e) => setReport({ ...report, heure: e.target.value })} required /></Etiquette>
              <Bouton type="submit" chargement={occupe}>Déplacer</Bouton>
            </form>
          ) : null}
        </Dialogue>
      ) : null}
      {selection && confirmerSuppression ? (
        <Dialogue
          titre="Supprimer cette ligne ?"
          description={`« ${titreDe(selection)} » pour ${selection.agenceNom} disparaît de l'agenda et du fil de l'agence. On ne peut pas revenir en arrière.`}
          onFermer={() => setConfirmerSuppression(false)}
          pied={<><Bouton onClick={() => setConfirmerSuppression(false)}>Annuler</Bouton><Bouton variante="danger" icone={<Trash2 />} chargement={occupe} onClick={() => supprimer(selection)}>Supprimer</Bouton></>}
        />
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
    </div>
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
