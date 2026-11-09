// La lecture des LEADS REÇUS (voir leadsRecus.ts et parcoursLead.ts). Pour chaque contact : ses faits (lead d'agence,
// agence travaillée, dossier déposé, artisan qui a cliqué ou promis), sa campagne, et ce que le parcours de cette
// campagne en dit. Ceux qui n'ont pas atteint l'étape « lead » de leur campagne ne sont pas renvoyés : ils restent en session.
import { supabase } from "./supabase"
import { lireParLots } from "./pagination"
import { chargerDossiers } from "./machineDb"
import { statutDossier } from "./dossierStatut"
import type { SousTraitant } from "../recrutement"
import type { Espace } from "./messagesDb"
import { AUCUN_FAIT, niveauDe, positionDans, type Faits } from "./parcoursLead"
import { campagneParContact, niveauAgence, type LeadRecu, type Niveau } from "./leadsRecus"
import type { PositionCampagne } from "../prospection/mesureCampagne"
import { versCampagne } from "../prospection/depotSupabase"
import { ORIGINE_TRACABILITE, configDe, type Creatif, type Qualification } from "../prospection/configCampagne"
import type { Campagne } from "../prospection/modele"

function sb() {
  if (!supabase) throw new Error("Supabase n'est pas configuré.")
  return supabase
}
type Lot<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>
const JOURS_TRAITES = 90 // les agences travaillées et les leads déjà traités : les trois derniers mois
const COLS_AGENCE = "id, nom, etape, commercial_id, premier_os_le, compte_ouvert_le, derniere_activite_le, tentatives"
const COLS_ARTISAN = "id, entreprise, contact, metier, suivi, nb_appels, desinscrit_le, dernier_clic_le, bareme_vu_le, candidature_clic_le, nb_clics, cree_le, contrat_statut, acces_ouvert_le"

type LigneLead = { id: string; agence_id: string; source: string; signal: string; detail: string | null; cree_le: string; dernier_signal_le: string | null; statut: string; resultat: string | null; tentatives: number | null }
type LigneAgence = { id: string; nom: string; etape: string | null; commercial_id: string | null; premier_os_le: string | null; compte_ouvert_le: string | null; derniere_activite_le: string | null; tentatives: number | null }
type LigneArtisan = { id: string; entreprise: string | null; contact: string | null; metier: string | null; suivi: string | null; nb_appels: number | null; desinscrit_le: string | null; dernier_clic_le: string | null; bareme_vu_le: string | null; candidature_clic_le: string | null; nb_clics: number | null; cree_le: string; contrat_statut: string | null; acces_ouvert_le: string | null }

const ETAPES_INTERESSEES = ["interesse", "rdv_planifie", "client"]
const ETAPES_PERDUES = ["pas_interesse", "hors_cible"]
const SUIVIS_PERDUS = ["pas_interesse", "hors_cible", "archive"]
const CONTRATS_PARTIS = ["envoye", "livre", "signe_artisan", "signe"]

function faitsAgence(a: LigneAgence | undefined, l: LigneLead | undefined): Faits {
  const interesse = l?.resultat === "interesse" || l?.resultat === "rdv" || ETAPES_INTERESSEES.includes(a?.etape ?? "")
  return {
    ...AUCUN_FAIT, interet: Boolean(l), jointInteresse: interesse, formulaireProspect: l?.source === "formulaire",
    rdv: l?.resultat === "rdv" || a?.etape === "rdv_planifie", compteOuvert: Boolean(a?.compte_ouvert_le), premierOs: Boolean(a?.premier_os_le) || a?.etape === "client",
    perdu: l?.statut === "retombe" || ["pas_interesse", "injoignable", "apporteur"].includes(l?.resultat ?? "") || ETAPES_PERDUES.includes(a?.etape ?? ""),
  }
}
function faitsArtisan(s: LigneArtisan | undefined, dossier: { traiteLe?: string | null; completLe?: string | null } | undefined): Faits {
  const contrat = s?.contrat_statut ?? ""
  return {
    ...AUCUN_FAIT, interet: Boolean(s && (s.dernier_clic_le || s.bareme_vu_le || s.candidature_clic_le || (s.nb_clics ?? 0) > 0)), jointInteresse: s?.suivi === "va_deposer",
    dossier: Boolean(dossier), formulaireTel: Boolean(dossier?.traiteLe), // « Marquer traité » : le dossier a été repris avec l'artisan
    contratsEnvoyes: CONTRATS_PARTIS.includes(contrat), contratsSignes: contrat === "signe" || Boolean(dossier?.completLe), compteOuvert: Boolean(s?.acces_ouvert_le),
    perdu: Boolean(s?.desinscrit_le) || SUIVIS_PERDUS.includes(s?.suivi ?? ""),
  }
}

/** Valide ou retire à la main une étape du parcours d'un contact. */
/** Enregistre un formulaire rempli au téléphone (la dernière version compte). */
export async function enregistrerReponses(campagneId: string, creatifId: string, contactRef: string, reponses: Record<string, string>, parNom: string): Promise<void> {
  const { error } = await sb().from("cmp_reponses").insert({ campagne_id: campagneId, creatif_id: creatifId, contact_ref: contactRef, reponses, rempli_par: parNom || "commercial" })
  if (error) throw new Error(error.message)
}

/** Le formulaire à remplir au téléphone pour un contact : celui du parcours de sa campagne. */
export async function formulaireAppelDe(contactRef: string, baseId: "artisans" | "agences" = "artisans"): Promise<{ campagneId: string; formulaire: Creatif; reponses: Record<string, string> | null } | null> {
  const [{ data: camps }, { data: insc }] = await Promise.all([sb().from("cmp_campagnes").select("*").eq("base_id", baseId), sb().from("cmp_inscriptions").select("campagne_id, entree_le").eq("contact_ref", contactRef).order("entree_le", { ascending: false }).limit(1)])
  const campagnes = ((camps ?? []) as Record<string, unknown>[]).map(versCampagne)
  const c = campagnes.find((x) => x.id === (insc?.[0] as { campagne_id?: string } | undefined)?.campagne_id) ?? campagnes.find((x) => x.origine === (baseId === "artisans" ? "st" : ORIGINE_TRACABILITE))
  if (!c) return null
  const cfg = configDe(c)
  const e = cfg.qualification.etapes.find((x) => x.type === "Formulaire rempli au téléphone" && x.formulaireId)
  const formulaire = cfg.creatifs.find((k) => k.id === e?.formulaireId)
  if (!formulaire) return null
  const { data } = await sb().from("cmp_reponses").select("reponses").eq("campagne_id", c.id).eq("contact_ref", contactRef).eq("creatif_id", formulaire.id).order("cree_le", { ascending: false }).limit(1)
  return { campagneId: c.id, formulaire, reponses: ((data?.[0] as { reponses?: Record<string, string> } | undefined)?.reponses) ?? null }
}

export async function validerEtape(campagneId: string, contactRef: string, etapeId: string, valide: boolean, parNom: string): Promise<void> {
  const q = sb().from("cmp_progression")
  const { error } = valide ? await q.upsert({ campagne_id: campagneId, contact_ref: contactRef, etape_id: etapeId, valide_par: parNom }) : await q.delete().eq("campagne_id", campagneId).eq("contact_ref", contactRef).eq("etape_id", etapeId)
  if (error) throw new Error(error.message)
}

type Brut = { id: string; espace: Espace; contactRef: string; niveau: Niveau; nom: string; signal: string; detail: string; quand: string; proprietaireId: string | null; cible: LeadRecu["cible"]; faits: Faits; contacte: boolean; etat?: LeadRecu["etat"] }

export async function chargerLeadsRecus(maintenant: Date): Promise<{ leads: LeadRecu[]; positions: PositionCampagne[] }> {
  const depuis = new Date(maintenant.getTime() - JOURS_TRAITES * 86_400_000).toISOString()
  const [lignesLeads, agencesSuivies, dossiers, artisans, lignesCampagnes, progression, lignesReponses] = await Promise.all([
    lireParLots<LigneLead>((d, f) => sb().from("leads_demarchage").select("id, agence_id, source, signal, detail, cree_le, dernier_signal_le, statut, resultat, tentatives").or(`statut.eq.a_traiter,cree_le.gte.${depuis}`).order("id").range(d, f) as unknown as Lot<LigneLead>),
    lireParLots<LigneAgence>((d, f) => sb().from("agences").select(COLS_AGENCE).in("etape", ETAPES_INTERESSEES).gte("derniere_activite_le", depuis).order("id").range(d, f) as unknown as Lot<LigneAgence>),
    chargerDossiers(),
    lireParLots<LigneArtisan>((d, f) => sb().from("st_sous_traitants").select(COLS_ARTISAN).or("bareme_vu_le.not.is.null,candidature_clic_le.not.is.null,nb_clics.gt.0,suivi.eq.va_deposer").order("id").range(d, f) as unknown as Lot<LigneArtisan>),
    sb().from("cmp_campagnes").select("*").then(({ data, error }) => { if (error) throw new Error(error.message); return (data ?? []) as Record<string, unknown>[] }),
    // La table arrive avec le SQL de cette étape : absente, personne n'a encore rien validé à la main.
    sb().from("cmp_progression").select("campagne_id, contact_ref, etape_id").then(({ data }) => (data ?? []) as { campagne_id: string; contact_ref: string; etape_id: string }[]),
    // Du plus ancien au plus récent : la dernière réponse à un formulaire remplace les précédentes.
    sb().from("cmp_reponses").select("campagne_id, creatif_id, contact_ref, reponses").order("cree_le").limit(1000).then(({ data }) => (data ?? []) as { campagne_id: string; creatif_id: string; contact_ref: string; reponses: Record<string, string> }[]),
  ])

  const campagnes = lignesCampagnes.map(versCampagne)
  const parId = new Map<string, { c: Campagne; q: Qualification; formulaires: Creatif[] }>(campagnes.map((c) => { const cfg = configDe(c); return [c.id, { c, q: cfg.qualification, formulaires: cfg.creatifs.filter((k) => k.type === "formulaire") }] }))
  // Sans campagne, un contact relève de la campagne qui tourne pour sa base.
  const parDefaut: Record<Espace, Campagne | undefined> = { demarchage: campagnes.find((c) => c.origine === ORIGINE_TRACABILITE), recrutement: campagnes.find((c) => c.origine === "st") }

  // Les agences des leads et les fiches des dossiers qui ne sont pas déjà chargées.
  const agencesParId = new Map(agencesSuivies.map((a) => [a.id, a]))
  const manquantes = [...new Set(lignesLeads.map((l) => l.agence_id).filter((id) => !agencesParId.has(id)))]
  for (let i = 0; i < manquantes.length; i += 200) {
    const { data, error } = await sb().from("agences").select(COLS_AGENCE).in("id", manquantes.slice(i, i + 200))
    if (error) throw new Error(error.message)
    for (const a of (data ?? []) as unknown as LigneAgence[]) agencesParId.set(a.id, a)
  }
  const artisansParId = new Map(artisans.map((a) => [a.id, a]))
  const fichesManquantes = dossiers.map((d) => d.sousTraitantId).filter((id): id is string => Boolean(id) && !artisansParId.has(id as string))
  for (let i = 0; i < fichesManquantes.length; i += 200) {
    const { data, error } = await sb().from("st_sous_traitants").select(COLS_ARTISAN).in("id", fichesManquantes.slice(i, i + 200))
    if (error) throw new Error(error.message)
    for (const s of (data ?? []) as unknown as LigneArtisan[]) artisansParId.set(s.id, s)
  }

  // La campagne de chacun : la dernière où il est entré.
  const leadsParAgence = new Map(lignesLeads.map((l) => [l.agence_id, l]))
  const dossiersParFiche = new Map(dossiers.filter((d) => d.sousTraitantId).map((d) => [d.sousTraitantId as string, d]))
  const refs = [...agencesParId.keys(), ...artisansParId.keys()]
  const inscriptions: { campagneId: string; contactRef: string; entreeLe: string }[] = []
  for (let i = 0; i < refs.length; i += 200) {
    const { data, error } = await sb().from("cmp_inscriptions").select("campagne_id, contact_ref, entree_le").in("contact_ref", refs.slice(i, i + 200))
    if (error) throw new Error(error.message)
    for (const r of data ?? []) inscriptions.push({ campagneId: r.campagne_id as string, contactRef: r.contact_ref as string, entreeLe: r.entree_le as string })
  }
  const parContact = campagneParContact(inscriptions, new Map(campagnes.map((c) => [c.id, c.nom])))

  const positions: PositionCampagne[] = []
  const construire = (b: Brut): LeadRecu | null => {
    const inscrite = parContact.get(b.contactRef)
    const camp = (inscrite && parId.get(inscrite.id)) || (parDefaut[b.espace] ? parId.get(parDefaut[b.espace]!.id) : undefined)
    if (!camp) return null
    const valides = new Set(progression.filter((p) => p.campagne_id === camp.c.id && p.contact_ref === b.contactRef).map((p) => p.etape_id))
    // Les formulaires remplis pour ce contact dans cette campagne : ce sont des faits, et ils donnent la qualité.
    const reponses: Record<string, Record<string, string>> = {}
    for (const r of lignesReponses) if (r.campagne_id === camp.c.id && r.contact_ref === b.contactRef) reponses[r.creatif_id] = r.reponses
    const remplis = camp.formulaires.filter((k) => reponses[k.id])
    const faits: Faits = { ...b.faits, formulaireProspect: b.faits.formulaireProspect || remplis.some((k) => k.remplirPar === "prospect"), formulaireTel: b.faits.formulaireTel || remplis.some((k) => k.remplirPar === "commercial") }
    const pos = positionDans(camp.q, faits, valides, b.contacte)
    positions.push({ campagneId: camp.c.id, atteintes: pos.atteintes, estLead: pos.estLead, etape: pos.etape })
    if (!pos.estLead) return null
    return {
      id: b.id, espace: b.espace, niveau: remplis.some((k) => k.remplirPar === "prospect") ? "fiche" : b.niveau, nom: b.nom, signal: remplis.some((k) => k.remplirPar === "prospect") && b.niveau !== "fiche" ? "A rempli le formulaire" : b.signal, detail: b.detail, quand: b.quand, etape: pos.etape, etat: b.etat, proprietaireId: b.proprietaireId, contactRef: b.contactRef,
      campagne: { id: camp.c.id, nom: camp.c.nom }, cible: b.cible, qualite: niveauDe(camp.q, pos.atteintes, Object.assign({}, ...Object.values(reponses))),
      parcours: { etapes: camp.q.etapes, leadA: camp.q.leadA, gagneA: camp.q.gagneA, atteintes: pos.atteintes, valides: [...valides], courante: pos.courante, formulaires: camp.formulaires, reponses },
    }
  }

  const leads: (LeadRecu | null)[] = [
    ...[...agencesParId.values()].map((a) => {
      const l = leadsParAgence.get(a.id)
      return construire({
        id: `a:${a.id}`, espace: "demarchage", contactRef: a.id, niveau: l ? niveauAgence(l.source) : "interet", nom: a.nom || "Agence",
        signal: l?.signal ?? "Joint au téléphone, intéressé", detail: l?.detail ?? "",
        quand: l?.dernier_signal_le ?? l?.cree_le ?? a.derniere_activite_le ?? "", proprietaireId: a.commercial_id, cible: { type: "agence", id: a.id }, faits: faitsAgence(a, l), contacte: (l?.tentatives ?? 0) > 0,
      })
    }),
    ...dossiers.map((d) => {
      const s = d.sousTraitantId ? artisansParId.get(d.sousTraitantId) : undefined
      const fiche: Pick<SousTraitant, "accesOuvertLe" | "contratStatut"> | undefined = s ? { contratStatut: (s.contrat_statut ?? "") as SousTraitant["contratStatut"], accesOuvertLe: s.acces_ouvert_le } : undefined
      return construire({
        id: `d:${d.id}`, espace: "recrutement", contactRef: d.sousTraitantId ?? d.id, niveau: "fiche", nom: d.raisonSociale || d.email || "Artisan", signal: "A déposé son dossier",
        detail: [d.email, d.sousTraitantId ? "" : "pas encore rattaché à une fiche"].filter(Boolean).join(" · "), quand: d.creeLe, proprietaireId: null, cible: { type: "dossier", id: d.id }, faits: faitsArtisan(s, d), contacte: Boolean(d.vuLe), etat: statutDossier(d, fiche),
      })
    }),
    ...artisans.filter((s) => !dossiersParFiche.has(s.id)).map((s) => construire({
      id: `s:${s.id}`, espace: "recrutement", contactRef: s.id, niveau: "interet", nom: s.entreprise || s.contact || "Artisan", signal: s.suivi === "va_deposer" ? "A promis de déposer son dossier" : "A cliqué",
      detail: [s.metier, s.contact].filter(Boolean).join(" · "), quand: s.dernier_clic_le ?? s.candidature_clic_le ?? s.bareme_vu_le ?? s.cree_le, proprietaireId: null, cible: { type: "artisan", id: s.id }, faits: faitsArtisan(s, undefined), contacte: (s.nb_appels ?? 0) > 0,
    })),
  ]
  return { leads: leads.filter((l): l is LeadRecu => l !== null), positions }
}
