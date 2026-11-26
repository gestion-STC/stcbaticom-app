// ── TOUS LES INDICATEURS D'UNE CAMPAGNE (07/11/2026, Mahdi : « il faut tous les indicateurs, toutes les données,
// sinon ce sera compliqué de suivre et d'avoir de bonnes analyses »). Fonction PURE, testée.
// « Touché » = au moins un envoi parti. Les taux d'engagement se rapportent aux touchés ; le 1er clic d'un
// contact est rattaché à l'envoi qui l'a provoqué (l'événement porte l'envoi) ; les gagnés sont les contacts
// de la campagne passés « gagné » (client, dossier déposé) après leur entrée.
//
// CONFIÉ OU PARTI (25/11/2026) : le moteur note un mail « envoyé » dès qu'Instantly l'a ACCEPTÉ ; il part plus tard, dans la
// plage horaire, ou jamais (forfait non payé, boîte en panne). Pour une campagne qui passe par Instantly, un mail n'est
// « parti » qu'une fois confirmé : « email_sent » d'Instantly (événement « delivre »), ou une ouverture, un clic, une
// réponse, un rebond sur cet envoi. « Touchés » et « Délivrés » se comptent sur ces confirmations ; le reste est
// « en attente chez Instantly ». Le statut en base et la planification du moteur ne changent pas.
import type { Appel, Base, Campagne, Canal, Contact, Envoi, Etape, Evenement, Inscription, Lead } from "./modele"
import { LIBELLE_ETAPE, estEligible } from "./modele"
import { jourDe } from "./moteur"
import { estBaseAvis } from "./avis"
import { avecDejaClients } from "./exclusions"
import { envoiParti, envoisConfirmes, leadsPourAB, mesuresAB } from "./abTest"

/** Ses mails passent par Instantly : ni une campagne d'avis (Resend), ni la machine sous-traitants reprise (Resend). */
export const parInstantly = (c: Pick<Campagne, "baseId" | "origine">) => !estBaseAvis(c.baseId) && c.origine !== "st"
/** Les envois réellement partis : hors Instantly, tout envoi « envoyé » ; chez Instantly, un mail confirmé (ou de test).
 *  La règle elle-même (envoiParti) est partagée avec le moteur, qui l'applique au test A/B. */
export function envoisPartis(c: Pick<Campagne, "baseId" | "origine">, envois: Envoi[], evenements: Evenement[]): Set<string> {
  const confirmes = envoisConfirmes(evenements), instantly = parInstantly(c)
  return new Set(envois.filter((e) => envoiParti(e, instantly, confirmes)).map((e) => e.id))
}
/** Le DERNIER essai de chaque contact à chaque étape (26/11/2026) : un contact sans adresse est « sauté » à chaque passage
 *  du moteur, une erreur est rejouée. Compter les essais donnait « 8 857 sautés » pour 35 contacts, et 1 194 erreurs
 *  dont 219 finalement partis. Erreurs et sautés se comptent désormais par contact, sur son dernier état ; un contact déjà touché ne compte
 *  jamais en erreur ni en sauté à cette étape. */
export function derniersEssais(envois: Envoi[]): Envoi[] {
  const m = new Map<string, Envoi>()
  // Lot 3 (27/11/2026) : un message parti l'emporte sur tout essai suivant. Un SMS parti puis rejeté (« trop rapprochés »)
  // comptait « en erreur » alors que le contact l'avait reçu (29 couples sur la machine sous-traitants).
  for (const e of envois) {
    const k = e.contactId + "|" + e.etapeId, p = m.get(k)
    const parti = e.statut === "envoye", pParti = p?.statut === "envoye"
    if (!p || (parti && !pParti) || (parti === pParti && e.le >= p.le)) m.set(k, e)
  }
  return [...m.values()]
}

/** Ce que comptent « Leads » et « Gagnés » au Suivi et dans la liste (lot 3, 27/11/2026) : la liste affichait
 *  « Lead : Dossier déposé » (l'étape du parcours) à côté de 69 leads qui étaient des clics. */
export function libelleLeadsSuivi(base: Pick<Base, "id" | "gagne">): string {
  const lead = base.id === "artisans" ? "a cliqué la candidature ou le barème" : "signal reçu (clic, plaquette, réponse, formulaire)"
  return `Lead : ${lead}${base.gagne ? ` · Gagné : ${base.gagne.charAt(0).toLowerCase()}${base.gagne.slice(1)}` : ""}`
}

const taux = (n: number, sur: number): number | null => (sur > 0 ? n / sur : null)
const uniques = (evs: Evenement[], type: Evenement["type"]) => new Set(evs.filter((e) => e.type === type).map((e) => e.contactId))
const mediane = (l: number[]) => { if (!l.length) return null; const s = [...l].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

export type LigneEtape = {
  etapeId: string; rang: number; libelle: string; type: Etape["type"]; envoyes: number; erreurs: number; sautes: number
  delivres: number; ouvreurs: number; cliqueurs: number; repondants: number; premiersClics: number; leads: number; gagnes: number
}
export type LigneVariante = { etapeId: string; varianteId: string; nom: string; objet: string; envoyes: number; ouvreurs: number; cliqueurs: number; repondants: number; leads: number; tauxOuverture: number | null; tauxClic: number | null }
export type LigneSegment = { valeur: string; entres: number; touches: number; cliqueurs: number; repondants: number; leads: number; gagnes: number }
export type LigneJour = { jour: string; entres: number; envoyes: number; erreurs: number; ouvreurs: number; cliqueurs: number; leads: number }
/** Un jour de la semaine (0 = lundi), compté par le JOUR OÙ LE MAIL EST PARTI : un mail du lundi ouvert le mardi compte pour le lundi. */
export type LigneJourSemaine = { jour: number; envoyes: number; ouverts: number; cliques: number; leads: number; tauxOuverture: number | null; tauxClic: number | null; tauxLead: number | null }

export type Indicateurs = {
  audience: { eligibles: number; entres: number; enCours: number; terminees: number; sortisLead: number; desinscrits: number; rebonds: number; restants: number }
  /** envoyes : confiés (statut « envoyé » en base) ; partis : confirmés ; enAttente : confiés à Instantly, pas encore partis. */
  envois: { total: number; envoyes: number; partis: number; enAttente: number; erreurs: number; sautes: number; parCanal: Record<Canal, { envoyes: number; erreurs: number; sautes: number }> }
  delivrabilite: { delivres: number; rebonds: number; tauxDelivrance: number | null; tauxErreur: number | null }
  engagement: { touches: number; ouvreurs: number; ouvertures: number; cliqueurs: number; clics: number; repondants: number; desinscriptions: number; tauxOuverture: number | null; tauxClic: number | null; tauxClicSurOuvert: number | null; tauxReponse: number | null; tauxDesinscription: number | null }
  conversion: { leads: number; tauxLead: number | null; delaiMedianLeadJ: number | null; leadsTraites: number; appels: number; joints: number; tauxJoint: number | null; gagnes: number; tauxGagne: number | null }
  couts: { sms: number; coutSms: number; coutParLead: number | null; coutParGagne: number | null }
  parEtape: LigneEtape[]
  parVariante: LigneVariante[]
  parSegment: { champ: string; libelle: string; lignes: LigneSegment[] }[]
  parJour: LigneJour[]
  clicsParJourSemaine: number[]
  /** Quel jour d'envoi marche le mieux (Julien, 16/11/2026 : « voir quel jour on a le meilleur taux d'ouverture et de conversion »). */
  parJourSemaine: LigneJourSemaine[]
  ouverturesParHeure: number[]
  parCommercial: { compteId: string; appels: number; joints: number; issues: Record<string, number> }[]
}

export function indicateurs(c: Campagne, base: Base, contacts: Contact[], inscriptions: Inscription[], envois: Envoi[], evenements: Evenement[], leads: Lead[], appels: Appel[]): Indicateurs {
  const insc = inscriptions.filter((i) => i.campagneId === c.id)
  const inscrits = new Set(insc.map((i) => i.contactId))
  const env = envois.filter((e) => e.campagneId === c.id)
  const evs = evenements.filter((e) => e.campagneId === c.id)
  const lds = leads.filter((l) => l.campagneId === c.id)
  const apl = appels.filter((a) => a.campagneId === c.id || (inscrits.has(a.contactId) && lds.some((l) => l.contactId === a.contactId)))
  const parContact = new Map(contacts.map((k) => [k.id, k]))
  // Gagné POUR CETTE CAMPAGNE (26/11/2026) : devenu client (ou dossier déposé) le jour de son entrée ou après. Avant, un
  // client de longue date entré dans la campagne comptait comme gagné par elle. Sans date connue, on ne peut pas l'affirmer.
  const entree = new Map<string, string>()
  for (const i of insc) { const p = entree.get(i.contactId); if (!p || i.entreeLe < p) entree.set(i.contactId, i.entreeLe) }
  const gagnes = new Set([...inscrits].filter((id) => { const k = parContact.get(id); return k?.statut === "gagne" && Boolean(k.gagneLe) && String(k.gagneLe).slice(0, 10) >= (entree.get(id) ?? "").slice(0, 10) }))
  const partis = envoisPartis(c, env, evs)
  const touches = new Set(env.filter((e) => partis.has(e.id)).map((e) => e.contactId))
  const derniers = derniersEssais(env)
  const confies = new Set(env.filter((e) => e.statut === "envoye").map((e) => e.contactId))
  const ouvreurs = uniques(evs, "ouvert"), cliqueurs = uniques(evs, "clic"), repondants = uniques(evs, "reponse"), desinsc = uniques(evs, "desinscription")
  const nbSms = env.filter((e) => e.canal === "sms" && e.statut === "envoye").length
  // Éligibles = ceux déjà entrés + ceux qui pourraient encore entrer (un lead ou un désinscrit reste compté).
  // Comme le moteur : « Déjà client » retiré des exclusions, les clients comptent (exclusions.ts).
  const pourAudience = avecDejaClients(contacts, (c.config as { garde?: { exclusions?: string[] } } | undefined)?.garde?.exclusions)
  const eligibles = new Set([...inscrits, ...pourAudience.filter((k) => estEligible(k, c)).map((k) => k.id)]).size
  // Les leads d'un test A/B : ceux de la campagne, comme la liste et le Suivi ; même règle au serveur (abTest.ts).
  const leadsAB = leadsPourAB(c.id, leads)

  // Le 1er clic de chaque contact, et l'envoi qui l'a provoqué.
  const premierClic = new Map<string, Evenement>()
  for (const e of [...evs].sort((a, b) => (a.le < b.le ? -1 : 1))) if (e.type === "clic" && !premierClic.has(e.contactId)) premierClic.set(e.contactId, e)

  const parEtape: LigneEtape[] = c.etapes.map((et, rang) => {
    const ee = env.filter((e) => e.etapeId === et.id)
    const ids = new Set(ee.map((e) => e.id))
    const ev = evs.filter((e) => e.envoiId && ids.has(e.envoiId))
    const pc = [...premierClic.values()].filter((e) => e.envoiId && ids.has(e.envoiId)).map((e) => e.contactId)
    const dd = derniers.filter((e) => e.etapeId === et.id)
    return {
      etapeId: et.id, rang, libelle: LIBELLE_ETAPE[et.type], type: et.type,
      // « Partis » : les contacts touchés par cette étape (envoi confirmé parti), comme « Touchés » en haut du Suivi.
      envoyes: new Set(ee.filter((e) => partis.has(e.id)).map((e) => e.contactId)).size, erreurs: dd.filter((e) => e.statut === "erreur").length, sautes: dd.filter((e) => e.statut === "saute").length,
      delivres: uniques(ev, "delivre").size, ouvreurs: uniques(ev, "ouvert").size, cliqueurs: uniques(ev, "clic").size, repondants: uniques(ev, "reponse").size,
      premiersClics: pc.length, leads: pc.filter((id) => lds.some((l) => l.contactId === id)).length, gagnes: pc.filter((id) => gagnes.has(id)).length,
    }
  })

  const parVariante: LigneVariante[] = []
  for (const et of c.etapes) {
    if (!("variantes" in et) || et.variantes.length < 2) continue
    // Les mêmes chiffres que le moteur, qui décide de la bascule : envois PARTIS, hors tests (abTest.ts, mesuresAB).
    for (const m of mesuresAB(et.variantes, env.filter((e) => e.etapeId === et.id), evs, leadsAB, parInstantly(c))) {
      parVariante.push({ etapeId: et.id, varianteId: m.varianteId, nom: m.nom, objet: et.variantes.find((v) => v.id === m.varianteId)?.objet ?? "", envoyes: m.envoyes, ouvreurs: m.ouvreurs, cliqueurs: m.cliqueurs, repondants: m.repondants, leads: m.leads, tauxOuverture: taux(m.ouvreurs, m.envoyes), tauxClic: taux(m.cliqueurs, m.envoyes) })
    }
  }

  const parSegment = [...base.champs, ...(contacts.some((k) => k.champs.fichier) ? [{ cle: "fichier", libelle: "Fichier" }] : [])].map((ch) => {
    const lignes = new Map<string, LigneSegment>()
    for (const id of inscrits) {
      const val = parContact.get(id)?.champs[ch.cle] || "—"
      for (const v of val.split(" / ")) {
        const l = lignes.get(v) ?? { valeur: v, entres: 0, touches: 0, cliqueurs: 0, repondants: 0, leads: 0, gagnes: 0 }
        l.entres += 1
        if (touches.has(id)) l.touches += 1
        if (cliqueurs.has(id)) l.cliqueurs += 1
        if (repondants.has(id)) l.repondants += 1
        if (lds.some((x) => x.contactId === id)) l.leads += 1
        if (gagnes.has(id)) l.gagnes += 1
        lignes.set(v, l)
      }
    }
    return { champ: ch.cle, libelle: ch.libelle, lignes: [...lignes.values()].sort((a, b) => b.entres - a.entres) }
  })

  const jours = new Map<string, LigneJour>()
  // Le jour à Paris (25/11/2026) : avant, le jour universel ; un envoi de 0 h 30 l'hiver tombait la veille.
  const j = (iso: string) => { const k = jourDe(iso); let l = jours.get(k); if (!l) { l = { jour: k, entres: 0, envoyes: 0, erreurs: 0, ouvreurs: 0, cliqueurs: 0, leads: 0 }; jours.set(k, l) } return l }
  for (const i of insc) j(i.entreeLe).entres += 1
  for (const e of env) if (partis.has(e.id)) j(e.le).envoyes += 1
  for (const e of derniers) if (e.statut === "erreur") j(e.le).erreurs += 1
  for (const [type, cle] of [["ouvert", "ouvreurs"], ["clic", "cliqueurs"]] as const) {
    const vus = new Set<string>()
    for (const e of evs) if (e.type === type) { const k = jourDe(e.le) + e.contactId; if (!vus.has(k)) { vus.add(k); j(e.le)[cle] += 1 } }
  }
  for (const l of lds) j(l.creeLe).leads += 1

  const clicsParJourSemaine = [0, 0, 0, 0, 0, 0, 0], ouverturesParHeure = new Array(24).fill(0)
  for (const e of premierClic.values()) clicsParJourSemaine[(new Date(e.le).getDay() + 6) % 7] += 1
  for (const e of evs) if (e.type === "ouvert") ouverturesParHeure[new Date(e.le).getHours()] += 1

  const parJourSemaine = joursDEnvoi(env.filter((e) => partis.has(e.id)), evs, lds)
  const delais = lds.map((l) => { const i = insc.find((x) => x.contactId === l.contactId); return i ? (new Date(l.creeLe).getTime() - new Date(i.entreeLe).getTime()) / 86_400_000 : null }).filter((x): x is number => x !== null)
  const commerciaux = new Map<string, { compteId: string; appels: number; joints: number; issues: Record<string, number> }>()
  for (const a of apl) {
    const l = commerciaux.get(a.compteId) ?? { compteId: a.compteId, appels: 0, joints: 0, issues: {} }
    l.appels += 1
    if (a.resultat === "joint") { l.joints += 1; if (a.issue) l.issues[a.issue] = (l.issues[a.issue] ?? 0) + 1 }
    commerciaux.set(a.compteId, l)
  }
  const parCanal = { mail: { envoyes: 0, erreurs: 0, sautes: 0 }, sms: { envoyes: 0, erreurs: 0, sautes: 0 }, linkedin: { envoyes: 0, erreurs: 0, sautes: 0 }, newsletter: { envoyes: 0, erreurs: 0, sautes: 0 } }
  for (const e of env) if (e.statut === "envoye") parCanal[e.canal].envoyes += 1
  for (const e of derniers) if (e.statut !== "envoye") parCanal[e.canal][e.statut === "erreur" ? "erreurs" : "sautes"] += 1
  const envoyes = env.filter((e) => e.statut === "envoye").length, erreurs = derniers.filter((e) => e.statut === "erreur").length
  const delivres = uniques(evs, "delivre").size, rebonds = uniques(evs, "rebond").size
  const coutSms = Math.round(nbSms * c.coutSms * 100) / 100
  const joints = apl.filter((a) => a.resultat === "joint").length

  return {
    audience: {
      eligibles, entres: insc.length, enCours: insc.filter((i) => i.statut === "en_cours").length, terminees: insc.filter((i) => i.statut === "terminee").length,
      sortisLead: insc.filter((i) => i.statut === "lead").length, desinscrits: desinsc.size, rebonds, restants: Math.max(0, eligibles - insc.length),
    },
    envois: { total: env.length, envoyes, partis: partis.size, enAttente: envoyes - partis.size, erreurs, sautes: derniers.filter((e) => e.statut === "saute").length, parCanal },
    // Délivrés : rapportés aux contacts à qui un envoi a été confié (avant : aux touchés, eux-mêmes comptés sur le confié).
    delivrabilite: { delivres, rebonds, tauxDelivrance: taux(delivres, confies.size), tauxErreur: taux(erreurs, envoyes + erreurs) },
    engagement: {
      touches: touches.size, ouvreurs: ouvreurs.size, ouvertures: evs.filter((e) => e.type === "ouvert").length, cliqueurs: cliqueurs.size, clics: evs.filter((e) => e.type === "clic").length,
      repondants: repondants.size, desinscriptions: desinsc.size, tauxOuverture: taux(ouvreurs.size, touches.size), tauxClic: taux(cliqueurs.size, touches.size),
      tauxClicSurOuvert: taux(cliqueurs.size, ouvreurs.size), tauxReponse: taux(repondants.size, touches.size), tauxDesinscription: taux(desinsc.size, touches.size),
    },
    conversion: {
      leads: lds.length, tauxLead: taux(lds.length, touches.size), delaiMedianLeadJ: mediane(delais), leadsTraites: lds.filter((l) => l.statut === "traite").length,
      appels: apl.length, joints, tauxJoint: taux(joints, apl.length), gagnes: gagnes.size, tauxGagne: taux(gagnes.size, touches.size),
    },
    couts: { sms: nbSms, coutSms, coutParLead: lds.length ? Math.round((coutSms / lds.length) * 100) / 100 : null, coutParGagne: gagnes.size ? Math.round((coutSms / gagnes.size) * 100) / 100 : null },
    parEtape, parVariante, parSegment,
    parJour: [...jours.values()].sort((a, b) => (a.jour < b.jour ? -1 : 1)),
    clicsParJourSemaine, parJourSemaine, ouverturesParHeure, parCommercial: [...commerciaux.values()],
  }
}

const jourSemaine = (iso: string) => (new Date(iso).getDay() + 6) % 7

/** Par jour d'envoi : les mails partis, ceux ouverts ou cliqués au moins une fois, et les leads. Un lead revient au
 *  jour du dernier mail parti vers ce contact avant lui (le mail qui l'a décidé). Fonction PURE. */
export function joursDEnvoi(env: Envoi[], evs: Evenement[], lds: Lead[]): LigneJourSemaine[] {
  const partis = env.filter((e) => e.statut === "envoye" && e.canal === "mail")
  const parId = new Map(partis.map((e) => [e.id, e]))
  const lignes = [0, 1, 2, 3, 4, 5, 6].map((jour) => ({ jour, envoyes: 0, ouverts: 0, cliques: 0, leads: 0 }))
  for (const e of partis) lignes[jourSemaine(e.le)].envoyes += 1
  for (const [type, cle] of [["ouvert", "ouverts"], ["clic", "cliques"]] as const) {
    const vus = new Set<string>()
    for (const ev of evs) {
      const e = ev.type === type && ev.envoiId ? parId.get(ev.envoiId) : undefined
      if (!e || vus.has(e.id)) continue
      vus.add(e.id); lignes[jourSemaine(e.le)][cle] += 1
    }
  }
  for (const l of lds) {
    const avant = partis.filter((e) => e.contactId === l.contactId && e.le <= l.creeLe).sort((a, b) => (a.le < b.le ? 1 : -1))[0]
    if (avant) lignes[jourSemaine(avant.le)].leads += 1
  }
  return lignes.map((l) => ({ ...l, tauxOuverture: taux(l.ouverts, l.envoyes), tauxClic: taux(l.cliques, l.envoyes), tauxLead: taux(l.leads, l.envoyes) }))
}

// ── L'ANALYSE : des constats tirés des chiffres, chacun avec sa preuve et une action. En production, l'IA lit
// ces mêmes indicateurs (et le texte des messages) et écrit ses propres constats ; ces règles restent le filet.
export type Constat = { ton: "ok" | "attention" | "alerte"; titre: string; preuve: string; action: string }
const p = (t: number | null) => (t == null ? "—" : `${Math.round(t * 1000) / 10} %`.replace(".", ","))
const JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]

export function constats(ind: Indicateurs): Constat[] {
  const out: Constat[] = []
  const envoyeuses = ind.parEtape.filter((e) => e.envoyes > 0)
  const totalPc = envoyeuses.reduce((s, e) => s + e.premiersClics, 0)
  if (ind.engagement.touches === 0 && ind.envois.enAttente > 0) return [{ ton: "attention", titre: "Confiés à Instantly, rien n'est encore parti.", preuve: `${ind.envois.enAttente} mail${ind.envois.enAttente > 1 ? "s" : ""} accepté${ind.envois.enAttente > 1 ? "s" : ""} par Instantly, aucun confirmé parti. Ils partent dans la plage horaire, sauf si Instantly bloque (forfait, boîtes).`, action: "Voir le rythme" }]
  if (ind.engagement.touches === 0) return [{ ton: "attention", titre: "Rien n'est encore parti.", preuve: `${ind.audience.entres} contacts entrés, aucun envoi : la campagne attend sa plage horaire ou son lancement.`, action: "Voir le rythme" }]
  const meilleure = [...envoyeuses].sort((a, b) => b.premiersClics - a.premiersClics)[0]
  if (meilleure && totalPc >= 5 && meilleure.premiersClics / totalPc >= 0.5) out.push({ ton: "ok", titre: `L'étape ${meilleure.rang + 1} (${meilleure.libelle}) fait l'essentiel.`, preuve: `${meilleure.premiersClics} des ${totalPc} premiers clics, ${meilleure.leads} leads.`, action: "La garder telle quelle" })
  for (const e of envoyeuses) {
    if (e.envoyes >= 20 && e.premiersClics === 0) out.push({ ton: "alerte", titre: `L'étape ${e.rang + 1} (${e.libelle}) ne fait rien.`, preuve: `${e.envoyes} envois, aucun premier clic.`, action: "Tester une autre version" })
    if (e.erreurs + e.envoyes >= 10 && e.erreurs / (e.erreurs + e.envoyes) > 0.2) out.push({ ton: "alerte", titre: `L'étape ${e.rang + 1} part mal.`, preuve: `${e.erreurs} contact${e.erreurs > 1 ? "s" : ""} encore en erreur à leur dernier essai, pour ${e.envoyes} touché${e.envoyes > 1 ? "s" : ""}.`, action: "Voir les erreurs" })
    if (e.sautes > 0 && e.sautes >= e.envoyes) out.push({ ton: "attention", titre: `L'étape ${e.rang + 1} (${e.libelle}) est surtout sautée.`, preuve: `${e.sautes} contact${e.sautes > 1 ? "s" : ""} sans ${e.type === "sms" ? "mobile" : "mail"} pour ${e.envoyes} touché${e.envoyes > 1 ? "s" : ""}.`, action: "Ajouter un « Si… » avant" })
  }
  for (const v of groupes(ind.parVariante)) {
    const [a, b] = v.sort((x, y) => (y.tauxClic ?? 0) - (x.tauxClic ?? 0))
    if (a && b && a.envoyes >= 15 && b.envoyes >= 15 && (a.tauxClic ?? 0) > (b.tauxClic ?? 0) * 1.3) out.push({ ton: "ok", titre: `« ${a.nom} » bat « ${b.nom} ».`, preuve: `${p(a.tauxClic)} de clic contre ${p(b.tauxClic)} (${a.envoyes} et ${b.envoyes} envois).`, action: `Garder « ${a.nom} »` })
  }
  for (const s of ind.parSegment) {
    const l = s.lignes.filter((x) => x.touches >= 10 && x.valeur !== "—")
    if (l.length < 2) continue
    const tri = [...l].sort((x, y) => y.cliqueurs / y.touches - x.cliqueurs / x.touches)
    const haut = tri[0], bas = tri[tri.length - 1]
    if (haut.cliqueurs / haut.touches > (bas.cliqueurs / bas.touches) * 1.5) out.push({ ton: "attention", titre: `${s.libelle} : « ${haut.valeur} » répond le mieux, « ${bas.valeur} » le moins.`, preuve: `${p(haut.cliqueurs / haut.touches)} de cliqueurs contre ${p(bas.cliqueurs / bas.touches)}.`, action: `Revoir le message « ${bas.valeur} »` })
  }
  const jmax = ind.clicsParJourSemaine.indexOf(Math.max(...ind.clicsParJourSemaine))
  if (ind.clicsParJourSemaine[jmax] >= 5) out.push({ ton: "ok", titre: `Les contacts cliquent surtout le ${JOURS[jmax]}.`, preuve: `${ind.clicsParJourSemaine[jmax]} premiers clics le ${JOURS[jmax]} sur ${ind.clicsParJourSemaine.reduce((s, n) => s + n, 0)}.`, action: `Envoyer le ${JOURS[jmax]} matin` })
  const enAttente = ind.conversion.leads - ind.conversion.leadsTraites
  if (enAttente > 0) out.push({ ton: enAttente >= 5 ? "alerte" : "attention", titre: `${enAttente} lead${enAttente > 1 ? "s" : ""} attend${enAttente > 1 ? "ent" : ""} un appel.`, preuve: `${ind.conversion.leads} leads, ${ind.conversion.leadsTraites} traité${ind.conversion.leadsTraites > 1 ? "s" : ""} ; ${ind.conversion.appels} appel${ind.conversion.appels > 1 ? "s" : ""} passé${ind.conversion.appels > 1 ? "s" : ""}.`, action: "Ouvrir la session de call" })
  if ((ind.engagement.tauxDesinscription ?? 0) > 0.02) out.push({ ton: "alerte", titre: "Trop de désinscriptions.", preuve: `${ind.engagement.desinscriptions} désinscrits sur ${ind.engagement.touches} touchés (${p(ind.engagement.tauxDesinscription)}).`, action: "Espacer les relances" })
  return out
}
function groupes(v: LigneVariante[]): LigneVariante[][] {
  const m = new Map<string, LigneVariante[]>()
  for (const x of v) m.set(x.etapeId, [...(m.get(x.etapeId) ?? []), x])
  return [...m.values()]
}

/** La meilleure version d'un test : au moins 20 envois par version, puis les réponses, puis les clics. */
export function meilleureVariante(lignes: Pick<LigneVariante, "varianteId" | "envoyes" | "repondants" | "cliqueurs">[]): string | null {
  if (lignes.length < 2 || lignes.some((l) => l.envoyes < 20)) return null
  const note = (l: (typeof lignes)[number]) => (l.repondants / l.envoyes) * 1000 + l.cliqueurs / l.envoyes
  const triees = [...lignes].sort((a, b) => note(b) - note(a))
  return note(triees[0]) > note(triees[1]) ? triees[0].varianteId : null
}
