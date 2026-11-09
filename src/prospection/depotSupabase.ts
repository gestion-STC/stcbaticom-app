// ── LE DÉPÔT DE PRODUCTION : les écrans des campagnes branchés sur la base (07/11/2026, lot 1) ──
// Lit les tables cmp_* et la vue cmp_contacts (agences et artisans tels qu'ils existent), plus ce que les
// mécanismes actuels savent déjà : les leads (leads_demarchage ; clic d'artisan), les appels (activites,
// st_appels). Écrit seulement les campagnes : le reste, c'est le moteur serveur qui l'écrit.
// Lot 2 (session unique, cloison par équipe) : les autres actions du dépôt.
import { supabase } from "../lib/supabase"
import { lireParLots } from "../lib/pagination"
import type { Depot, EtatProspection } from "./depot"
import type { Appel, Base, Campagne, Compte, Contact, Envoi, Evenement, Inscription, Lead, Tache } from "./modele"

export const BASES: Base[] = [
  {
    id: "agences", nom: "Agences immobilières", unite: "agences", equipeId: "dev",
    champs: [{ cle: "secteur", libelle: "Secteur" }, { cle: "etape", libelle: "Étape" }, { cle: "enseigne", libelle: "Enseigne" }],
    issues: [{ code: "interesse", libelle: "Intéressé" }, { code: "rdv", libelle: "RDV" }, { code: "a_rappeler", libelle: "À rappeler le…" }, { code: "pas_interesse", libelle: "Pas intéressé" }],
    gagne: "Devenue cliente (1er ordre de service)", prospection: true, liens: [{ cle: "principal", libelle: "Créer un compte" }, { cle: "plaquette", libelle: "Plaquette" }, { cle: "site", libelle: "Site" }],
  },
  {
    id: "artisans", nom: "Artisans sous-traitants", unite: "artisans", equipeId: "rec",
    champs: [{ cle: "metier", libelle: "Corps de métier" }, { cle: "zone", libelle: "Zone" }, { cle: "statut", libelle: "Statut" }],
    issues: [{ code: "va_deposer", libelle: "Va déposer son dossier" }, { code: "a_rappeler", libelle: "À rappeler le…" }, { code: "pas_interesse", libelle: "Pas intéressé" }, { code: "hors_cible", libelle: "Hors cible" }],
    gagne: "Dossier déposé", prospection: false, liens: [{ cle: "principal", libelle: "Candidature" }, { cle: "bareme", libelle: "Barème" }],
  },
]

type L = Record<string, unknown>
type Lot<T> = { data: T[] | null; error: { message: string } | null }
const sb = () => { if (!supabase) throw new Error("Supabase n'est pas configuré"); return supabase }
const tout = <T,>(table: string, cols: string) => lireParLots<T>((d, f) => sb().from(table).select(cols).order("id").range(d, f) as unknown as PromiseLike<Lot<T>>)

export const versCampagne = (l: L): Campagne => ({
  id: String(l.id), nom: String(l.nom), baseId: String(l.base_id), objectif: String(l.objectif ?? ""), statut: l.statut as Campagne["statut"],
  audience: l.audience as Campagne["audience"], rythme: l.rythme as Campagne["rythme"], etapes: (l.etapes ?? []) as Campagne["etapes"], signaux: (l.signaux ?? []) as Campagne["signaux"],
  creeParId: String(l.cree_par ?? ""), creeLe: String(l.cree_le), lanceeLe: (l.lancee_le as string) ?? null, coutSms: Number(l.cout_sms ?? 0),
  modeTest: Boolean(l.mode_test), testEmail: String(l.test_email ?? ""), testMobile: String(l.test_mobile ?? ""), origine: String(l.origine ?? ""), config: (l.config as Record<string, unknown>) ?? undefined,
})
const versLigne = (c: Campagne) => ({
  id: c.id, nom: c.nom, base_id: c.baseId, objectif: c.objectif, statut: c.statut, audience: c.audience, rythme: c.rythme, etapes: c.etapes, signaux: c.signaux,
  cout_sms: c.coutSms, mode_test: c.modeTest ?? true, test_email: c.testEmail ?? "", test_mobile: c.testMobile ?? "", lancee_le: c.lanceeLe, maj_le: new Date().toISOString(), ...(c.config ? { config: c.config } : {}),
})

export function creerDepotSupabase(compte: Compte, onErreur: (m: string) => void): Depot & { charger: () => Promise<void> } {
  let etat: EtatProspection = {
    maintenant: new Date().toISOString(), comptes: [compte], equipes: [{ id: "dev", nom: "Développement", comptes: [compte.id] }, { id: "rec", nom: "Recrutement", comptes: [compte.id] }],
    bases: BASES, contacts: [], campagnes: [], inscriptions: [], envois: [], evenements: [], leads: [], taches: [], appels: [], messages: [],
  }
  const ecouteurs = new Set<() => void>()
  const publier = (s: EtatProspection) => { etat = s; ecouteurs.forEach((f) => f()) }

  async function charger() {
    const [campagnes, inscriptions, envois, evenements, taches, contacts] = await Promise.all([
      tout<L>("cmp_campagnes", "*"), tout<L>("cmp_inscriptions", "*"), tout<L>("cmp_envois", "id, campagne_id, inscription_id, contact_ref, etape_id, variante_id, canal, le, statut, cause"),
      tout<L>("cmp_evenements", "*"), tout<L>("cmp_taches", "*"), tout<L>("cmp_contacts", "id, base_id, nom, personne, email, mobile, telephone, champs, statut, desinscrit, proprietaire_id"),
    ])
    const camps = campagnes.map(versCampagne)
    const insc: Inscription[] = inscriptions.map((l) => ({ id: String(l.id), campagneId: String(l.campagne_id), contactId: String(l.contact_ref), entreeLe: String(l.entree_le), etapeIndex: Number(l.etape_index), prochaineLe: String(l.prochaine_le), statut: l.statut as Inscription["statut"], sortieLe: (l.sortie_le as string) ?? null }))
    const evs: Evenement[] = evenements.map((l) => ({ id: String(l.id), campagneId: String(l.campagne_id), envoiId: (l.envoi_id as string) ?? null, contactId: String(l.contact_ref), type: l.type as Evenement["type"], le: String(l.le), lien: (l.lien as string) ?? undefined }))
    const cts: Contact[] = contacts.map((l) => ({ id: String(l.id), baseId: String(l.base_id), nom: String(l.nom ?? ""), personne: String(l.personne ?? ""), email: String(l.email ?? ""), mobile: String(l.mobile ?? ""), telephone: String(l.telephone ?? ""), champs: (l.champs ?? {}) as Record<string, string>, statut: l.statut as Contact["statut"], desinscrit: Boolean(l.desinscrit), proprietaireId: (l.proprietaire_id as string) ?? null }))
    const parContact = new Map<string, Inscription>()
    for (const i of [...insc].sort((a, b) => (a.entreeLe < b.entreeLe ? -1 : 1))) parContact.set(i.contactId, i)
    const inscrits = new Set(insc.map((i) => i.contactId))

    // Les leads : agences (leads_demarchage) et artisans (le clic, vu par la vue), rattachés à la campagne du contact.
    const depuis = camps.reduce((m, c) => (c.creeLe < m ? c.creeLe : m), new Date().toISOString())
    const leadsAg = await lireParLots<L>((d, f) => sb().from("leads_demarchage").select("id, agence_id, signal, statut, cree_le").gte("cree_le", depuis).order("id").range(d, f) as unknown as PromiseLike<Lot<L>>)
    const leads: Lead[] = leadsAg.filter((l) => inscrits.has(String(l.agence_id))).map((l) => {
      const i = parContact.get(String(l.agence_id))!
      return { id: String(l.id), contactId: String(l.agence_id), baseId: "agences", campagneId: String(l.cree_le) >= i.entreeLe ? i.campagneId : null, signal: String(l.signal ?? ""), creeLe: String(l.cree_le), statut: l.statut === "a_traiter" ? "a_traiter" : "traite", proprietaireId: null }
    })
    for (const k of cts.filter((x) => x.baseId === "artisans" && (x.statut === "lead" || x.statut === "gagne") && inscrits.has(x.id))) {
      const clic = evs.filter((e) => e.contactId === k.id && e.type === "clic").sort((a, b) => (a.le < b.le ? -1 : 1))[0]
      if (clic) leads.push({ id: "st-" + k.id, contactId: k.id, baseId: "artisans", campagneId: clic.campagneId, signal: clic.lien === "bareme" ? "A ouvert le barème" : "A cliqué la candidature", creeLe: clic.le, statut: k.statut === "lead" ? "a_traiter" : "traite", proprietaireId: null })
    }

    // Les appels passés aux contacts des campagnes, depuis leur entrée.
    const appelsAg = await lireParLots<L>((d, f) => sb().from("activites").select("id, agence_id, compte_id, date, resultat, issue").eq("type", "appel").gte("date", depuis).neq("resultat", "lance").order("id").range(d, f) as unknown as PromiseLike<Lot<L>>)
    const appelsSt = await lireParLots<L>((d, f) => sb().from("st_appels").select("id, sous_traitant_id, compte_nom, cree_le, resultat, issue").gte("cree_le", depuis).order("id").range(d, f) as unknown as PromiseLike<Lot<L>>).catch(() => [] as L[])
    const appels: Appel[] = [
      ...appelsAg.filter((a) => { const i = parContact.get(String(a.agence_id)); return i && String(a.date) >= i.entreeLe }).map((a) => ({ id: String(a.id), contactId: String(a.agence_id), compteId: String(a.compte_id ?? ""), le: String(a.date), resultat: a.resultat as Appel["resultat"], issue: String(a.issue ?? ""), campagneId: parContact.get(String(a.agence_id))!.campagneId })),
      ...appelsSt.filter((a) => { const i = parContact.get(String(a.sous_traitant_id)); return i && String(a.cree_le) >= i.entreeLe }).map((a) => ({ id: String(a.id), contactId: String(a.sous_traitant_id), compteId: String(a.compte_nom ?? ""), le: String(a.cree_le), resultat: a.resultat as Appel["resultat"], issue: String(a.issue ?? ""), campagneId: parContact.get(String(a.sous_traitant_id))!.campagneId })),
    ]
    publier({
      ...etat, maintenant: new Date().toISOString(), campagnes: camps, inscriptions: insc, contacts: cts, evenements: evs, leads, appels,
      envois: envois.map((l): Envoi => ({ id: String(l.id), campagneId: String(l.campagne_id), inscriptionId: String(l.inscription_id), contactId: String(l.contact_ref), etapeId: String(l.etape_id), varianteId: (l.variante_id as string) ?? null, canal: l.canal as Envoi["canal"], le: String(l.le), statut: l.statut as Envoi["statut"], cause: String(l.cause ?? "") })),
      taches: taches.map((l): Tache => ({ id: String(l.id), contactId: String(l.contact_ref), campagneId: String(l.campagne_id), etapeId: String(l.etape_id), type: l.type as Tache["type"], consigne: String(l.consigne ?? ""), creeLe: String(l.cree_le), faiteLe: (l.faite_le as string) ?? null })),
    })
  }
  const ecrire = async (c: Campagne) => {
    const { error } = await sb().from("cmp_campagnes").upsert(versLigne(c))
    if (error) { onErreur(`La campagne n'a pas été enregistrée : ${error.message}`); await charger(); return }
    await charger()
  }
  const lot2 = () => { throw new Error("Disponible au lot 2 (session unique, cloison par équipe).") }
  return {
    charger,
    lire: () => etat,
    ecouter: (f) => { ecouteurs.add(f); return () => ecouteurs.delete(f) },
    enregistrerCampagne: (c) => { publier({ ...etat, campagnes: etat.campagnes.some((x) => x.id === c.id) ? etat.campagnes.map((x) => (x.id === c.id ? c : x)) : [...etat.campagnes, c] }); void ecrire({ ...c, creeParId: c.creeParId || compte.id }) },
    changerStatut: (id, statut) => { const c = etat.campagnes.find((x) => x.id === id); if (c) { const s = { ...c, statut, lanceeLe: c.lanceeLe ?? (statut === "active" ? new Date().toISOString() : null) }; publier({ ...etat, campagnes: etat.campagnes.map((x) => (x.id === id ? s : x)) }); void ecrire(s) } },
    dupliquerCampagne: (id) => { const c = etat.campagnes.find((x) => x.id === id)!; const nid = crypto.randomUUID(); const copie: Campagne = { ...c, id: nid, nom: c.nom + " (copie)", statut: "brouillon", lanceeLe: null, creeLe: new Date().toISOString(), origine: "", modeTest: true }; publier({ ...etat, campagnes: [...etat.campagnes, copie] }); void ecrire(copie); return nid },
    noterAppel: lot2, traiterLead: lot2, faireTache: lot2, marquerGagne: lot2, repondre: lot2, lireMessage: lot2, attribuer: lot2, majEquipe: lot2, majBase: lot2, importer: lot2,
  }
}
