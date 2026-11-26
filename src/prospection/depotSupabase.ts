// ── LE DÉPÔT DE PRODUCTION : les écrans des campagnes branchés sur la base (07/11/2026, lot 1) ──
// Lit les tables cmp_* et la vue cmp_contacts (agences et artisans tels qu'ils existent), plus ce que les
// mécanismes actuels savent déjà : les leads (leads_demarchage ; clic d'artisan), les appels (activites,
// st_appels). Écrit seulement les campagnes : le reste, c'est le moteur serveur qui l'écrit.
// Lot 2 (session unique, cloison par équipe) : les autres actions du dépôt.
import { supabase } from "../lib/supabase"
import { lireParLots } from "../lib/pagination"
import type { Depot, EtatProspection, ResultatEnregistrement } from "./depot"
import type { Appel, Base, Campagne, Compte, Contact, Envoi, Evenement, Inscription, Lead, Tache } from "./modele"
import { inscriptionAu, inscriptionsParContact } from "./rattachement"
import { estLeadRobot } from "./abTest"
import { recalerEtapeIndex } from "./configCampagne"

export const BASES: Base[] = [
  {
    id: "agences", nom: "Gestionnaires", unite: "agences", equipeId: "dev",
    champs: [{ cle: "secteur", libelle: "Secteur" }, { cle: "etape", libelle: "Étape" }, { cle: "joint", libelle: "Déjà joint au téléphone" }, { cle: "commercial", libelle: "Commercial" }],
    issues: [{ code: "interesse", libelle: "Intéressé" }, { code: "rdv", libelle: "RDV" }, { code: "a_rappeler", libelle: "À rappeler le…" }, { code: "pas_interesse", libelle: "Pas intéressé" }],
    gagne: "Devenue cliente (1er ordre de service)", prospection: true, liens: [{ cle: "principal", libelle: "Créer un compte" }, { cle: "plaquette", libelle: "Plaquette" }, { cle: "site", libelle: "Site" }],
  },
  {
    id: "apporteurs", nom: "Apporteurs d'affaires", unite: "apporteurs", equipeId: "dev",
    champs: [{ cle: "secteur", libelle: "Secteur" }, { cle: "etape", libelle: "Étape" }, { cle: "joint", libelle: "Déjà joint au téléphone" }, { cle: "commercial", libelle: "Commercial" }],
    issues: [{ code: "interesse", libelle: "Intéressé" }, { code: "rdv", libelle: "RDV" }, { code: "a_rappeler", libelle: "À rappeler le…" }, { code: "pas_interesse", libelle: "Pas intéressé" }],
    gagne: "Devenue cliente (1er ordre de service)", prospection: true, liens: [{ cle: "principal", libelle: "Créer un compte" }, { cle: "plaquette", libelle: "Plaquette" }, { cle: "site", libelle: "Site" }],
  },
  {
    id: "artisans", nom: "Artisans sous-traitants", unite: "artisans", equipeId: "rec",
    champs: [{ cle: "metier", libelle: "Corps de métier" }, { cle: "zone", libelle: "Zone" }, { cle: "statut", libelle: "Statut" }, { cle: "joint", libelle: "Déjà joint au téléphone" }],
    issues: [{ code: "va_deposer", libelle: "Va déposer son dossier" }, { code: "a_rappeler", libelle: "À rappeler le…" }, { code: "pas_interesse", libelle: "Pas intéressé" }, { code: "hors_cible", libelle: "Hors cible" }],
    gagne: "Dossier déposé", prospection: false, liens: [{ cle: "principal", libelle: "Candidature" }, { cle: "bareme", libelle: "Barème" }],
  },
  { id: "locataires", nom: "Avis · Locataires", unite: "locataires", equipeId: "dev", champs: [], issues: [], gagne: "", prospection: false, liens: [] },
  { id: "clients_gestionnaires", nom: "Avis · Gestionnaires clients", unite: "gestionnaires", equipeId: "dev", champs: [], issues: [], gagne: "", prospection: false, liens: [] },
  { id: "sous_traitants_actifs", nom: "Avis · Sous-traitants actuels", unite: "sous-traitants", equipeId: "dev", champs: [], issues: [], gagne: "", prospection: false, liens: [] },
]

type L = Record<string, unknown>
type Lot<T> = { data: T[] | null; error: { message: string } | null }
const sb = () => { if (!supabase) throw new Error("Supabase n'est pas configuré"); return supabase }
const tout = <T,>(table: string, cols: string) => lireParLots<T>((d, f) => sb().from(table).select(cols).order("id").range(d, f) as unknown as PromiseLike<Lot<T>>)

export const versCampagne = (l: L): Campagne => ({
  id: String(l.id), nom: String(l.nom), baseId: String(l.base_id), objectif: String(l.objectif ?? ""), statut: l.statut as Campagne["statut"],
  audience: l.audience as Campagne["audience"], rythme: l.rythme as Campagne["rythme"], etapes: (l.etapes ?? []) as Campagne["etapes"], signaux: (l.signaux ?? []) as Campagne["signaux"],
  creeParId: String(l.cree_par ?? ""), creeLe: String(l.cree_le), lanceeLe: (l.lancee_le as string) ?? null, coutSms: Number(l.cout_sms ?? 0),
  modeTest: Boolean(l.mode_test), testEmail: String(l.test_email ?? ""), testMobile: String(l.test_mobile ?? ""), origine: String(l.origine ?? ""), config: (l.config as Record<string, unknown>) ?? undefined, majLe: l.maj_le ? String(l.maj_le) : undefined,
})
const versLigne = (c: Campagne) => ({
  id: c.id, nom: c.nom, base_id: c.baseId, objectif: c.objectif, statut: c.statut, audience: c.audience, rythme: c.rythme, etapes: c.etapes, signaux: c.signaux,
  // mode_test n'est plus écrit (25/11/2026) : l'écran le forçait à « non » à chaque enregistrement, et défaisait un mode
  // test posé en base. Une nouvelle campagne prend la valeur par défaut de la table.
  cout_sms: c.coutSms, test_email: c.testEmail ?? "", test_mobile: c.testMobile ?? "", lancee_le: c.lanceeLe, maj_le: new Date().toISOString(), ...(c.config ? { config: c.config } : {}),
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
      tout<L>("cmp_campagnes", "*"), tout<L>("cmp_inscriptions", "*"), tout<L>("cmp_envois", "id, campagne_id, inscription_id, contact_ref, etape_id, variante_id, canal, le, statut, cause, test"),
      tout<L>("cmp_evenements", "*"), tout<L>("cmp_taches", "*"), tout<L>("cmp_contacts", "id, base_id, nom, personne, email, mobile, telephone, champs, statut, desinscrit, proprietaire_id"),
    ])
    const camps = campagnes.map(versCampagne)
    const insc: Inscription[] = inscriptions.map((l) => ({ id: String(l.id), campagneId: String(l.campagne_id), contactId: String(l.contact_ref), entreeLe: String(l.entree_le), etapeIndex: Number(l.etape_index), prochaineLe: String(l.prochaine_le), statut: l.statut as Inscription["statut"], sortieLe: (l.sortie_le as string) ?? null }))
    const tousEvs: Evenement[] = evenements.map((l) => ({ id: String(l.id), campagneId: String(l.campagne_id), envoiId: (l.envoi_id as string) ?? null, contactId: String(l.contact_ref), type: l.type as Evenement["type"], le: String(l.le), lien: (l.lien as string) ?? undefined, robot: Boolean(l.robot) }))
    // Les clics de robots de sécurité (25/11/2026) ne comptent nulle part : ni taux, ni lead ; ils restent visibles à part.
    const evs = tousEvs.filter((e) => !e.robot), robots = tousEvs.filter((e) => e.robot)
    // Le jour où chaque contact est devenu « gagné » (26/11/2026) : un gagné ne compte pour une campagne que s'il l'est
    // devenu après y être entré. Agence : 1er ordre de service, sinon passage en « Client » ; artisan : dossier déposé.
    const [agGagnees, stDeposes] = await Promise.all([
      lireParLots<L>((d, f) => sb().from("agences").select("id, premier_os_le, etape, etape_depuis").or("etape.eq.client,premier_os_le.not.is.null").order("id").range(d, f) as unknown as PromiseLike<Lot<L>>),
      lireParLots<L>((d, f) => sb().from("st_sous_traitants").select("id, depose_le, statut_le").eq("statut", "depose").order("id").range(d, f) as unknown as PromiseLike<Lot<L>>),
    ])
    const gagneLe = new Map<string, string | null>([
      ...agGagnees.map((a): [string, string | null] => [String(a.id), (a.premier_os_le as string) ?? (a.etape === "client" ? (a.etape_depuis as string) ?? null : null)]),
      ...stDeposes.map((a): [string, string | null] => [String(a.id), (a.depose_le as string) ?? (a.statut_le as string) ?? null]),
    ])
    const cts: Contact[] = contacts.map((l) => ({ id: String(l.id), baseId: String(l.base_id), nom: String(l.nom ?? ""), personne: String(l.personne ?? ""), email: String(l.email ?? ""), mobile: String(l.mobile ?? ""), telephone: String(l.telephone ?? ""), champs: (l.champs ?? {}) as Record<string, string>, statut: l.statut as Contact["statut"], gagneLe: gagneLe.get(String(l.id)) ?? null, desinscrit: Boolean(l.desinscrit), proprietaireId: (l.proprietaire_id as string) ?? null }))
    // Chaque lead et chaque appel va à l'inscription en cours à sa date (rattachement.ts), pas à la dernière du contact.
    const parContact = inscriptionsParContact(insc)
    const inscrits = new Set(insc.map((i) => i.contactId))

    // Les leads : agences (leads_demarchage) et artisans (le clic, vu par la vue), rattachés à la campagne du contact.
    const depuis = camps.reduce((m, c) => (c.creeLe < m ? c.creeLe : m), new Date().toISOString())
    // Les faux leads des robots de sécurité (fermés « robot ») ne comptent nulle part (26/11/2026 : « histoires » affichait
    // 8 leads pour 1 vrai).
    const leadsAg = (await lireParLots<L>((d, f) => sb().from("leads_demarchage").select("id, agence_id, signal, statut, resultat, cree_le").gte("cree_le", depuis).order("id").range(d, f) as unknown as PromiseLike<Lot<L>>)).filter((l) => !estLeadRobot({ resultat: l.resultat as string | null }))
    const leads: Lead[] = leadsAg.filter((l) => inscrits.has(String(l.agence_id))).map((l) => {
      const i = inscriptionAu(parContact, String(l.agence_id), String(l.cree_le))
      return { id: String(l.id), contactId: String(l.agence_id), baseId: "agences", campagneId: i?.campagneId ?? null, signal: String(l.signal ?? ""), creeLe: String(l.cree_le), statut: l.statut === "a_traiter" ? "a_traiter" : "traite", proprietaireId: null }
    })
    for (const k of cts.filter((x) => x.baseId === "artisans" && (x.statut === "lead" || x.statut === "gagne") && inscrits.has(x.id))) {
      const clic = evs.filter((e) => e.contactId === k.id && e.type === "clic").sort((a, b) => (a.le < b.le ? -1 : 1))[0]
      if (clic) leads.push({ id: "st-" + k.id, contactId: k.id, baseId: "artisans", campagneId: clic.campagneId, signal: clic.lien === "bareme" ? "A ouvert le barème" : "A cliqué la candidature", creeLe: clic.le, statut: k.statut === "lead" ? "a_traiter" : "traite", proprietaireId: null })
    }

    // Les appels passés aux contacts des campagnes, depuis leur entrée.
    const appelsAg = await lireParLots<L>((d, f) => sb().from("activites").select("id, agence_id, compte_id, date, resultat, issue").eq("type", "appel").gte("date", depuis).neq("resultat", "lance").order("id").range(d, f) as unknown as PromiseLike<Lot<L>>)
    const appelsSt = await lireParLots<L>((d, f) => sb().from("st_appels").select("id, sous_traitant_id, compte_nom, date, resultat, issue").gte("date", depuis).order("id").range(d, f) as unknown as PromiseLike<Lot<L>>).catch(() => [] as L[])
    const appels: Appel[] = [
      ...appelsAg.flatMap((a) => { const i = inscriptionAu(parContact, String(a.agence_id), String(a.date)); return i ? [{ id: String(a.id), contactId: String(a.agence_id), compteId: String(a.compte_id ?? ""), le: String(a.date), resultat: a.resultat as Appel["resultat"], issue: String(a.issue ?? ""), campagneId: i.campagneId }] : [] }),
      ...appelsSt.flatMap((a) => { const i = inscriptionAu(parContact, String(a.sous_traitant_id), String(a.date)); return i ? [{ id: String(a.id), contactId: String(a.sous_traitant_id), compteId: String(a.compte_nom ?? ""), le: String(a.date), resultat: a.resultat as Appel["resultat"], issue: String(a.issue ?? ""), campagneId: i.campagneId }] : [] }),
    ]
    publier({
      ...etat, maintenant: new Date().toISOString(), campagnes: camps, inscriptions: insc, contacts: cts, evenements: evs, robots, leads, appels,
      envois: envois.map((l): Envoi => ({ id: String(l.id), campagneId: String(l.campagne_id), inscriptionId: String(l.inscription_id), contactId: String(l.contact_ref), etapeId: String(l.etape_id), varianteId: (l.variante_id as string) ?? null, canal: l.canal as Envoi["canal"], le: String(l.le), statut: l.statut as Envoi["statut"], cause: String(l.cause ?? ""), test: Boolean(l.test) })),
      taches: taches.map((l): Tache => ({ id: String(l.id), contactId: String(l.contact_ref), campagneId: String(l.campagne_id), etapeId: String(l.etape_id), type: l.type as Tache["type"], consigne: String(l.consigne ?? ""), creeLe: String(l.cree_le), faiteLe: (l.faite_le as string) ?? null })),
    })
  }
  // Un enregistrement depuis l'écran ne doit jamais écraser une version plus récente (17/11/2026 : un lancement avait remis
  // le mode test et effacé des exclusions posées entre-temps). Campagne déjà en base : on n'écrit que si elle n'a pas
  // bougé depuis le chargement (même maj_le) ; sinon on recharge et on prévient.
  // Lot 5 (26/11/2026) : le résultat remonte à l'éditeur. Avant, un refus rechargeait la page et la saisie était perdue ;
  // désormais l'éditeur reste ouvert avec ce qu'on a tapé, et propose d'écraser la version d'ailleurs.
  const ecrire = async (c: Campagne, forcer = false): Promise<ResultatEnregistrement> => {
    const ligne = versLigne(c)
    const { data, error } = c.majLe && !forcer
      ? await sb().from("cmp_campagnes").update(ligne).eq("id", c.id).eq("maj_le", c.majLe).select("id")
      : c.majLe
        ? await sb().from("cmp_campagnes").update(ligne).eq("id", c.id).select("id")
        : await sb().from("cmp_campagnes").upsert(ligne).select("id")
    if (error) { onErreur(`La campagne n'a pas été enregistrée : ${error.message}`); await charger(); return "erreur" }
    if (c.majLe && !(data ?? []).length) {
      await charger()
      if (forcer) { onErreur("La campagne n'a pas été enregistrée : la base a refusé l'écriture."); return "erreur" }
      return "conflit"
    }
    await charger()
    return "ok"
  }
  // Lancer, mettre en pause, reprendre : seulement le statut (et la date de lancement), jamais le reste de la campagne.
  const ecrireStatut = async (c: Campagne) => {
    const { error } = await sb().from("cmp_campagnes").update({ statut: c.statut, lancee_le: c.lanceeLe, maj_le: new Date().toISOString() }).eq("id", c.id)
    if (error) onErreur(`Le statut n'a pas été changé : ${error.message}`)
    await charger()
  }
  const lot2 = () => { throw new Error("Disponible au lot 2 (session unique, cloison par équipe).") }
  return {
    charger,
    lire: () => etat,
    ecouter: (f) => { ecouteurs.add(f); return () => ecouteurs.delete(f) },
    // Étapes ajoutées, supprimées ou déplacées sur une campagne qui a des inscrits (lot 3, 27/11/2026) : la base recale
    // chaque inscription sur son étape (déclencheur cmp_recaler_inscriptions) ; l'écran fait de même en attendant le rechargement.
    enregistrerCampagne: (c, options) => {
      const avant = etat.campagnes.find((x) => x.id === c.id)
      const inscriptions = avant && JSON.stringify(avant.etapes.map((e) => e.id)) !== JSON.stringify(c.etapes.map((e) => e.id))
        ? etat.inscriptions.map((i) => (i.campagneId === c.id ? { ...i, etapeIndex: recalerEtapeIndex(avant.etapes, c.etapes, i.etapeIndex) } : i))
        : etat.inscriptions
      publier({ ...etat, inscriptions, campagnes: avant ? etat.campagnes.map((x) => (x.id === c.id ? c : x)) : [...etat.campagnes, c] })
      return ecrire({ ...c, creeParId: c.creeParId || compte.id }, Boolean(options?.forcer))
    },
    changerStatut: (id, statut) => { const c = etat.campagnes.find((x) => x.id === id); if (c) { const s = { ...c, statut, lanceeLe: c.lanceeLe ?? (statut === "active" ? new Date().toISOString() : null) }; publier({ ...etat, campagnes: etat.campagnes.map((x) => (x.id === id ? s : x)) }); void ecrireStatut(s) } },
    dupliquerCampagne: (id) => { const c = etat.campagnes.find((x) => x.id === id)!; const nid = crypto.randomUUID(); const copie: Campagne = { ...c, id: nid, nom: c.nom + " (copie)", statut: "brouillon", lanceeLe: null, creeLe: new Date().toISOString(), origine: "", modeTest: false, majLe: undefined }; publier({ ...etat, campagnes: [...etat.campagnes, copie] }); void ecrire(copie); return nid },
    noterAppel: lot2, traiterLead: lot2, faireTache: lot2, marquerGagne: lot2, repondre: lot2, lireMessage: lot2, attribuer: lot2, majEquipe: lot2, majBase: lot2, importer: lot2,
  }
}
