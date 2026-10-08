// ════════════════════════════════════════════════════════════════════════════
// LA MACHINE — l'écran qui répond en un coup d'œil : elle tourne ? depuis
// quand ? qu'a-t-elle fait aujourd'hui ? où ça coince ? qui rappeler ?
//
// Mahdi, 08/10/2026 : « aujourd'hui il faut ouvrir quatre onglets et lire la
// base pour deviner ce qui se passe ». Ici tout est sur une page, rafraîchie
// toute seule toutes les 30 secondes. Les RÉGLAGES (cadence, plafonds, plages,
// relances, alertes) ne sont pas ici : ils vivent dans Réglages › Recrutement.
// Ici : l'interrupteur, les campagnes par corps de métier, et la lecture.
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Play, RefreshCw, Phone, Plus, Trash2 } from "lucide-react"
import type { ClicST, DossierST, EnvoiST, ObjectifMetier, PassageST, PilotageST, SequenceST, SousTraitant } from "../../recrutement"
import { chargerSousTraitants } from "../../lib/sousTraitantsDb"
import { chargerPilotage, majPilotage } from "../../lib/pilotageStDb"
import { chargerObjectifs, creerObjectif, majObjectif, supprimerObjectif } from "../../lib/objectifsStDb"
import { chargerSequences } from "../../lib/sequencesStDb"
import { chargerClicsDepuis, chargerDossiers, chargerEnvoisSurJours, chargerPassages, lancerPassage, rejouerErreursMaintenant } from "../../lib/machineDb"
import { compterNonLus } from "../../lib/messagesDb"
import { CORPS_METIERS } from "../../lib/recrutementCalc"
import { lancerAppelRingover } from "../../lib/ringover"
import {
  aTraiter, campagnes, compterAujourdhui, dansCombien, depuis, erreursParCause, etatDesPassages, joursAvantEpuisement, pourcent, seriesParJour, tunnel,
  type LigneCampagne, type PointJour,
} from "../../lib/statsMachine"
import { Bandeau, Bouton, Carte, Case, Champ, Chargement, Compteurs, Dialogue, EnTetePage, Etiquette, Interrupteur, Pastille, Selecteur, Tableau, Td, Th, TitreCarte, Tr } from "../../ui"
import FicheArtisan from "./FicheArtisan"

const JOUR_MS = 86_400_000
const RAFRAICHIR_MS = 30_000
type Fenetre = 7 | 30 | 60 | 90 | 0
const FENETRES: { id: Fenetre; label: string }[] = [
  { id: 7, label: "7 derniers jours" }, { id: 30, label: "30 derniers jours" }, { id: 60, label: "60 derniers jours" }, { id: 90, label: "90 derniers jours" }, { id: 0, label: "Depuis le début" },
]
const JOURS = ["", "lun", "mar", "mer", "jeu", "ven", "sam", "dim"]
const dateFr = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

type Donnees = {
  pilotage: PilotageST
  passages: PassageST[]
  envois: EnvoiST[]
  clics: ClicST[]
  fiches: SousTraitant[]
  objectifs: ObjectifMetier[]
  dossiers: DossierST[]
  sequences: SequenceST[]
  reponsesNonLues: number
  lu: number
}

export type PageVoisine = "st_base" | "st_sequences" | "st_suivi" | "st_boite" | "st_dossiers" | "reglages"

export default function MachineST({ onNaviguer }: { onNaviguer?: (page: PageVoisine) => void }) {
  const [d, setD] = useState<Donnees | null>(null)
  const [erreur, setErreur] = useState("")
  const [info, setInfo] = useState("")
  const [fenetre, setFenetre] = useState<Fenetre>(30)
  const [fiche, setFiche] = useState<string | null>(null)
  const [question, setQuestion] = useState<"demarrer" | "arreter" | "corps" | null>(null)
  const [occupe, setOccupe] = useState(false)
  const [nouveauCorps, setNouveauCorps] = useState(CORPS_METIERS[0].value)
  const [nouveauVoulu, setNouveauVoulu] = useState(1)
  // L'heure courante, remise à jour toutes les 10 s : les « il y a 4 min » restent vrais.
  const [maintenant, setMaintenant] = useState(() => Date.now())
  const enVie = useRef(true)

  const charger = useCallback(async () => {
    try {
      const [pilotage, passages, envois, clics, fiches, objectifs, dossiers, sequences, reponsesNonLues] = await Promise.all([
        chargerPilotage(), chargerPassages(24), chargerEnvoisSurJours(90), chargerClicsDepuis(new Date(Date.now() - 90 * JOUR_MS).toISOString()),
        chargerSousTraitants(), chargerObjectifs(), chargerDossiers().catch(() => [] as DossierST[]), chargerSequences(), compterNonLus("recrutement"),
      ])
      if (!enVie.current) return
      setD({ pilotage, passages, envois, clics, fiches, objectifs, dossiers, sequences, reponsesNonLues, lu: Date.now() })
      setErreur("")
    } catch (e) {
      if (enVie.current) setErreur(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    enVie.current = true
    const premier = setTimeout(charger, 0)
    const t = setInterval(charger, RAFRAICHIR_MS)
    const horloge = setInterval(() => setMaintenant(Date.now()), 10_000)
    return () => { enVie.current = false; clearTimeout(premier); clearInterval(t); clearInterval(horloge) }
  }, [charger])

  const calc = useMemo(() => {
    if (!d) return null
    const depuisFenetre = fenetre > 0 ? maintenant - fenetre * JOUR_MS : 0
    const sept = maintenant - 7 * JOUR_MS
    return {
      aujourdhui: compterAujourdhui(d.envois, maintenant),
      serie: seriesParJour(d.envois, d.clics, d.fiches, 30, maintenant),
      erreurs: erreursParCause(d.envois, maintenant - 30 * JOUR_MS),
      tunnel: tunnel(d.fiches, fenetre, "", maintenant),
      campagnes: campagnes(d.fiches, d.objectifs, fenetre, maintenant),
      aTraiter: aTraiter(d.fiches, d.envois, d.dossiers, d.reponsesNonLues, maintenant),
      passages: etatDesPassages(d.passages, 15, maintenant),
      epuisement: joursAvantEpuisement(d.fiches, maintenant),
      clics7j: new Set(d.clics.filter((c) => c.destination !== "stop" && new Date(c.cliqueLe).getTime() >= sept).map((c) => c.sousTraitantId)).size,
      nbClics7j: d.clics.filter((c) => c.destination !== "stop" && new Date(c.cliqueLe).getTime() >= sept).length,
      depots7j: d.fiches.filter((f) => f.deposeLe && new Date(f.deposeLe).getTime() >= sept).length,
      objectifSemaine: d.objectifs.filter((o) => o.actif).reduce((s, o) => s + o.objectifHebdo, 0),
      aContacter: d.fiches.filter((f) => f.statut === "a_contacter").length,
      enSequence: d.fiches.filter((f) => f.statut === "en_sequence").length,
      sequence: d.sequences.find((s) => s.id === (d.pilotage.sequenceId || d.sequences.find((x) => x.actif)?.id)) ?? null,
      depuisFenetre,
    }
  }, [d, fenetre, maintenant])

  const agir = async (f: () => Promise<string | void>) => {
    setOccupe(true); setErreur(""); setInfo("")
    try { const m = await f(); if (m) setInfo(m); await charger(); setMaintenant(Date.now()) }
    catch (e) { setErreur(e instanceof Error ? e.message : String(e)) }
    finally { setOccupe(false) }
  }

  if (!d || !calc) return <div className="mx-auto max-w-[1200px] px-8 py-6">{erreur ? <Bandeau role="alerte">{erreur}</Bandeau> : <Chargement texte="Lecture de la machine…" />}</div>

  const { pilotage: pil } = d
  const { aujourdhui, passages } = calc
  const dernier = passages.dernier
  const bilan = (dernier?.bilan ?? {}) as Record<string, number | string | null>
  const n = (k: string) => Number(bilan[k] ?? 0)
  const plafondTotal = pil.plafondJour + pil.plafondSmsJour

  const alertes: { role: "alerte" | "attention" | "info"; texte: string; action?: { label: string; page: PageVoisine } }[] = []
  if (dernier?.erreur) alertes.push({ role: "alerte", texte: `Le dernier passage s'est arrêté sur une erreur : ${dernier.erreur}` })
  if (aujourdhui.erreurs >= 5 && aujourdhui.erreurs >= (aujourdhui.mails + aujourdhui.sms) * 0.2) alertes.push({ role: "alerte", texte: `${aujourdhui.erreurs} envois en erreur aujourd'hui (${calc.erreurs[0]?.cause ?? "cause inconnue"}). La machine les rejoue d'elle-même, ${aujourdhui.enAttenteDeRejeu} attendent leur tour.` })
  if (calc.aTraiter.dossiersSansFiche.length) alertes.push({ role: "attention", texte: `${calc.aTraiter.dossiersSansFiche.length} dossier${calc.aTraiter.dossiersSansFiche.length > 1 ? "s" : ""} déposé${calc.aTraiter.dossiersSansFiche.length > 1 ? "s" : ""} sur le site sans fiche rattachée.`, action: { label: "Rattacher", page: "st_dossiers" } })
  if (calc.aTraiter.reponses) alertes.push({ role: "info", texte: `${calc.aTraiter.reponses} réponse${calc.aTraiter.reponses > 1 ? "s" : ""} d'artisan non lue${calc.aTraiter.reponses > 1 ? "s" : ""} dans la boîte de réception.`, action: { label: "Lire", page: "st_boite" } })
  if (pil.actif && calc.epuisement !== null && calc.epuisement <= 14) alertes.push({ role: "attention", texte: `À ce rythme, il ne reste des artisans à contacter que pour ${calc.epuisement} jour${calc.epuisement > 1 ? "s" : ""}. Il faut réalimenter la base.`, action: { label: "Importer", page: "st_base" } })
  if (pil.actif && !calc.sequence) alertes.push({ role: "alerte", texte: "Aucune séquence n'est choisie : la machine ne peut rien envoyer.", action: { label: "Choisir", page: "st_sequences" } })

  return (
    <div className="mx-auto max-w-[1200px] px-8 py-6">
      <EnTetePage
        titre="Machine"
        sousTitre={<span className="flex flex-wrap items-center gap-2">{pil.adresseEnvoi}{calc.sequence ? <> · séquence <b className="font-medium text-encre">{calc.sequence.nom}</b></> : null}<span className="text-encre-3">· actualisé {depuis(maintenant - d.lu)}, automatique toutes les 30 s</span></span>}
        droite={<>
          <Bouton icone={<RefreshCw />} onClick={() => agir(async () => undefined)} chargement={occupe}>Actualiser</Bouton>
          <Bouton icone={<Play />} disabled={!pil.actif || occupe} onClick={() => agir(async () => { const b = await lancerPassage(); return `Passage fait : ${Number(b.demarrages ?? 0)} démarrage(s), ${Number(b.envois ?? 0)} envoi(s), ${Number(b.erreurs ?? 0)} erreur(s)${b.saut ? ` · ${b.saut}` : ""}.` })}>Lancer un passage maintenant</Bouton>
        </>}
      />

      {erreur ? <Bandeau role="alerte" className="mb-4">{erreur}</Bandeau> : null}
      {info ? <Bandeau role="ok" className="mb-4">{info}</Bandeau> : null}

      {/* ── L'état ── */}
      <Carte className="mb-4 grid grid-cols-1 gap-4 px-5 py-4 lg:grid-cols-[auto_1fr_auto] lg:items-center">
        <div className="flex items-center gap-3">
          <Interrupteur allume={pil.actif} libelle="Marche / arrêt de la machine" disabled={occupe} onChange={(v) => setQuestion(v ? "demarrer" : "arreter")} />
          <div>
            <div className="text-sous-titre font-semibold text-encre">{pil.actif ? "En marche" : "À l'arrêt"}</div>
            <div className="text-legende text-encre-2">
              {pil.actif ? (pil.actifDepuis ? `depuis le ${dateFr(pil.actifDepuis)}` : "") : (pil.arreteLe ? `depuis le ${dateFr(pil.arreteLe)}` : "")}
              {" · "}{d.objectifs.filter((o) => o.actif).length} corps de métier actif{d.objectifs.filter((o) => o.actif).length > 1 ? "s" : ""} · {calc.enSequence} artisans en séquence
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-7 gap-y-2 text-legende text-encre-2">
          <div>Dernier passage<b className="chiffres block font-semibold text-encre">{dernier ? `${dateFr(dernier.debut)} · ${passages.enCours ? "en cours" : depuis(passages.depuisMs ?? 0)}` : "aucun encore"}</b></div>
          <div>Il a fait<b className="chiffres block font-semibold text-encre">{dernier ? (bilan.saut && !n("envois") && !n("demarrages") ? String(bilan.saut) : `${n("demarrages")} démarrage${n("demarrages") > 1 ? "s" : ""} · ${n("envois")} envoi${n("envois") > 1 ? "s" : ""} · ${n("erreurs")} erreur${n("erreurs") > 1 ? "s" : ""}${n("rejoues") ? ` · ${n("rejoues")} rejoué${n("rejoues") > 1 ? "s" : ""}` : ""}${n("conversions") ? ` · ${n("conversions")} dépôt${n("conversions") > 1 ? "s" : ""}` : ""}`) : "—"}</b></div>
          <div>Prochain passage<b className="chiffres block font-semibold text-encre">{passages.prochainDansMs !== null ? dansCombien(passages.prochainDansMs) : "—"}</b></div>
          <div>Plage d'envoi<b className="block font-semibold text-encre">{pil.jours.map((j) => JOURS[j]).join(", ")} · e-mail {pil.heureMin}–{pil.heureMax} · SMS {pil.heureMinSms}–{pil.heureMaxSms}</b></div>
        </div>
        <div className="text-legende text-encre-2 lg:text-right">
          <b className="block font-semibold text-encre">{pil.recalerAuDemarrage ? "Reprise en douceur" : "Reprise brute"}</b>
          {pil.delaiMinTouchesH} h minimum entre deux touches · {pil.tentativesMax} tentatives par envoi
          <button type="button" className="ml-2 text-signature underline-offset-2 hover:underline" onClick={() => onNaviguer?.("reglages")}>Réglages</button>
        </div>
      </Carte>

      {alertes.length ? (
        <div className="mb-4 grid gap-2">
          {alertes.map((a, i) => <Bandeau key={i} role={a.role} action={a.action ? <Bouton taille="sm" onClick={() => onNaviguer?.(a.action!.page)}>{a.action.label} →</Bouton> : undefined}>{a.texte}</Bandeau>)}
        </div>
      ) : null}

      <div className="mb-4">
        <Compteurs valeurs={[
          { id: "envoyes", libelle: "Envoyés aujourd'hui", valeur: <>{aujourdhui.mails + aujourdhui.sms} <span className="text-legende font-medium text-encre-2">/ {plafondTotal}</span></>, detail: `${aujourdhui.mails} e-mails · ${aujourdhui.sms} SMS` },
          { id: "erreurs", libelle: "En erreur aujourd'hui", valeur: aujourdhui.erreurs, detail: aujourdhui.enAttenteDeRejeu ? `${aujourdhui.enAttenteDeRejeu} à rejouer automatiquement` : (aujourdhui.rejoues ? `${aujourdhui.rejoues} rejoué${aujourdhui.rejoues > 1 ? "s" : ""} avec succès` : "rien en attente"), role: aujourdhui.erreurs > 0 ? "alerte" : undefined },
          { id: "clics", libelle: "Clics · 7 jours", valeur: calc.nbClics7j, detail: `${calc.clics7j} artisan${calc.clics7j > 1 ? "s" : ""}` },
          { id: "depots", libelle: "Dépôts · 7 jours", valeur: calc.depots7j, detail: calc.objectifSemaine ? `objectif ${calc.objectifSemaine} par semaine` : "pas d'objectif", role: calc.depots7j > 0 ? "ok" : undefined },
          { id: "desinscrits", libelle: "Désinscrits · 7 jours", valeur: calc.aTraiter.desinscrits7j.length, detail: calc.aTraiter.desinscrits7j.length ? `${calc.aTraiter.desinscrits7j.filter((f) => f.desinscritCanal === "lien").length} par le lien · ${calc.aTraiter.desinscrits7j.filter((f) => f.desinscritCanal === "reponse_email").length} par réponse` : "aucun" },
          { id: "reste", libelle: "Reste à contacter", valeur: calc.aContacter, detail: calc.epuisement === null ? "rien ne démarre pour l'instant" : `base épuisée dans ~${calc.epuisement} j à ce rythme` },
        ]} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="grid gap-4">
          {/* ── Campagnes ── */}
          <Carte>
            <TitreCarte droite={<><Selecteur value={String(fenetre)} onChange={(e) => setFenetre(Number(e.target.value) as Fenetre)} className="w-44">{FENETRES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Selecteur><Bouton taille="sm" icone={<Plus />} onClick={() => setQuestion("corps")}>Ajouter un corps</Bouton></>}>Campagnes par corps de métier</TitreCarte>
            {calc.campagnes.length === 0 ? <p className="px-5 pb-4 text-legende text-encre-2">Aucune campagne : ajoute un corps de métier et le nombre d'artisans voulus par semaine.</p> : (
              <Tableau className="pb-2">
                <thead><tr><Th>Corps</Th><Th num>Voulu / sem.</Th><Th num>En séquence</Th><Th num>Joints</Th><Th num>Clics</Th><Th num>Dépôts</Th><Th num>Taux</Th><Th>Reste à contacter</Th><Th /></tr></thead>
                <tbody>
                  {calc.campagnes.map((c) => <LigneCampagneVue key={`${c.corps}:${c.voulu}`} c={c} occupe={occupe} onVoulu={(v) => agir(async () => { await majObjectif(c.objectifId!, { objectifHebdo: v }) })} onActif={(v) => agir(async () => { await majObjectif(c.objectifId!, { actif: v }) })} onSupprimer={() => agir(async () => { await supprimerObjectif(c.objectifId!); return `Campagne ${c.libelle} retirée.` })} />)}
                </tbody>
              </Tableau>
            )}
            <p className="px-5 pb-4 text-colonne text-encre-2">« Voulu » = recrues voulues par semaine. La machine démarre le volume nécessaire (voulu ÷ taux × 1,25) parmi les fiches complètes du corps, par vagues capées par le budget du jour.</p>
          </Carte>

          {/* ── Activité ── */}
          <Carte>
            <TitreCarte>Activité · 30 derniers jours</TitreCarte>
            <div className="px-5 pb-4"><GraphiqueActivite points={calc.serie} /></div>
          </Carte>

          {/* ── Passages ── */}
          <Carte>
            <TitreCarte>Derniers passages du moteur</TitreCarte>
            <Tableau className="pb-2">
              <thead><tr><Th>Quand</Th><Th>Durée</Th><Th num>Démarrages</Th><Th num>Envois</Th><Th num>Erreurs</Th><Th>Note</Th></tr></thead>
              <tbody>
                {d.passages.slice(0, 8).map((p) => {
                  const b = (p.bilan ?? {}) as Record<string, number | string | null>
                  const duree = p.fin ? Math.round((new Date(p.fin).getTime() - new Date(p.debut).getTime()) / 1000) : null
                  return (
                    <Tr key={p.id}>
                      <Td>{dateFr(p.debut)}</Td><Td>{duree === null ? "en cours" : `${duree} s`}</Td>
                      <Td num>{Number(b.demarrages ?? 0)}</Td><Td num>{Number(b.envois ?? 0)}</Td><Td num className={Number(b.erreurs ?? 0) ? "text-alerte" : ""}>{Number(b.erreurs ?? 0)}</Td>
                      <Td className="text-encre-2">{p.erreur ? <span className="text-alerte">{p.erreur}</span> : (b.saut ? String(b.saut) : (Number(b.recales ?? 0) ? `${b.recales} calendriers recalés` : ""))}</Td>
                    </Tr>
                  )
                })}
                {d.passages.length === 0 ? <tr><Td className="text-encre-2" colSpan={6}>Aucun passage journalisé pour l'instant.</Td></tr> : null}
              </tbody>
            </Tableau>
          </Carte>
        </div>

        <div className="grid content-start gap-4">
          {/* ── À traiter ── */}
          <Carte>
            <TitreCarte droite={calc.aTraiter.interesses.length ? <Bouton taille="sm" onClick={() => onNaviguer?.("st_suivi")}>Tout voir</Bouton> : undefined}>À traiter</TitreCarte>
            <ul className="px-5 pb-3">
              {calc.aTraiter.reponses ? <li className="flex items-center gap-3 border-b border-fond-4 py-2.5 text-legende"><Pastille role="info">Réponses</Pastille><span className="min-w-0 flex-1"><b className="font-semibold text-encre">{calc.aTraiter.reponses} non lue{calc.aTraiter.reponses > 1 ? "s" : ""}</b><span className="block text-encre-2">des artisans ont répondu par e-mail</span></span><Bouton taille="sm" variante="discret" onClick={() => onNaviguer?.("st_boite")}>Lire</Bouton></li> : null}
              {calc.aTraiter.interesses.slice(0, 5).map((f) => (
                <li key={f.id} className="flex items-center gap-3 border-b border-fond-4 py-2.5 text-legende">
                  <Pastille role="info">Intéressé</Pastille>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setFiche(f.id!)}>
                    <b className="block truncate font-semibold text-encre">{f.entreprise || f.contact || f.email}</b>
                    <span className="block text-encre-2">a cliqué « candidater » {depuis(maintenant - new Date(f.candidatureClicLe!).getTime())} · {f.metier || "corps inconnu"}</span>
                  </button>
                  <Bouton taille="sm" variante="discret" icone={<Phone />} onClick={async () => { const r = await lancerAppelRingover(f.telephone); if (!r.ok) setErreur(r.message || "Appel impossible.") }}>Appeler</Bouton>
                </li>
              ))}
              {calc.aTraiter.interesses.length > 5 ? <li className="py-2 text-colonne text-encre-2">et {calc.aTraiter.interesses.length - 5} autres intéressés dans Suivi.</li> : null}
              {calc.aTraiter.erreursEnAttente ? <li className="flex items-center gap-3 border-b border-fond-4 py-2.5 text-legende"><Pastille role="probleme">Erreurs</Pastille><span className="min-w-0 flex-1"><b className="font-semibold text-encre">{calc.aTraiter.erreursEnAttente} envoi{calc.aTraiter.erreursEnAttente > 1 ? "s" : ""} à rejouer</b><span className="block text-encre-2">la machine les reprend d'elle-même au prochain passage</span></span><Bouton taille="sm" variante="discret" disabled={occupe} onClick={() => agir(async () => `${await rejouerErreursMaintenant()} envoi(s) marqués à rejouer au prochain passage.`)}>Rejouer</Bouton></li> : null}
              {calc.aTraiter.dossiersSansFiche.slice(0, 3).map((ds) => <li key={ds.id} className="flex items-center gap-3 border-b border-fond-4 py-2.5 text-legende"><Pastille role="attente">Dossier</Pastille><span className="min-w-0 flex-1"><b className="block truncate font-semibold text-encre">{ds.raisonSociale || ds.email}</b><span className="block text-encre-2">déposé le {new Date(ds.creeLe).toLocaleDateString("fr-FR")}, absent de la base</span></span><Bouton taille="sm" variante="discret" onClick={() => onNaviguer?.("st_dossiers")}>Rattacher</Bouton></li>)}
              {calc.aTraiter.desinscrits7j.length ? <li className="flex items-center gap-3 py-2.5 text-legende"><Pastille>Désinscrits</Pastille><span className="min-w-0 flex-1"><b className="font-semibold text-encre">{calc.aTraiter.desinscrits7j.length} cette semaine</b><span className="block text-encre-2">{calc.aTraiter.desinscrits7j.slice(0, 3).map((f) => f.entreprise || f.email).join(" · ")}</span></span></li> : null}
              {!calc.aTraiter.reponses && !calc.aTraiter.interesses.length && !calc.aTraiter.erreursEnAttente && !calc.aTraiter.dossiersSansFiche.length && !calc.aTraiter.desinscrits7j.length ? <li className="py-3 text-legende text-encre-2">Rien à traiter.</li> : null}
            </ul>
          </Carte>

          {/* ── Tunnel ── */}
          <Carte>
            <TitreCarte droite={<span className="text-colonne text-encre-2">{FENETRES.find((f) => f.id === fenetre)?.label}</span>}>Tunnel</TitreCarte>
            <div className="grid gap-2 px-5 pb-4">
              {([["Démarrés", calc.tunnel.demarres, calc.tunnel.demarres], ["Joints", calc.tunnel.joints, calc.tunnel.demarres], ["Ont cliqué", calc.tunnel.cliques, calc.tunnel.joints], ["Ont déposé", calc.tunnel.deposes, calc.tunnel.cliques]] as [string, number, number][]).map(([lib, v, prec], i) => (
                <div key={lib} className="grid grid-cols-[110px_1fr_90px] items-center gap-3 text-legende">
                  <span className="text-encre-2">{lib}</span>
                  <div className="h-2.5 overflow-hidden rounded-3 bg-fond-3"><i className={`block h-full ${i === 3 ? "bg-ok" : "bg-signature"}`} style={{ width: `${pourcent(v, calc.tunnel.demarres)}%` }} /></div>
                  <span className="chiffres text-right text-encre">{v}{i > 0 ? <span className="text-encre-2"> · {pourcent(v, prec)} %</span> : null}</span>
                </div>
              ))}
            </div>
          </Carte>

          {/* ── Erreurs ── */}
          <Carte>
            <TitreCarte droite={calc.aTraiter.erreursEnAttente ? <Bouton taille="sm" disabled={occupe} onClick={() => agir(async () => `${await rejouerErreursMaintenant()} envoi(s) marqués à rejouer.`)}>Rejouer maintenant</Bouton> : undefined}>Erreurs · 30 derniers jours</TitreCarte>
            {calc.erreurs.length === 0 ? <p className="px-5 pb-4 text-legende text-encre-2">Aucune erreur d'envoi sur la période.</p> : (
              <Tableau className="pb-2">
                <thead><tr><Th>Cause</Th><Th num>Envois</Th><Th>Dernière</Th><Th>État</Th></tr></thead>
                <tbody>
                  {calc.erreurs.map((e) => (
                    <Tr key={e.cause}>
                      <Td>{e.cause}</Td><Td num>{e.n}</Td><Td className="text-encre-2">{dateFr(e.dernier)}</Td>
                      <Td>{e.enAttente ? <Pastille role="attente">{e.enAttente} à rejouer</Pastille> : e.abandonnees ? <Pastille role="probleme">{e.abandonnees} abandonné{e.abandonnees > 1 ? "s" : ""}</Pastille> : <Pastille role="fait">rejoué</Pastille>}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Tableau>
            )}
          </Carte>
        </div>
      </div>

      {fiche ? <FicheArtisan id={fiche} onFermer={() => setFiche(null)} onChange={charger} /> : null}

      {question === "demarrer" ? (
        <Dialogue
          titre="Mettre la machine en marche ?"
          description={pil.recalerAuDemarrage
            ? `Au premier passage, la machine recale le calendrier des ${calc.enSequence} artisans en séquence : leur prochaine étape devient due maintenant, les suivantes gardent leurs écarts, et jamais deux touches à moins de ${pil.delaiMinTouchesH} h. Les erreurs en attente sont rejouées au rythme des plafonds.`
            : `Attention : le recalage est désactivé dans les réglages. Les ${calc.enSequence} artisans en séquence recevront leurs étapes en retard dès le prochain passage.`}
          onFermer={() => setQuestion(null)}
          pied={<><Bouton onClick={() => setQuestion(null)}>Annuler</Bouton><Bouton variante="plein" chargement={occupe} onClick={() => agir(async () => { await majPilotage({ actif: true }); setQuestion(null); return "Machine en marche. Le prochain passage fera le recalage." })}>Mettre en marche</Bouton></>}
        />
      ) : null}
      {question === "arreter" ? (
        <Dialogue
          titre="Arrêter la machine ?"
          description="Plus aucun envoi ni démarrage. Les dépôts de dossier continuent d'être comptés, et les artisans gardent leur place dans la séquence."
          onFermer={() => setQuestion(null)}
          pied={<><Bouton onClick={() => setQuestion(null)}>Annuler</Bouton><Bouton variante="plein" chargement={occupe} onClick={() => agir(async () => { await majPilotage({ actif: false }); setQuestion(null); return "Machine arrêtée." })}>Arrêter</Bouton></>}
        />
      ) : null}
      {question === "corps" ? (
        <Dialogue
          titre="Ajouter un corps de métier"
          description="Un objectif par corps : le nombre de recrues voulues par semaine."
          onFermer={() => setQuestion(null)}
          pied={<><Bouton onClick={() => setQuestion(null)}>Annuler</Bouton><Bouton variante="plein" chargement={occupe} onClick={() => agir(async () => { await creerObjectif({ metier: nouveauCorps, objectifHebdo: Math.max(1, nouveauVoulu), actif: true }); setQuestion(null); return "Campagne ajoutée." })}>Ajouter</Bouton></>}
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <Etiquette texte="Corps de métier"><Selecteur value={nouveauCorps} onChange={(e) => setNouveauCorps(e.target.value)}>{CORPS_METIERS.filter((c) => !d.objectifs.some((o) => o.metier === c.value)).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Selecteur></Etiquette>
            <Etiquette texte="Voulu / semaine"><Champ type="number" min={1} value={nouveauVoulu} onChange={(e) => setNouveauVoulu(Number(e.target.value) || 1)} /></Etiquette>
          </div>
        </Dialogue>
      ) : null}
    </div>
  )
}

function LigneCampagneVue({ c, occupe, onVoulu, onActif, onSupprimer }: { c: LigneCampagne; occupe: boolean; onVoulu: (v: number) => void; onActif: (v: boolean) => void; onSupprimer: () => void }) {
  // La clé de la ligne change avec `c.voulu` : le champ repart de la valeur enregistrée.
  const [voulu, setVoulu] = useState(String(c.voulu))
  const reste = c.dispo
  const roleReste = reste === 0 ? "probleme" : reste < 30 ? "attente" : "fait"
  return (
    <Tr className={c.actif ? "" : "opacity-60"}>
      <Td><b className="font-semibold text-encre">{c.libelle}</b>{!c.actif ? <span className="ml-2 text-colonne text-encre-2">en pause</span> : null}</Td>
      {/* Cellule à largeur fixe : un champ nombre trop étroit cache sa valeur derrière ses flèches. */}
      <Td num className="w-28"><Champ type="number" min={0} value={voulu} onChange={(e) => setVoulu(e.target.value)} onBlur={() => { const v = Math.max(0, Number(voulu) || 0); if (v !== c.voulu) onVoulu(v) }} className="h-7 px-2 text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" disabled={occupe} /></Td>
      <Td num>{c.enSequence}</Td><Td num>{c.joints}</Td><Td num>{c.clics}</Td><Td num>{c.depots}</Td>
      <Td num>{c.joints ? `${(100 * c.taux).toFixed(1).replace(".", ",")} %` : "—"}</Td>
      <Td><Pastille role={roleReste}>{reste} fiche{reste > 1 ? "s" : ""}</Pastille></Td>
      <Td><span className="flex items-center justify-end gap-1"><Case texte="" checked={c.actif} onChange={(e) => onActif(e.target.checked)} title={c.actif ? "Mettre en pause ce corps" : "Reprendre ce corps"} /><Bouton taille="sm" variante="discret" icone={<Trash2 />} onClick={onSupprimer} aria-label="Retirer la campagne" /></span></Td>
    </Tr>
  )
}

/** Barres empilées par jour (e-mails, SMS, erreurs), points pour les clics et les dépôts. */
function GraphiqueActivite({ points }: { points: PointJour[] }) {
  const W = 760, H = 200, gauche = 34, droite = 8, haut = 12, bas = 26
  const max = Math.max(20, ...points.map((p) => p.mails + p.sms + p.erreurs), ...points.map((p) => p.clics))
  const pas = Math.max(10, Math.ceil(max / 4 / 10) * 10)
  const plafond = Math.ceil(max / pas) * pas
  const n = points.length, slot = (W - gauche - droite) / n, bw = slot * 0.64
  const y = (v: number) => haut + (H - haut - bas) * (1 - v / plafond)
  const grille = Array.from({ length: plafond / pas + 1 }, (_, i) => i * pas)
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Envois par jour sur 30 jours">
        {grille.map((g) => <g key={g}><line x1={gauche} x2={W - droite} y1={y(g)} y2={y(g)} className="stroke-trait" strokeWidth={1} /><text x={gauche - 6} y={y(g) + 4} textAnchor="end" fontSize={10} className="fill-encre-2">{g}</text></g>)}
        {points.map((p, i) => {
          const x = gauche + i * slot + (slot - bw) / 2
          let base = 0
          const piles: [number, string][] = [[p.mails, "fill-signature"], [p.sms, "fill-info"], [p.erreurs, "fill-alerte"]]
          const jour = p.jour.slice(8) + "/" + p.jour.slice(5, 7)
          return (
            <g key={p.jour}>
              {piles.map(([v, cls], k) => { if (v <= 0) return null; const r = <rect key={k} x={x} y={y(base + v)} width={bw} height={y(base) - y(base + v)} className={cls} rx={1} />; base += v; return r })}
              {p.clics > 0 ? <circle cx={x + bw / 2} cy={y(p.clics)} r={3} className="fill-encre" /> : null}
              {p.depots > 0 ? <circle cx={x + bw / 2} cy={y(plafond) + 5} r={4} className="fill-ok" /> : null}
              {(i % 5 === 0 || i === n - 1) ? <text x={x + bw / 2} y={H - bas + 14} textAnchor="middle" fontSize={10} className="fill-encre-2">{jour}</text> : null}
            </g>
          )
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-colonne text-encre-2">
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-3 bg-signature align-[-1px]" />E-mails</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-3 bg-info align-[-1px]" />SMS</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-3 bg-alerte align-[-1px]" />Erreurs</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-encre align-[-1px]" />Clics</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-ok align-[-1px]" />Dépôts</span>
      </div>
    </>
  )
}
