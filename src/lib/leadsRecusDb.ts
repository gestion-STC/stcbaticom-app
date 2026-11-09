// La lecture des LEADS REÇUS (voir leadsRecus.ts) : les leads des agences (leads_demarchage), les dossiers
// déposés des artisans (dossiers_st) et les artisans qui ont cliqué sans être encore appelés (la file
// « Leads » de leur session), plus la campagne de chacun (cmp_inscriptions).
import { supabase } from "./supabase"
import { lireParLots } from "./pagination"
import { chargerDossiers } from "./machineDb"
import { chargerFileST } from "./appelsStDb"
import { signaux } from "./appelsStOutils"
import { statutDossier } from "./dossierStatut"
import type { SousTraitant } from "../recrutement"
import { campagneParContact, niveauAgence, type LeadRecu } from "./leadsRecus"

function sb() {
  if (!supabase) throw new Error("Supabase n'est pas configuré.")
  return supabase
}

const JOURS_TRAITES = 60 // les leads déjà traités : les deux derniers mois

type LigneLead = {
  id: string; agence_id: string; source: string; signal: string; detail: string | null; cree_le: string; dernier_signal_le: string | null
  statut: string; resultat: string | null; agences: { nom: string; commercial_id: string | null } | null
}

export type CampagneCourte = { id: string; nom: string; baseId: string }

export async function chargerLeadsRecus(maintenant: Date): Promise<{ leads: LeadRecu[]; campagnes: CampagneCourte[] }> {
  const depuis = new Date(maintenant.getTime() - JOURS_TRAITES * 86_400_000).toISOString()
  const [agences, dossiers, artisans, campagnes] = await Promise.all([
    lireParLots<LigneLead>((d, f) => sb().from("leads_demarchage").select("id, agence_id, source, signal, detail, cree_le, dernier_signal_le, statut, resultat, agences(nom, commercial_id)")
      .or(`statut.eq.a_traiter,cree_le.gte.${depuis}`).order("cree_le", { ascending: false }).order("id").range(d, f) as unknown as PromiseLike<{ data: LigneLead[] | null; error: { message: string } | null }>),
    chargerDossiers(),
    chargerFileST("leads", maintenant),
    sb().from("cmp_campagnes").select("id, nom, base_id").order("cree_le", { ascending: false }).then(({ data, error }) => {
      if (error) throw new Error(error.message)
      return (data ?? []).map((c) => ({ id: c.id as string, nom: c.nom as string, baseId: c.base_id as string }))
    }),
  ])

  // Où en est chaque dossier : il dépend aussi des contrats, portés par la fiche de l'artisan.
  const idsFiches = [...new Set(dossiers.map((d) => d.sousTraitantId).filter(Boolean))] as string[]
  const fiches = new Map<string, Pick<SousTraitant, "accesOuvertLe" | "contratStatut">>()
  for (let i = 0; i < idsFiches.length; i += 200) {
    const { data, error } = await sb().from("st_sous_traitants").select("id, contrat_statut, acces_ouvert_le").in("id", idsFiches.slice(i, i + 200))
    if (error) throw new Error(error.message)
    for (const r of data ?? []) fiches.set(r.id as string, { contratStatut: r.contrat_statut as SousTraitant["contratStatut"], accesOuvertLe: r.acces_ouvert_le as string | null })
  }

  const leads: LeadRecu[] = [
    ...agences.map((l): LeadRecu => ({
      id: `a:${l.id}`, espace: "demarchage", niveau: niveauAgence(l.source), nom: l.agences?.nom || "Agence", signal: l.signal, detail: l.detail ?? "",
      quand: l.dernier_signal_le ?? l.cree_le, aTraiter: l.statut === "a_traiter", proprietaireId: l.agences?.commercial_id ?? null,
      contactRef: l.agence_id, campagne: null, cible: { type: "agence", id: l.agence_id },
    })),
    ...dossiers.map((d): LeadRecu => ({
      id: `d:${d.id}`, espace: "recrutement", niveau: "fiche", nom: d.raisonSociale || d.email || "Artisan", signal: "A déposé son dossier",
      detail: [d.email, d.sousTraitantId ? "" : "pas encore rattaché à une fiche"].filter(Boolean).join(" · "),
      quand: d.creeLe, aTraiter: !d.traiteLe, etat: statutDossier(d, d.sousTraitantId ? fiches.get(d.sousTraitantId) : undefined), proprietaireId: null, contactRef: d.sousTraitantId ?? d.id, campagne: null, cible: { type: "dossier", id: d.id },
    })),
    ...artisans.map((st): LeadRecu => ({
      id: `s:${st.id}`, espace: "recrutement", niveau: "interet", nom: st.entreprise || st.contact || "Artisan", signal: signaux(st)[0] ?? "A cliqué",
      detail: [st.metier, st.contact].filter(Boolean).join(" · "), quand: st.dernierClicLe ?? st.candidatureClicLe ?? st.baremeVuLe ?? st.creeLe ?? "",
      aTraiter: true, proprietaireId: null, contactRef: st.id!, campagne: null, cible: { type: "artisan", id: st.id! },
    })),
  ]

  // La campagne de chacun : la dernière où il est entré.
  const refs = [...new Set(leads.map((l) => l.contactRef))]
  const inscriptions: { campagneId: string; contactRef: string; entreeLe: string }[] = []
  for (let i = 0; i < refs.length; i += 200) {
    const { data, error } = await sb().from("cmp_inscriptions").select("campagne_id, contact_ref, entree_le").in("contact_ref", refs.slice(i, i + 200))
    if (error) throw new Error(error.message)
    for (const r of data ?? []) inscriptions.push({ campagneId: r.campagne_id as string, contactRef: r.contact_ref as string, entreeLe: r.entree_le as string })
  }
  const parContact = campagneParContact(inscriptions, new Map(campagnes.map((c) => [c.id, c.nom])))
  return { leads: leads.map((l) => ({ ...l, campagne: parContact.get(l.contactRef) ?? null })), campagnes }
}
