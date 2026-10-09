// ════════════════════════════════════════════════════════════════════════════
// LA FICHE AGENCE — un volet large à droite, ouvert depuis n'importe quelle liste.
//
// « La fiche, c'est l'agence. » Dans l'ordre : l'identité (modifiable en
// place), l'étape (la frise des cinq étapes et les trois sorties), les
// contacts (les personnes), la prochaine action (tâches et RDV ouverts), puis
// LE fil : appels, e-mails, RDV, tâches, notes, changements d'étape, et les
// messages de la boîte, fusionnés et groupés par jour. Toute écriture recharge
// la fiche et prévient la liste derrière (onChange).
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react"
import { ArrowRightLeft, CalendarDays, Check, Mail, Merge, Pencil, Phone, Plus, SquareCheck, Star, StickyNote, Sun, UserX } from "lucide-react"
import {
  ETAPES,
  MOTIFS,
  SORTIES,
  SOMMEIL_JOURS,
  TYPES_AGENCE,
  type Activite,
  type Agence,
  type Contact,
  type Etape,
  type Motif,
  type Secteur,
  type TypeActivite,
  type TypeAgence,
  libelleEtape,
  libelleRole,
  libelleType,
  nomContact,
  pastilleEtape,
} from "../../demarchage/modele"
import { changerEtape, chargerAgence, chargerSecteurs, chercherDoublons, creerNote, creerRdv, creerTache, deplacerTache, fusionnerAgences, majAgence, majContact, premierOs, terminerTache, type AgenceComplete } from "../../demarchage/db"
import {
  COMMERCIAUX_PAR_DEFAUT, FILTRES_FIL, type FiltreFil, dateHeure, dateLongue, depuisTexte, enRetard, filtrerFil, fusionnerFil, grouperParJour, heure, ilYA, isoDepuisChamp, jourPourChamp,
  lendemainPourChamp, messageErreur, nomCommercial, noteLongue, pluriel, prospectDepuis, secteursParZone, tachesOuvertes,
} from "../../demarchage/agencesOutils"
import { useSession } from "../../lib/auth"
import { listerComptes, nomAffiche } from "../../lib/comptes"
import { Bandeau, Bouton, Carte, Champ, Chargement, Dialogue, Etiquette, Ligne, Onglets, Panneau, Pastille, Selecteur, TitreCarte, Zone } from "../../ui"
import EnvoyerEmailModal from "../EnvoyerEmailModal"
import ContactFormulaire from "./ContactFormulaire"

const ICONES: Record<TypeActivite, ReactNode> = {
  appel: <Phone size={14} />, email: <Mail size={14} />, rdv: <CalendarDays size={14} />, tache: <SquareCheck size={14} />, note: <StickyNote size={14} />, etape: <ArrowRightLeft size={14} />,
}
type Compte = { id: string; nom: string }
type FormIdentite = { nom: string; enseigne: string; type: TypeAgence; secteur: string; adresse: string; telephone: string; email: string; site: string; nbLots: string; commercialId: string }

// `ouvrirEtape` : la fiche s'ouvre directement sur « Changer l'étape » (Mahdi, 09/10 :
// « je vois pas comment changer les états »).
export default function FicheAgence({ id, onFermer, onChange, onOuvrirSession, ouvrirEtape = false }: { id: string; onFermer: () => void; onChange?: () => void; onOuvrirSession?: (agenceId: string) => void; ouvrirEtape?: boolean }) {
  const session = useSession()
  const compteNom = nomAffiche(session)
  const [donnees, setDonnees] = useState<AgenceComplete | null>(null)
  const [secteurs, setSecteurs] = useState<Secteur[]>([])
  const [comptes, setComptes] = useState<Compte[]>(COMMERCIAUX_PAR_DEFAUT)
  const [doublons, setDoublons] = useState<Agence[]>([])
  const [maintenant, setMaintenant] = useState(() => new Date())
  const [erreur, setErreur] = useState("")
  const [info, setInfo] = useState("")
  const [occupe, setOccupe] = useState(false)
  const [edition, setEdition] = useState<FormIdentite | null>(null)
  const [dialogue, setDialogue] = useState<"etape" | "premierOs" | null>(ouvrirEtape ? "etape" : null)
  const [fusionSource, setFusionSource] = useState<Agence | null>(null)
  const [contactEdite, setContactEdite] = useState<{ contact?: Contact } | null>(null)
  const [emailPour, setEmailPour] = useState<Contact | null | undefined>(undefined) // undefined = fermé ; null = l'adresse générique
  const [ajout, setAjout] = useState<"tache" | "rdv" | "note" | null>(null)
  const [reportId, setReportId] = useState<string | null>(null)
  const [reportDate, setReportDate] = useState("")
  const [filtreFil, setFiltreFil] = useState<FiltreFil>("tous")
  const [notesDepliees, setNotesDepliees] = useState<Set<string>>(new Set())

  const charger = useCallback(async () => {
    try {
      const d = await chargerAgence(id)
      setDonnees(d)
      setMaintenant(new Date())
      setErreur("")
      // D'autres fiches pour la même agence ? (même nom dans le même secteur, ou même standard)
      chercherDoublons(d.agence.nom, d.agence.secteur, d.agence.telephone).then((l) => setDoublons(l.filter((x) => x.id !== id))).catch(() => setDoublons([]))
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }, [id])
  useEffect(() => { const t = setTimeout(charger, 0); return () => clearTimeout(t) }, [charger])
  useEffect(() => {
    const t = setTimeout(() => {
      chargerSecteurs().then(setSecteurs).catch(() => undefined)
      // La liste des comptes vient du serveur (réservée aux administrateurs) ; sans elle, les deux noms en dur.
      listerComptes()
        .then((l) => {
          const lus = l.map((c) => ({ id: c.id, nom: c.nom || c.email }))
          setComptes([...lus, ...COMMERCIAUX_PAR_DEFAUT.filter((d) => !lus.some((c) => c.id === d.id))])
        })
        .catch(() => undefined)
    }, 0)
    return () => clearTimeout(t)
  }, [])

  const agir = async (f: () => Promise<void>, message: string) => {
    setOccupe(true); setErreur(""); setInfo("")
    try { await f(); setInfo(message); await charger(); onChange?.() }
    catch (e) { setErreur(messageErreur(e)) }
    finally { setOccupe(false) }
  }

  const agence = donnees?.agence ?? null
  const contacts = useMemo(() => donnees?.contacts ?? [], [donnees])
  const activites = useMemo(() => donnees?.activites ?? [], [donnees])
  const contactsParId = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts])
  const ouvertes = useMemo(() => tachesOuvertes(activites), [activites])
  const fil = useMemo(() => filtrerFil(fusionnerFil(activites, donnees?.messages ?? []), filtreFil), [activites, donnees, filtreFil])
  const jours = useMemo(() => grouperParJour(fil, maintenant), [fil, maintenant])
  const nbParType = useMemo(() => {
    const n: Partial<Record<FiltreFil, number>> = {}
    for (const e of fusionnerFil(activites, donnees?.messages ?? [])) n[e.type] = (n[e.type] ?? 0) + 1
    return n
  }, [activites, donnees])

  const commencerEdition = () => {
    if (!agence) return
    setEdition({ nom: agence.nom, enseigne: agence.enseigne, type: agence.type, secteur: agence.secteur ?? "", adresse: agence.adresse, telephone: agence.telephone, email: agence.email, site: agence.site, nbLots: agence.nbLots ? String(agence.nbLots) : "", commercialId: agence.commercialId ?? "" })
  }
  const setEd = (k: keyof FormIdentite) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setEdition((p) => (p ? { ...p, [k]: e.target.value } : p))
  const enregistrerIdentite = () => {
    if (!edition) return
    if (!edition.nom.trim()) { setErreur("Le nom de l'agence est obligatoire."); return }
    const e = edition
    agir(async () => {
      await majAgence(id, { nom: e.nom, enseigne: e.enseigne.trim(), type: e.type, secteur: e.secteur, adresse: e.adresse.trim(), telephone: e.telephone.trim(), email: e.email.trim().toLowerCase(), site: e.site.trim(), nbLots: Number(e.nbLots) || 0, commercialId: e.commercialId || null })
      setEdition(null)
    }, "Fiche enregistrée.")
  }

  const reporter = (t: Activite) => {
    const iso = isoDepuisChamp(reportDate)
    if (!iso) { setErreur("Choisis une date pour reporter."); return }
    agir(async () => { await deplacerTache(t.id, iso); setReportId(null) }, `Reportée au ${dateHeure(iso)}.`)
  }

  const etapeIdx = agence ? ETAPES.findIndex((e) => e.code === agence.etape) : -1
  const enSortie = agence ? SORTIES.some((s) => s.code === agence.etape) : false

  return (
    <Panneau
      largeur="w-[760px]"
      titre={agence?.nom || "Fiche agence"}
      onFermer={onFermer}
      sousTitre={agence ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {agence.enseigne ? <Pastille>{agence.enseigne}</Pastille> : null}
            {agence.secteurLibelle ? <Pastille>{agence.secteurLibelle}</Pastille> : null}
            <Pastille>{libelleType(agence.type)}</Pastille>
            <button type="button" title="Changer l'étape" className="rounded-4 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signature" onClick={() => setDialogue("etape")}>
              <Pastille role={pastilleEtape(agence.etape)} point>{libelleEtape(agence.etape)}</Pastille>
            </button>
            <span className="text-colonne text-encre-2">{depuisTexte(agence.etapeDepuis, maintenant)}</span>
            <span className="chiffres text-colonne text-encre-2">· {pluriel(agence.tentatives, "tentative")} · joint {agence.jointFois} fois</span>
          </div>
          <div className="flex items-center gap-2">
            <Bouton icone={<ArrowRightLeft />} disabled={occupe} onClick={() => setDialogue("etape")}>Changer l'étape</Bouton>
            {agence.type !== "apporteur" ? (
              <Bouton variante="plein" icone={<Phone />} disabled={!onOuvrirSession} title={onOuvrirSession ? undefined : "Ouvre une session de call pour appeler"} onClick={() => onOuvrirSession?.(id)}>Appeler</Bouton>
            ) : null}
          </div>
        </div>
      ) : null}
    >
      {!donnees && !erreur ? <Chargement /> : null}
      {erreur ? <Bandeau role="alerte" className="mb-3" action={<Bouton taille="sm" variante="discret" onClick={() => setErreur("")}>Fermer</Bouton>}>{erreur}</Bandeau> : null}
      {info ? <Bandeau role="ok" className="mb-3" action={<Bouton taille="sm" variante="discret" onClick={() => setInfo("")}>Fermer</Bouton>}>{info}</Bandeau> : null}

      {agence ? (
        <div className="space-y-4">
          {/* ── Doublons ── */}
          {doublons.slice(0, 3).map((d) => (
            <Bandeau key={d.id} role="attention" action={<Bouton taille="sm" icone={<Merge />} disabled={occupe} onClick={() => setFusionSource(d)}>Fusionner dans celle-ci</Bouton>}>
              Peut-être la même agence que <strong>{d.nom}</strong>{d.secteurLibelle ? ` (${d.secteurLibelle})` : ""}{d.telephone ? <span className="chiffres"> · {d.telephone}</span> : null} · {libelleEtape(d.etape)}
            </Bandeau>
          ))}

          {/* ── 1. Identité ── */}
          <Carte>
            <TitreCarte droite={edition ? (
              <>
                <Bouton taille="sm" variante="discret" disabled={occupe} onClick={() => setEdition(null)}>Annuler</Bouton>
                <Bouton taille="sm" chargement={occupe} onClick={enregistrerIdentite}>Enregistrer</Bouton>
              </>
            ) : (
              <>
                {agence.email ? <Bouton taille="sm" variante="discret" icone={<Mail />} onClick={() => setEmailPour(null)}>E-mail</Bouton> : null}
                <Bouton taille="sm" variante="discret" icone={<Pencil />} onClick={commencerEdition}>Modifier</Bouton>
              </>
            )}>Identité</TitreCarte>
            <div className="px-5 pb-4">
              {edition ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Etiquette texte="Nom" className="sm:col-span-2"><Champ value={edition.nom} onChange={setEd("nom")} autoFocus /></Etiquette>
                  <Etiquette texte="Enseigne"><Champ value={edition.enseigne} onChange={setEd("enseigne")} placeholder="vide pour un indépendant" /></Etiquette>
                  <Etiquette texte="Type">
                    <Selecteur value={edition.type} onChange={setEd("type")}>
                      {TYPES_AGENCE.map((t) => <option key={t.code} value={t.code}>{t.libelle}</option>)}
                    </Selecteur>
                  </Etiquette>
                  <Etiquette texte="Secteur">
                    <Selecteur value={edition.secteur} onChange={setEd("secteur")}>
                      <option value="">— sans secteur —</option>
                      {secteursParZone(secteurs).map((z) => (
                        <optgroup key={z.zone} label={z.zone}>{z.secteurs.map((s) => <option key={s.code} value={s.code}>{s.libelle}</option>)}</optgroup>
                      ))}
                    </Selecteur>
                  </Etiquette>
                  <Etiquette texte="Commercial responsable">
                    <Selecteur value={edition.commercialId} onChange={setEd("commercialId")}>
                      <option value="">— personne —</option>
                      {comptes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                    </Selecteur>
                  </Etiquette>
                  <Etiquette texte="Adresse" className="sm:col-span-2"><Champ value={edition.adresse} onChange={setEd("adresse")} /></Etiquette>
                  <Etiquette texte="Standard"><Champ type="tel" value={edition.telephone} onChange={setEd("telephone")} /></Etiquette>
                  <Etiquette texte="E-mail générique"><Champ type="email" value={edition.email} onChange={setEd("email")} /></Etiquette>
                  <Etiquette texte="Site"><Champ value={edition.site} onChange={setEd("site")} placeholder="https://" /></Etiquette>
                  <Etiquette texte="Nombre de lots"><Champ type="number" min={0} value={edition.nbLots} onChange={setEd("nbLots")} /></Etiquette>
                </div>
              ) : (
                <div className="grid gap-x-8 sm:grid-cols-2">
                  <div className="divide-y divide-fond-4">
                    <Ligne libelle="Standard"><span className="chiffres">{agence.telephone || "—"}</span></Ligne>
                    <Ligne libelle="E-mail">{agence.email || "—"}</Ligne>
                    <Ligne libelle="Site">{agence.site ? <a href={agence.site.startsWith("http") ? agence.site : `https://${agence.site}`} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">{agence.site}</a> : "—"}</Ligne>
                    <Ligne libelle="Adresse">{agence.adresse || "—"}</Ligne>
                  </div>
                  <div className="divide-y divide-fond-4">
                    <Ligne libelle="Lots"><span className="chiffres">{agence.nbLots || "—"}</span></Ligne>
                    <Ligne libelle="Commercial">{nomCommercial(agence.commercialId, comptes) || "—"}</Ligne>
                    <Ligne libelle="Premier OS">{agence.premierOsLe ? dateLongue(agence.premierOsLe) : "pas encore"}</Ligne>
                    <Ligne libelle="Dans la base">{agence.creeLe ? `${dateLongue(agence.creeLe)} · ${pluriel(agence.nbAppels, "appel")}` : "—"}</Ligne>
                  </div>
                </div>
              )}
            </div>
          </Carte>

          {/* ── 2. Étape ── */}
          <Carte>
            <TitreCarte droite={
              <>
                {agence.etape === "endormie" ? <Bouton taille="sm" icone={<Sun />} disabled={occupe} onClick={() => agir(() => changerEtape(id, "a_prospecter"), "Agence réveillée : elle revient dans « À prospecter ».")}>Réveiller maintenant</Bouton> : null}
                {!agence.premierOsLe ? <Bouton taille="sm" icone={<Check />} disabled={occupe} onClick={() => setDialogue("premierOs")}>Premier OS reçu</Bouton> : null}
                <Bouton taille="sm" variante="discret" icone={<ArrowRightLeft />} disabled={occupe} onClick={() => setDialogue("etape")}>Changer l'étape</Bouton>
              </>
            }>Étape</TitreCarte>
            <div className="px-5 pb-4">
              <ol className="flex items-start">
                {ETAPES.map((e, i) => {
                  const etat = enSortie ? "a_venir" : i < etapeIdx ? "passee" : i === etapeIdx ? "actuelle" : "a_venir"
                  return (
                    <li key={e.code} className="flex flex-1 items-start">
                      <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
                        <span className={
                          "flex h-6 w-6 items-center justify-center rounded-full border text-colonne font-semibold " +
                          (etat === "actuelle" ? "border-action bg-action text-white" : etat === "passee" ? "border-ok/20 bg-ok-fond text-ok" : "border-trait text-encre-3")
                        }>
                          {etat === "passee" ? <Check size={12} /> : e.ordre}
                        </span>
                        <span className={"text-colonne " + (etat === "actuelle" ? "font-semibold text-encre" : "text-encre-2")}>{e.libelle}</span>
                      </div>
                      {i < ETAPES.length - 1 ? <span className={"mt-3 h-px flex-1 " + (i < etapeIdx && !enSortie ? "bg-ok/40" : "bg-trait")} /> : null}
                    </li>
                  )
                })}
              </ol>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-fond-4 pt-3">
                <span className="text-colonne uppercase tracking-[0.07em] text-encre-2">Sorties</span>
                {SORTIES.map((s) => <Pastille key={s.code} role={agence.etape === s.code ? pastilleEtape(s.code) : "inerte"} point={agence.etape === s.code}>{s.libelle}</Pastille>)}
                {agence.etape === "pas_interesse" && agence.motif ? <span className="text-legende text-encre-2">· motif : {MOTIFS.find((m) => m.code === agence.motif)?.libelle ?? agence.motif}</span> : null}
                {agence.etape === "endormie" && agence.reveilLe ? <span className="text-legende text-encre-2">· réveil le {dateLongue(agence.reveilLe)} ({ilYA(agence.reveilLe, maintenant)})</span> : null}
              </div>
            </div>
          </Carte>

          {/* ── 3. Contacts ── */}
          <Carte>
            <TitreCarte droite={<Bouton taille="sm" icone={<Plus />} disabled={occupe} onClick={() => setContactEdite({})}>Contact</Bouton>}>Contacts</TitreCarte>
            <div className="px-5 pb-4">
              {contacts.length === 0 ? <p className="text-legende text-encre-2">Personne encore : on ne connaît que le standard. Ajoute le gestionnaire dès qu'il est joint.</p> : (
                <ul className="divide-y divide-fond-4">
                  {contacts.map((c) => (
                    <li key={c.id} className={"flex items-center justify-between gap-3 py-2 text-legende " + (c.parti ? "opacity-50" : "")}>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {c.principal && !c.parti ? <Star size={14} className="fill-current text-attention" aria-label="Contact principal" /> : null}
                          <button type="button" title="Modifier ce contact" onClick={() => setContactEdite({ contact: c })} className="rounded-3 font-medium text-encre underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signature">{nomContact(c)}</button>
                          <span className="text-encre-2">{libelleRole(c.role)}</span>
                          {c.parti ? <Pastille>parti</Pastille> : null}
                        </div>
                        <div className="flex flex-wrap gap-x-4 text-colonne text-encre-2">
                          {c.ligneDirecte ? <span className="chiffres">ligne directe {c.ligneDirecte}</span> : null}
                          {c.mobile ? <span className="chiffres">mobile {c.mobile}</span> : null}
                          {c.email ? <span>{c.email}</span> : null}
                          {!c.ligneDirecte && !c.mobile && !c.email ? <span>aucune coordonnée</span> : null}
                        </div>
                        {c.note ? <div className="mt-0.5 text-colonne text-encre-2">{c.note}</div> : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {c.email ? <Bouton variante="discret" taille="icone" title="Envoyer un e-mail" aria-label="Envoyer un e-mail" icone={<Mail />} onClick={() => setEmailPour(c)} /> : null}
                        {!c.principal && !c.parti ? <Bouton variante="discret" taille="icone" title="En faire le contact principal" aria-label="Contact principal" icone={<Star />} disabled={occupe} onClick={() => agir(() => majContact(c.id, id, { principal: true }), `${nomContact(c)} est le contact principal.`)} /> : null}
                        <Bouton variante="discret" taille="icone" title={c.parti ? "De retour dans l'agence" : "A quitté l'agence"} aria-label={c.parti ? "De retour" : "Parti"} icone={<UserX />} disabled={occupe} onClick={() => agir(() => majContact(c.id, id, { parti: !c.parti, principal: c.parti ? c.principal : false }), c.parti ? `${nomContact(c)} est de retour.` : `${nomContact(c)} a quitté l'agence.`)} />
                        <Bouton variante="discret" taille="sm" icone={<Pencil />} onClick={() => setContactEdite({ contact: c })}>Modifier</Bouton>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Carte>

          {/* ── 4. Prochaine action ── */}
          <Carte>
            <TitreCarte droite={
              <>
                <Bouton taille="sm" variante="discret" icone={<Plus />} onClick={() => setAjout("tache")}>tâche</Bouton>
                <Bouton taille="sm" variante="discret" icone={<Plus />} onClick={() => setAjout("rdv")}>RDV</Bouton>
                <Bouton taille="sm" variante="discret" icone={<Plus />} onClick={() => setAjout("note")}>note</Bouton>
              </>
            }>Prochaine action</TitreCarte>
            <div className="px-5 pb-4">
              {ajout ? (
                <FormulaireAjout
                  type={ajout}
                  contacts={contacts.filter((c) => !c.parti)}
                  maintenant={maintenant}
                  occupe={occupe}
                  onAnnuler={() => setAjout(null)}
                  onEnregistrer={(p) => agir(async () => {
                    if (p.type === "note") await creerNote({ agenceId: id, contactId: p.contactId, compteNom, note: p.note })
                    else if (p.type === "tache") await creerTache({ agenceId: id, contactId: p.contactId, compteNom, titre: p.titre, echeance: p.echeance, note: p.note })
                    else await creerRdv({ agenceId: id, contactId: p.contactId, compteNom, titre: p.titre, echeance: p.echeance, rdvType: p.rdvType, note: p.note })
                    setAjout(null)
                  }, p.type === "note" ? "Note ajoutée au fil." : p.type === "tache" ? "Tâche créée." : "RDV ajouté à l'agenda.")}
                />
              ) : null}
              {ouvertes.length === 0 && !ajout ? <p className="text-legende text-encre-2">Rien de prévu. {agence.etape === "a_prospecter" || agence.etape === "gestionnaire_joint" ? "L'agence ressortira dans la file « À prospecter »." : ""}</p> : null}
              {ouvertes.length > 0 ? (
                <ul className={"divide-y divide-fond-4 " + (ajout ? "mt-4 border-t border-fond-4" : "")}>
                  {ouvertes.map((t) => {
                    const retard = enRetard(t.echeance, maintenant)
                    const c = t.contactId ? contactsParId.get(t.contactId) : null
                    return (
                      <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-legende">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <span className={retard ? "text-alerte" : "text-encre-2"}>{ICONES[t.type]}</span>
                          <div className="min-w-0">
                            <div className="font-medium text-encre">{t.type === "rdv" ? "RDV · " : ""}{t.titre || (t.type === "rdv" ? "Rendez-vous" : "Tâche")}</div>
                            <div className={"chiffres text-colonne " + (retard ? "text-alerte" : "text-encre-2")}>
                              {t.echeance ? `${dateHeure(t.echeance)} · ${ilYA(t.echeance, maintenant)}` : "sans date"}{retard ? " · en retard" : ""}{c ? ` · ${nomContact(c)}` : ""}
                            </div>
                          </div>
                        </div>
                        {reportId === t.id ? (
                          <div className="flex items-center gap-2">
                            <Champ type="datetime-local" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="w-[190px]" aria-label="Nouvelle date" />
                            <Bouton taille="sm" chargement={occupe} onClick={() => reporter(t)}>OK</Bouton>
                            <Bouton taille="sm" variante="discret" onClick={() => setReportId(null)}>Annuler</Bouton>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Bouton taille="sm" variante="discret" disabled={occupe} onClick={() => { setReportId(t.id); setReportDate(lendemainPourChamp(maintenant)) }}>Reporter</Bouton>
                            <Bouton taille="sm" icone={<Check />} disabled={occupe} onClick={() => agir(() => terminerTache(t.id), t.type === "rdv" ? "RDV marqué fait." : "Tâche faite.")}>Fait</Bouton>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </div>
          </Carte>

          {/* ── 5. Le fil ── */}
          <Carte>
            <TitreCarte>Le fil</TitreCarte>
            <div className="px-5 pb-4">
              <Onglets<FiltreFil>
                valeur={filtreFil}
                onChange={setFiltreFil}
                className="mb-3"
                options={FILTRES_FIL.map((f) => ({ id: f.code, label: f.code === "tous" ? f.libelle : `${f.libelle}${nbParType[f.code] ? ` (${nbParType[f.code]})` : ""}` }))}
              />
              {jours.length === 0 ? <p className="text-legende text-encre-2">{filtreFil === "tous" ? "Rien encore : aucun appel, aucun e-mail, aucune note." : "Rien de ce type dans le fil."}</p> : (
                <div className="space-y-4">
                  {jours.map((j) => (
                    <div key={j.jour}>
                      <div className="mb-1 text-colonne font-semibold uppercase tracking-[0.07em] text-encre-2">{j.libelle}</div>
                      <ol className="divide-y divide-fond-4">
                        {j.elements.map((e) => {
                          const c = e.contactId ? contactsParId.get(e.contactId) : null
                          const longue = noteLongue(e.note)
                          const depliee = notesDepliees.has(e.id)
                          return (
                            <li key={e.id} className="flex items-start gap-3 py-2 text-legende">
                              <span className={"mt-0.5 shrink-0 " + (e.type === "etape" ? "text-signature" : e.tache && enRetard(e.echeance, maintenant) ? "text-alerte" : "text-encre-2")}>{ICONES[e.type]}</span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-baseline gap-x-2">
                                  <span className={"text-encre " + (e.type === "note" ? "" : "font-medium")}>{e.titre}</span>
                                  {e.detail ? <span className="chiffres text-encre-2">{e.detail}</span> : null}
                                </div>
                                {e.note ? (
                                  <div className={"whitespace-pre-wrap text-encre-2 " + (longue && !depliee ? "line-clamp-3" : "")}>{e.note}</div>
                                ) : null}
                                {longue ? (
                                  <button type="button" className="text-colonne text-encre-2 underline-offset-4 hover:underline" onClick={() => setNotesDepliees((s) => { const n = new Set(s); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n })}>
                                    {depliee ? "Replier" : "Voir tout"}
                                  </button>
                                ) : null}
                                <div className="text-colonne text-encre-2">
                                  {c ? <span>{nomContact(c)} · </span> : null}
                                  {e.auteur ? <span>{e.auteur} · </span> : null}
                                  <span className="chiffres">{heure(e.date)}</span>
                                </div>
                              </div>
                            </li>
                          )
                        })}
                      </ol>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Carte>
        </div>
      ) : null}

      {/* ── Dialogues ── */}
      {dialogue === "etape" && agence ? (
        <DialogueEtape
          agence={agence}
          maintenant={maintenant}
          occupe={occupe}
          onFermer={() => setDialogue(null)}
          onValider={(etape, motif, reveilLe) => agir(async () => { await changerEtape(id, etape, motif, reveilLe); setDialogue(null) }, `Étape : ${libelleEtape(etape)}.`)}
        />
      ) : null}
      {dialogue === "premierOs" && agence ? (
        <DialoguePremierOs
          maintenant={maintenant}
          occupe={occupe}
          onFermer={() => setDialogue(null)}
          onValider={(date) => agir(async () => { await premierOs(id, date); setDialogue(null) }, "Premier OS enregistré : l'agence est cliente.")}
        />
      ) : null}
      {fusionSource && agence ? (
        <Dialogue
          titre="Fusionner les deux fiches ?"
          description={`Tout ce qui est rattaché à « ${fusionSource.nom} » (contacts, appels, e-mails, tâches) passe dans « ${agence.nom} », puis « ${fusionSource.nom} » disparaît. On ne revient pas en arrière.`}
          onFermer={() => setFusionSource(null)}
          largeur="max-w-md"
          pied={
            <>
              <Bouton onClick={() => setFusionSource(null)} disabled={occupe}>Annuler</Bouton>
              <Bouton variante="plein" icone={<Merge />} chargement={occupe} onClick={() => agir(async () => { await fusionnerAgences(id, fusionSource.id); setFusionSource(null) }, `« ${fusionSource.nom} » a été fusionnée dans cette fiche.`)}>Fusionner</Bouton>
            </>
          }
        >
          <div className="divide-y divide-fond-4 text-legende">
            <Ligne libelle="Celle qui reste">{agence.nom}</Ligne>
            <Ligne libelle="Celle qui disparaît">{fusionSource.nom}</Ligne>
            <Ligne libelle="Son étape">{libelleEtape(fusionSource.etape)}</Ligne>
          </div>
        </Dialogue>
      ) : null}
      {contactEdite ? (
        <ContactFormulaire agenceId={id} contact={contactEdite.contact} onFermer={() => setContactEdite(null)} onEnregistre={() => { setContactEdite(null); setInfo(contactEdite.contact ? "Contact enregistré." : "Contact ajouté."); charger(); onChange?.() }} />
      ) : null}
      {emailPour !== undefined && agence ? <EnvoyerEmailModal prospect={prospectDepuis(agence, emailPour)} onClose={() => { setEmailPour(undefined); charger() }} /> : null}
    </Panneau>
  )
}

// ── Changer l'étape à la main ────────────────────────────────────────────────
function DialogueEtape({ agence, maintenant, occupe, onFermer, onValider }: { agence: Agence; maintenant: Date; occupe: boolean; onFermer: () => void; onValider: (etape: Etape, motif: Motif | "", reveilLe: string | null) => void }) {
  const [etape, setEtape] = useState<Etape>(agence.etape)
  const [motif, setMotif] = useState<Motif>((MOTIFS.find((m) => m.code === agence.motif)?.code) ?? "autre")
  const [reveil, setReveil] = useState(() => agence.reveilLe?.slice(0, 10) || jourPourChamp(new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() + SOMMEIL_JOURS)))
  return (
    <Dialogue
      titre="Changer l'étape"
      description="D'habitude, ce sont les résultats d'appel qui déplacent l'agence. Ici, on corrige à la main ; le changement s'écrit dans le fil."
      onFermer={onFermer}
      largeur="max-w-md"
      pied={
        <>
          <Bouton onClick={onFermer} disabled={occupe}>Annuler</Bouton>
          <Bouton variante="plein" chargement={occupe} disabled={etape === agence.etape} onClick={() => onValider(etape, etape === "pas_interesse" ? motif : "", etape === "endormie" ? reveil || null : null)}>Changer</Bouton>
        </>
      }
    >
      <div className="grid gap-4">
        <Etiquette texte="Nouvelle étape">
          <Selecteur value={etape} onChange={(e) => setEtape(e.target.value as Etape)}>
            <optgroup label="Étapes">{ETAPES.map((e) => <option key={e.code} value={e.code}>{e.libelle}</option>)}</optgroup>
            <optgroup label="Sorties">{SORTIES.map((s) => <option key={s.code} value={s.code}>{s.libelle}</option>)}</optgroup>
          </Selecteur>
        </Etiquette>
        {etape === "pas_interesse" ? (
          <Etiquette texte="Motif">
            <Selecteur value={motif} onChange={(e) => setMotif(e.target.value as Motif)}>
              {MOTIFS.map((m) => <option key={m.code} value={m.code}>{m.libelle}</option>)}
            </Selecteur>
          </Etiquette>
        ) : null}
        {etape === "endormie" ? (
          <Etiquette texte="Date de réveil" aide={`Elle ressortira dans « À réveiller » ce jour-là (${SOMMEIL_JOURS} jours par défaut).`}>
            <Champ type="date" value={reveil} onChange={(e) => setReveil(e.target.value)} />
          </Etiquette>
        ) : null}
      </div>
    </Dialogue>
  )
}

// ── Premier OS reçu ──────────────────────────────────────────────────────────
function DialoguePremierOs({ maintenant, occupe, onFermer, onValider }: { maintenant: Date; occupe: boolean; onFermer: () => void; onValider: (date: string) => void }) {
  const [date, setDate] = useState(() => jourPourChamp(maintenant))
  return (
    <Dialogue
      titre="Premier ordre de service reçu"
      description="C'est le moment où l'agence devient cliente. La date sert au suivi du mois."
      onFermer={onFermer}
      largeur="max-w-md"
      pied={
        <>
          <Bouton onClick={onFermer} disabled={occupe}>Annuler</Bouton>
          <Bouton variante="plein" icone={<Check />} chargement={occupe} disabled={!date} onClick={() => onValider(date)}>C'est noté</Bouton>
        </>
      }
    >
      <Etiquette texte="Reçu le"><Champ type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-48" /></Etiquette>
    </Dialogue>
  )
}

// ── + tâche · + RDV · + note (petit formulaire en place) ─────────────────────
type NouvelElement =
  | { type: "note"; note: string; contactId: string | null }
  | { type: "tache"; titre: string; echeance: string; note: string; contactId: string | null }
  | { type: "rdv"; titre: string; echeance: string; rdvType: "telephone" | "visio" | "sur_place"; note: string; contactId: string | null }

function FormulaireAjout({ type, contacts, maintenant, occupe, onAnnuler, onEnregistrer }: { type: "tache" | "rdv" | "note"; contacts: Contact[]; maintenant: Date; occupe: boolean; onAnnuler: () => void; onEnregistrer: (p: NouvelElement) => void }) {
  const [titre, setTitre] = useState(type === "tache" ? "Rappeler" : "")
  const [echeance, setEcheance] = useState(() => lendemainPourChamp(maintenant))
  const [rdvType, setRdvType] = useState<"telephone" | "visio" | "sur_place">("telephone")
  const [note, setNote] = useState("")
  const [contactId, setContactId] = useState(() => contacts.find((c) => c.principal)?.id ?? "")
  const [erreur, setErreur] = useState("")
  const valider = () => {
    const cid = contactId || null
    if (type === "note") {
      if (!note.trim()) { setErreur("La note est vide."); return }
      onEnregistrer({ type, note: note.trim(), contactId: cid }); return
    }
    const iso = isoDepuisChamp(echeance)
    if (!iso) { setErreur("Il faut une date."); return }
    if (type === "rdv") { onEnregistrer({ type, titre: titre.trim(), echeance: iso, rdvType, note: note.trim(), contactId: cid }); return }
    if (!titre.trim()) { setErreur("Il faut un titre à la tâche."); return }
    onEnregistrer({ type, titre: titre.trim(), echeance: iso, note: note.trim(), contactId: cid })
  }
  return (
    <div className="rounded-4 border border-trait bg-fond-2 p-3">
      {erreur ? <Bandeau role="alerte" className="mb-3">{erreur}</Bandeau> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {type !== "note" ? <Etiquette texte={type === "rdv" ? "Objet du RDV" : "Tâche"}><Champ value={titre} onChange={(e) => setTitre(e.target.value)} autoFocus placeholder={type === "rdv" ? "Présentation STC" : "Rappeler, envoyer la plaquette…"} /></Etiquette> : null}
        {type !== "note" ? <Etiquette texte={type === "rdv" ? "Quand" : "Pour le"}><Champ type="datetime-local" value={echeance} onChange={(e) => setEcheance(e.target.value)} /></Etiquette> : null}
        {type === "rdv" ? (
          <Etiquette texte="Comment">
            <Selecteur value={rdvType} onChange={(e) => setRdvType(e.target.value as "telephone" | "visio" | "sur_place")}>
              <option value="telephone">Par téléphone</option>
              <option value="visio">En visio</option>
              <option value="sur_place">Sur place</option>
            </Selecteur>
          </Etiquette>
        ) : null}
        {contacts.length > 0 ? (
          <Etiquette texte="Avec">
            <Selecteur value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">— l'agence —</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{nomContact(c)}</option>)}
            </Selecteur>
          </Etiquette>
        ) : null}
        <Etiquette texte={type === "note" ? "Note" : "Note (facultatif)"} className="sm:col-span-2">
          <Zone value={note} onChange={(e) => setNote(e.target.value)} autoFocus={type === "note"} placeholder={type === "note" ? "Ce qu'il faut retenir" : ""} />
        </Etiquette>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Bouton taille="sm" variante="discret" onClick={onAnnuler} disabled={occupe}>Annuler</Bouton>
        <Bouton taille="sm" chargement={occupe} onClick={valider}>{type === "note" ? "Ajouter la note" : type === "rdv" ? "Ajouter le RDV" : "Créer la tâche"}</Bouton>
      </div>
    </div>
  )
}
