// ════════════════════════════════════════════════════════════════════════════
// LA BASE D'ARTISANS — toutes les fiches, leurs filtres, l'ajout, l'import
//
// Une page de la trousse STC : en-tête, compteurs par statut (cliquables),
// barre de filtres, tableau paginé. Chaque ligne s'ouvre dans la fiche artisan
// (panneau à droite). L'ajout et la modification passent par un dialogue ;
// l'import se fait en deux temps : on lit le fichier, on MONTRE ce qui va
// entrer (nouvelles, doublons, exclus, rejetées), puis seulement on insère.
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react"
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2, Upload } from "lucide-react"
import type { SousTraitant, StatutST } from "../../recrutement"
import { STATUTS_ARRETES, libelleStatutST, rolePastilleStatut } from "../../recrutement"
import { supabaseConfigure } from "../../lib/supabase"
import { chargerSousTraitants, creerSousTraitant, insererSousTraitants, majSousTraitant, remettreAContacter, supprimerSousTraitant } from "../../lib/sousTraitantsDb"
import { chargerExclusions } from "../../lib/machineDb"
import { chargerEtapes, chargerSequences } from "../../lib/sequencesStDb"
import { CORPS_METIERS } from "../../lib/recrutementCalc"
import { dedoublonner, importerSousTraitants } from "../../lib/importSousTraitants"
import { FILTRES_VIDES, compterParStatut, filtrerFiches, sourcesDistinctes, type FiltresBase } from "../../lib/baseFiltres"
import { Bandeau, BarreFiltres, Bouton, Carte, Case, Champ, Chargement, Compteurs, Dialogue, EnTetePage, Etiquette, Ligne, Pastille, Selecteur, Tableau, Td, Th, Tr, Vide } from "../../ui"
import FicheArtisan from "./FicheArtisan"

const PAR_PAGE = 50
const jourMois = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
const dateHeure = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
const dateLongue = (iso: string) => new Date(iso).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })
const pluriel = (n: number, mot: string, pl = mot + "s") => `${n} ${n > 1 ? pl : mot}`
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

// Le métier d'une fiche = un corps de la liste + d'éventuels « autres », joints par " / ".
// On retrouve le PREMIER corps connu dans la chaîne ; le reste devient « autres ».
function separerCorps(metier: string): { corps: string; autres: string } {
  const m = (metier || "").trim()
  const bas = m.toLowerCase()
  const trouve = CORPS_METIERS.find((c) => bas.includes(c.value.toLowerCase()))
  if (!trouve) return { corps: "", autres: m }
  const i = bas.indexOf(trouve.value.toLowerCase())
  const reste = m.slice(0, i) + m.slice(i + trouve.value.length)
  const autres = reste.split("/").map((s) => s.trim()).filter(Boolean).join(" / ")
  return { corps: trouve.value, autres }
}
const joindreCorps = (corps: string, autres: string) => [corps.trim(), autres.trim()].filter(Boolean).join(" / ")

type Compteur = StatutST | "tous"
const COMPTEURS: { id: Compteur; libelle: string }[] = [
  { id: "tous", libelle: "Toutes" },
  { id: "a_contacter", libelle: "À contacter" },
  { id: "en_sequence", libelle: "En séquence" },
  { id: "termine", libelle: "Terminés" },
  { id: "depose", libelle: "Déposés" },
  { id: "desinscrit", libelle: "Désinscrits" },
  { id: "injoignable", libelle: "Injoignables" },
  { id: "exclu", libelle: "Exclus" },
]

export default function BaseST() {
  const [fiches, setFiches] = useState<SousTraitant[]>([])
  const [nbEtapes, setNbEtapes] = useState<Map<string, number>>(new Map()) // séquence → nombre d'étapes actives
  // Sans base configurée, la page naît en erreur : rien à charger.
  const [chargement, setChargement] = useState(!!supabaseConfigure)
  const [erreur, setErreur] = useState(supabaseConfigure ? "" : "Base non configurée.")
  const [info, setInfo] = useState("")
  const [filtres, setFiltres] = useState<FiltresBase>(FILTRES_VIDES)
  const [page, setPage] = useState(0)
  const [ficheOuverte, setFicheOuverte] = useState<string | null>(null)
  const [edition, setEdition] = useState<{ st: SousTraitant | null } | null>(null) // null = fermé ; st null = ajout
  const [importOuvert, setImportOuvert] = useState(false)

  // Relire la base (après un ajout, un import, une action dans la fiche).
  const recharger = useCallback(
    () => chargerSousTraitants().then((l) => { setFiches(l); setErreur("") }).catch((e) => setErreur(message(e))),
    [],
  )

  useEffect(() => {
    if (!supabaseConfigure) return
    chargerSousTraitants()
      .then((l) => { setFiches(l); setErreur("") })
      .catch((e) => setErreur(message(e)))
      .finally(() => setChargement(false))
    // Le nombre d'étapes de chaque séquence, pour écrire « étape 2 / 4 ».
    // Sans lui, on écrit « étape 2 » : ce n'est pas bloquant.
    chargerSequences()
      .then((seqs) => Promise.all(seqs.filter((s) => s.id).map(async (s) => [s.id!, (await chargerEtapes(s.id!)).filter((e) => e.actif).length] as const)))
      .then((paires) => setNbEtapes(new Map(paires)))
      .catch(() => undefined)
  }, [])

  // Chaque changement de filtre ramène à la première page.
  const majFiltres = (patch: Partial<FiltresBase>) => { setFiltres((f) => ({ ...f, ...patch })); setPage(0) }
  const filtresActifs = (Object.keys(FILTRES_VIDES) as (keyof FiltresBase)[]).some((k) => filtres[k] !== FILTRES_VIDES[k])

  const compte = useMemo(() => compterParStatut(fiches), [fiches])
  const sources = useMemo(() => sourcesDistinctes(fiches), [fiches])
  const filtrees = useMemo(() => filtrerFiches(fiches, filtres), [fiches, filtres])
  const nbPages = Math.max(1, Math.ceil(filtrees.length / PAR_PAGE))
  const pageCourante = Math.min(page, nbPages - 1)
  const visibles = filtrees.slice(pageCourante * PAR_PAGE, pageCourante * PAR_PAGE + PAR_PAGE)
  const arretees = STATUTS_ARRETES.reduce((n, s) => n + compte[s], 0)

  const avancement = (st: SousTraitant) => {
    const total = st.sequenceId ? nbEtapes.get(st.sequenceId) : undefined
    // etapeCourante = l'index de la PROCHAINE étape à envoyer ; on affiche celle où l'artisan en est.
    const n = total ? Math.min(st.etapeCourante + 1, total) : st.etapeCourante + 1
    return total ? `étape ${n} / ${total}` : `étape ${n}`
  }

  const sousTitre = `${pluriel(compte.tous, "fiche")} · ${compte.a_contacter} à contacter · ${compte.en_sequence} en séquence · ${pluriel(arretees, "arrêtée")}`

  return (
    <div className="page">
      <EnTetePage
        titre="Base d'artisans"
        sousTitre={sousTitre}
        droite={
          <>
            <Bouton icone={<Upload />} onClick={() => setImportOuvert(true)} disabled={chargement || !!erreur}>Importer un fichier</Bouton>
            <Bouton variante="plein" icone={<Plus />} onClick={() => setEdition({ st: null })} disabled={chargement}>Ajouter</Bouton>
          </>
        }
      />

      {erreur ? <Bandeau role="alerte" className="mb-4" action={<Bouton taille="sm" onClick={() => { setChargement(true); recharger().finally(() => setChargement(false)) }}>Réessayer</Bouton>}>{erreur}</Bandeau> : null}
      {info ? <Bandeau role="ok" className="mb-4" action={<Bouton taille="sm" variante="discret" onClick={() => setInfo("")}>Fermer</Bouton>}>{info}</Bandeau> : null}

      {chargement ? <Chargement texte="Chargement de la base…" /> : null}

      {!chargement && !erreur ? (
        <>
          <div className="mb-4">
            <Compteurs<Compteur>
              valeurs={COMPTEURS.map((c) => ({ id: c.id, libelle: c.libelle, valeur: compte[c.id] }))}
              actif={filtres.statut === "" ? "tous" : filtres.statut}
              onSelect={(id) => majFiltres({ statut: id === "tous" ? "" : id })}
            />
          </div>

          <BarreFiltres className="mb-4">
            <div className="min-w-[240px] flex-1">
              <Champ
                type="search"
                value={filtres.recherche}
                onChange={(e) => majFiltres({ recherche: e.target.value })}
                placeholder="Rechercher : entreprise, contact, e-mail, téléphone, zone"
                aria-label="Rechercher"
              />
            </div>
            <Selecteur className="w-[190px]" value={filtres.corps} onChange={(e) => majFiltres({ corps: e.target.value })} aria-label="Corps de métier">
              <option value="">Tous les corps</option>
              {CORPS_METIERS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Selecteur>
            <Selecteur className="w-[170px]" value={filtres.source} onChange={(e) => majFiltres({ source: e.target.value })} aria-label="Source">
              <option value="">Toutes les sources</option>
              {sources.map((s) => <option key={s} value={s}>{s}</option>)}
            </Selecteur>
            <Case texte="avec une erreur d'envoi" checked={filtres.avecErreur} onChange={(e) => majFiltres({ avecErreur: e.target.checked })} />
            <Case texte="e-mail invalide" checked={filtres.emailInvalide} onChange={(e) => majFiltres({ emailInvalide: e.target.checked })} />
            {filtresActifs ? <Bouton variante="discret" taille="sm" onClick={() => { setFiltres(FILTRES_VIDES); setPage(0) }}>Effacer</Bouton> : null}
          </BarreFiltres>

          <Carte className="overflow-hidden">
            {filtrees.length === 0 ? (
              fiches.length === 0
                ? <Vide titre="Aucune fiche" texte="Importez un fichier Excel ou CSV, ou ajoutez un artisan à la main." action={<Bouton icone={<Upload />} onClick={() => setImportOuvert(true)}>Importer un fichier</Bouton>} />
                : <Vide titre="Rien ne correspond" texte="Aucune fiche ne passe ces filtres." action={<Bouton onClick={() => { setFiltres(FILTRES_VIDES); setPage(0) }}>Effacer les filtres</Bouton>} />
            ) : (
              <Tableau>
                <thead>
                  <tr>
                    <Th>Entreprise</Th>
                    <Th>Coordonnées</Th>
                    <Th>Corps</Th>
                    <Th>Zone · Source</Th>
                    <Th>Statut</Th>
                    <Th>Avancement</Th>
                    <Th num>Clics</Th>
                    <Th>Depuis</Th>
                    <Th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((st) => (
                    <Tr key={st.id} onClick={() => st.id && setFicheOuverte(st.id)}>
                      <Td>
                        <div className="font-medium text-encre">{st.entreprise || "—"}</div>
                        {st.contact ? <div className="text-encre-2">{st.contact}</div> : null}
                      </Td>
                      <Td>
                        <div>
                          <span className={st.emailInvalide ? "text-alerte line-through" : "text-encre"}>{st.email || "—"}</span>
                          {st.emailInvalide ? <span className="ml-2 text-colonne text-alerte">injoignable</span> : null}
                        </div>
                        <div className="chiffres text-encre-2">{st.telephone || "—"}</div>
                      </Td>
                      <Td>{st.metier || "—"}</Td>
                      <Td>
                        <div>{st.zone || "—"}</div>
                        {st.source ? <div className="text-encre-2">{st.source}</div> : null}
                      </Td>
                      <Td>
                        <Pastille role={rolePastilleStatut[st.statut]} point className={st.statutMotif ? "cursor-help" : ""}>
                          <span title={st.statutMotif || undefined}>{libelleStatutST[st.statut]}</span>
                        </Pastille>
                      </Td>
                      <Td>
                        <div>{st.statut === "en_sequence" ? avancement(st) : "—"}</div>
                        {st.dernierEnvoiLe ? <div className="text-colonne text-encre-2">envoi {dateHeure(st.dernierEnvoiLe)}</div> : null}
                      </Td>
                      <Td num>{st.nbClics || 0}</Td>
                      <Td>
                        {st.statutLe
                          ? <span className="chiffres" title={dateLongue(st.statutLe)}>{jourMois(st.statutLe)}</span>
                          : st.creeLe ? <span className="chiffres text-encre-2" title={`créée le ${dateLongue(st.creeLe)}`}>{jourMois(st.creeLe)}</span> : "—"}
                      </Td>
                      <Td className="text-right">
                        <Bouton variante="discret" taille="icone" aria-label="Modifier" title="Modifier" icone={<Pencil />} onClick={(e) => { e.stopPropagation(); setEdition({ st }) }} />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Tableau>
            )}
          </Carte>

          {filtrees.length > 0 ? (
            <div className="mt-3 flex items-center justify-between gap-3 text-legende text-encre-2">
              <span className="chiffres">
                {pageCourante * PAR_PAGE + 1}–{Math.min(filtrees.length, (pageCourante + 1) * PAR_PAGE)} sur {filtrees.length}
              </span>
              {nbPages > 1 ? (
                <div className="flex items-center gap-2">
                  <Bouton taille="sm" icone={<ChevronLeft />} disabled={pageCourante <= 0} onClick={() => setPage(pageCourante - 1)}>Précédent</Bouton>
                  <span className="chiffres">page {pageCourante + 1} / {nbPages}</span>
                  <Bouton taille="sm" disabled={pageCourante >= nbPages - 1} onClick={() => setPage(pageCourante + 1)}>Suivant <ChevronRight /></Bouton>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {ficheOuverte ? <FicheArtisan id={ficheOuverte} onFermer={() => setFicheOuverte(null)} onChange={recharger} /> : null}

      {edition ? (
        <DialogueFiche
          fiche={edition.st}
          onFermer={() => setEdition(null)}
          onEnregistre={async (msg) => { setEdition(null); setInfo(msg); await recharger() }}
        />
      ) : null}

      {importOuvert ? (
        <DialogueImport
          fiches={fiches}
          onFermer={() => setImportOuvert(false)}
          onImporte={async (n) => { setImportOuvert(false); setInfo(`${pluriel(n, "fiche importée", "fiches importées")}.`); await recharger() }}
        />
      ) : null}
    </div>
  )
}

// ── Ajouter / modifier une fiche ─────────────────────────────────────────────
type Formulaire = { entreprise: string; contact: string; email: string; telephone: string; corps: string; autres: string; zone: string; source: string; statut: StatutST }

function DialogueFiche({ fiche, onFermer, onEnregistre }: { fiche: SousTraitant | null; onFermer: () => void; onEnregistre: (message: string) => Promise<void> }) {
  const [f, setF] = useState<Formulaire>(() => {
    const { corps, autres } = separerCorps(fiche?.metier ?? "")
    return {
      entreprise: fiche?.entreprise ?? "", contact: fiche?.contact ?? "", email: fiche?.email ?? "", telephone: fiche?.telephone ?? "",
      corps, autres, zone: fiche?.zone ?? "", source: fiche?.source ?? "", statut: fiche?.statut ?? "a_contacter",
    }
  })
  const [erreur, setErreur] = useState("")
  const [occupe, setOccupe] = useState(false)
  const [confirmerSuppression, setConfirmerSuppression] = useState(false)
  const set = (k: keyof Formulaire) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }))

  const modification = !!fiche?.id
  // Le statut ne se change ici qu'entre « à contacter » et « exclu » ; un désinscrit
  // ne revient jamais par ce chemin (sa liste d'exclusion l'en empêcherait de toute façon).
  const statutModifiable = modification && fiche!.statut !== "desinscrit"
  const optionsStatut: StatutST[] = [...new Set<StatutST>([fiche?.statut ?? "a_contacter", "a_contacter", "exclu"])]

  const enregistrer = async () => {
    if (!f.email.trim() && !f.telephone.trim()) { setErreur("Il faut au moins un e-mail ou un téléphone : sans ça, on ne peut pas écrire à l'artisan."); return }
    if (!f.entreprise.trim() && !f.contact.trim()) { setErreur("Donnez au moins le nom de l'entreprise ou du contact."); return }
    setOccupe(true); setErreur("")
    const champs: Partial<SousTraitant> = {
      entreprise: f.entreprise.trim(), contact: f.contact.trim(), email: f.email.trim(), telephone: f.telephone.trim(),
      metier: joindreCorps(f.corps, f.autres), zone: f.zone.trim(), source: f.source.trim(),
    }
    try {
      if (!modification) {
        await creerSousTraitant({ ...champs, statut: "a_contacter", etapeCourante: 0, nbClics: 0 })
        await onEnregistre("Fiche ajoutée : elle est « à contacter ».")
        return
      }
      await majSousTraitant(fiche!.id!, champs)
      if (statutModifiable && f.statut !== fiche!.statut) {
        // Remettre « à contacter » remet aussi la séquence à zéro ; « exclu » arrête la machine.
        if (f.statut === "a_contacter") await remettreAContacter(fiche!.id!)
        else if (f.statut === "exclu") await majSousTraitant(fiche!.id!, { statut: "exclu", statutMotif: "exclu depuis l'écran", pauseJusquAu: null })
      }
      await onEnregistre("Fiche enregistrée.")
    } catch (e) {
      setErreur(message(e))
      setOccupe(false)
    }
  }

  const supprimer = async () => {
    setOccupe(true); setErreur("")
    try {
      await supprimerSousTraitant(fiche!.id!)
      await onEnregistre("Fiche supprimée définitivement.")
    } catch (e) {
      setErreur(message(e))
      setOccupe(false)
      setConfirmerSuppression(false)
    }
  }

  // La confirmation prend la place du formulaire (Échap ne referme qu'elle ;
  // le formulaire, et ce qu'on y a tapé, réapparaissent derrière).
  if (confirmerSuppression) {
    return (
      <Dialogue
        titre="Supprimer définitivement cette fiche ?"
        description="Son historique d'envois et de clics disparaît avec elle. Pour simplement cesser de lui écrire, préférez « Ne plus contacter » depuis la fiche."
        onFermer={() => setConfirmerSuppression(false)}
        largeur="max-w-md"
        pied={
          <>
            <Bouton onClick={() => setConfirmerSuppression(false)} disabled={occupe}>Annuler</Bouton>
            <Bouton variante="danger" icone={<Trash2 />} chargement={occupe} onClick={supprimer}>Supprimer</Bouton>
          </>
        }
      >
        {erreur ? <Bandeau role="alerte">{erreur}</Bandeau> : null}
        <p className="text-legende text-encre">{fiche!.entreprise || fiche!.contact || fiche!.email}</p>
      </Dialogue>
    )
  }

  return (
    <Dialogue
      titre={modification ? "Modifier la fiche" : "Ajouter un artisan"}
      description={modification ? fiche!.entreprise || fiche!.contact : "Il entre dans la base « à contacter » : la machine le démarrera si sa fiche est complète."}
      onFermer={onFermer}
      pied={
        <>
          {modification ? <Bouton variante="danger" icone={<Trash2 />} disabled={occupe} onClick={() => setConfirmerSuppression(true)} className="mr-auto">Supprimer définitivement</Bouton> : null}
          <Bouton onClick={onFermer} disabled={occupe}>Annuler</Bouton>
          <Bouton variante="plein" chargement={occupe} onClick={enregistrer}>{modification ? "Enregistrer" : "Ajouter"}</Bouton>
        </>
      }
    >
      {erreur ? <Bandeau role="alerte" className="mb-4">{erreur}</Bandeau> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Etiquette texte="Entreprise"><Champ value={f.entreprise} onChange={set("entreprise")} autoFocus /></Etiquette>
        <Etiquette texte="Contact"><Champ value={f.contact} onChange={set("contact")} placeholder="Prénom Nom" /></Etiquette>
        <Etiquette texte="E-mail"><Champ type="email" value={f.email} onChange={set("email")} /></Etiquette>
        <Etiquette texte="Téléphone"><Champ type="tel" value={f.telephone} onChange={set("telephone")} placeholder="06 12 34 56 78" /></Etiquette>
        <Etiquette texte="Corps de métier">
          <Selecteur value={f.corps} onChange={set("corps")}>
            <option value="">— choisir —</option>
            {CORPS_METIERS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Selecteur>
        </Etiquette>
        <Etiquette texte="Autres corps" aide="Séparés par « / » ; ils s'ajoutent au corps choisi.">
          <Champ value={f.autres} onChange={set("autres")} placeholder="ex. Couverture / Serrurerie" />
        </Etiquette>
        <Etiquette texte="Zone"><Champ value={f.zone} onChange={set("zone")} placeholder="Ville, département…" /></Etiquette>
        <Etiquette texte="Source"><Champ value={f.source} onChange={set("source")} placeholder="ex. Pages Jaunes, Google Maps…" /></Etiquette>
        {statutModifiable ? (
          <Etiquette texte="Statut" aide="Seuls « À contacter » et « Exclu » se posent ici ; les autres viennent de la fiche ou de la machine." className="sm:col-span-2">
            <Selecteur value={f.statut} onChange={set("statut")}>
              {optionsStatut.map((s) => <option key={s} value={s}>{libelleStatutST[s]}</option>)}
            </Selecteur>
          </Etiquette>
        ) : modification ? (
          <div className="sm:col-span-2 text-legende text-encre-2">Statut : {libelleStatutST[fiche!.statut]} — un désinscrit ne revient jamais dans le circuit.</div>
        ) : null}
      </div>
    </Dialogue>
  )
}

// ── Importer un fichier, en deux temps ───────────────────────────────────────
type Rapport = { aAjouter: Partial<SousTraitant>[]; doublons: number; exclus: number; rejetees: number; feuille: string }

function DialogueImport({ fiches, onFermer, onImporte }: { fiches: SousTraitant[]; onFermer: () => void; onImporte: (n: number) => Promise<void> }) {
  const [fichier, setFichier] = useState<File | null>(null)
  const [corps, setCorps] = useState("")
  const [source, setSource] = useState("")
  const [rapport, setRapport] = useState<Rapport | null>(null)
  const [erreur, setErreur] = useState("")
  const [occupe, setOccupe] = useState(false)

  const analyser = async () => {
    if (!fichier) return
    setOccupe(true); setErreur("")
    try {
      const [lu, exclusions] = await Promise.all([importerSousTraitants(fichier), chargerExclusions()])
      // Le corps et la source choisis s'appliquent à TOUT le fichier ; vides, on garde ses colonnes.
      const nouvelles = lu.sousTraitants.map((s) => ({ ...s, ...(corps ? { metier: corps } : {}), ...(source.trim() ? { source: source.trim() } : {}) }))
      const d = dedoublonner(nouvelles, fiches, exclusions)
      setRapport({ aAjouter: d.aAjouter, doublons: d.doublons, exclus: d.exclus, rejetees: lu.ignorees, feuille: lu.feuille })
    } catch (e) {
      setErreur(message(e))
    } finally {
      setOccupe(false)
    }
  }

  const importer = async () => {
    if (!rapport || rapport.aAjouter.length === 0) return
    setOccupe(true); setErreur("")
    try {
      const n = await insererSousTraitants(rapport.aAjouter)
      await onImporte(n)
    } catch (e) {
      setErreur(message(e))
      setOccupe(false)
    }
  }

  if (rapport) {
    const n = rapport.aAjouter.length
    return (
      <Dialogue
        titre="Ce qui va entrer dans la base"
        description={`${fichier?.name ?? ""}${rapport.feuille && rapport.feuille !== fichier?.name ? ` · onglet « ${rapport.feuille} »` : ""}`}
        onFermer={onFermer}
        pied={
          <>
            <Bouton onClick={() => setRapport(null)} disabled={occupe}>Retour</Bouton>
            <Bouton variante="plein" icone={<Upload />} chargement={occupe} disabled={n === 0} onClick={importer}>Importer {pluriel(n, "fiche")}</Bouton>
          </>
        }
      >
        {erreur ? <Bandeau role="alerte" className="mb-4">{erreur}</Bandeau> : null}
        <div className="divide-y divide-fond-4">
          <Ligne libelle="Nouvelles fiches"><span className={`chiffres font-semibold ${n > 0 ? "text-ok" : ""}`}>{n}</span></Ligne>
          <Ligne libelle="Doublons ignorés (déjà dans la base)"><span className="chiffres">{rapport.doublons}</span></Ligne>
          <Ligne libelle="Exclus ignorés (liste d'exclusion)"><span className="chiffres">{rapport.exclus}</span></Ligne>
          <Ligne libelle="Rejetées (sans e-mail ni téléphone)"><span className="chiffres">{rapport.rejetees}</span></Ligne>
          {corps ? <Ligne libelle="Corps de métier appliqué">{CORPS_METIERS.find((c) => c.value === corps)?.label ?? corps}</Ligne> : null}
          {source.trim() ? <Ligne libelle="Source appliquée">{source.trim()}</Ligne> : null}
        </div>
        {n === 0 ? <Bandeau role="attention" className="mt-4">Rien à importer : toutes les lignes sont déjà connues, exclues ou inutilisables.</Bandeau> : null}
      </Dialogue>
    )
  }

  return (
    <Dialogue
      titre="Importer un fichier"
      description="Excel (.xlsx) ou CSV, avec une ligne d'en-tête : Entreprise, Contact, E-mail, Téléphone, Métier, Zone, Source. Rien n'est inséré avant que vous ayez vu le rapport."
      onFermer={onFermer}
      pied={
        <>
          <Bouton onClick={onFermer} disabled={occupe}>Annuler</Bouton>
          <Bouton variante="plein" chargement={occupe} disabled={!fichier} onClick={analyser}>Lire le fichier</Bouton>
        </>
      }
    >
      {erreur ? <Bandeau role="alerte" className="mb-4">{erreur}</Bandeau> : null}
      <div className="grid gap-4">
        <Etiquette texte="Fichier">
          <Champ type="file" accept=".xlsx,.csv" className="py-1.5 file:mr-3 file:rounded-3 file:border-0 file:bg-fond-3 file:px-2 file:text-legende file:text-encre" onChange={(e) => setFichier(e.target.files?.[0] ?? null)} />
        </Etiquette>
        <Etiquette texte="Corps de métier de ce fichier" aide="Appliqué à toutes les lignes. Vide = on garde la colonne « Métier » du fichier.">
          <Selecteur value={corps} onChange={(e) => setCorps(e.target.value)}>
            <option value="">— garder le métier du fichier —</option>
            {CORPS_METIERS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Selecteur>
        </Etiquette>
        <Etiquette texte="Source" aide="D'où viennent ces artisans. Vide = on garde la colonne « Source » du fichier, si elle existe.">
          <Champ value={source} onChange={(e) => setSource(e.target.value)} placeholder="ex. Pages Jaunes, Google Maps, salon…" />
        </Etiquette>
      </div>
    </Dialogue>
  )
}
