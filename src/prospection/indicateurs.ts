// ── TOUS LES INDICATEURS D'UNE CAMPAGNE (07/11/2026, Mahdi : « il faut tous les indicateurs, toutes les données,
// sinon ce sera compliqué de suivre et d'avoir de bonnes analyses »). Fonction PURE, testée.
// « Touché » = au moins un envoi parti. Les taux d'engagement se rapportent aux touchés ; le 1er clic d'un
// contact est rattaché à l'envoi qui l'a provoqué (l'événement porte l'envoi) ; les gagnés sont les contacts
// de la campagne passés « gagné » (client, dossier déposé) après leur entrée.
import type { Appel, Base, Campagne, Canal, Contact, Envoi, Etape, Evenement, Inscription, Lead } from "./modele"
import { LIBELLE_ETAPE, estEligible } from "./modele"

const taux = (n: number, sur: number): number | null => (sur > 0 ? n / sur : null)
const uniques = (evs: Evenement[], type: Evenement["type"]) => new Set(evs.filter((e) => e.type === type).map((e) => e.contactId))
const mediane = (l: number[]) => { if (!l.length) return null; const s = [...l].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

export type LigneEtape = {
  etapeId: string; rang: number; libelle: string; type: Etape["type"]; envoyes: number; erreurs: number; sautes: number
  delivres: number; ouvreurs: number; cliqueurs: number; repondants: number; premiersClics: number; leads: number; gagnes: number
}
export type LigneVariante = { etapeId: string; varianteId: string; nom: string; objet: string; envoyes: number; ouvreurs: number; cliqueurs: number; repondants: number; tauxOuverture: number | null; tauxClic: number | null }
export type LigneSegment = { valeur: string; entres: number; touches: number; cliqueurs: number; repondants: number; leads: number; gagnes: number }
export type LigneJour = { jour: string; entres: number; envoyes: number; erreurs: number; ouvreurs: number; cliqueurs: number; leads: number }

export type Indicateurs = {
  audience: { eligibles: number; entres: number; enCours: number; terminees: number; sortisLead: number; desinscrits: number; rebonds: number; restants: number }
  envois: { total: number; envoyes: number; erreurs: number; sautes: number; parCanal: Record<Canal, { envoyes: number; erreurs: number; sautes: number }> }
  delivrabilite: { delivres: number; rebonds: number; tauxDelivrance: number | null; tauxErreur: number | null }
  engagement: { touches: number; ouvreurs: number; ouvertures: number; cliqueurs: number; clics: number; repondants: number; desinscriptions: number; tauxOuverture: number | null; tauxClic: number | null; tauxClicSurOuvert: number | null; tauxReponse: number | null; tauxDesinscription: number | null }
  conversion: { leads: number; tauxLead: number | null; delaiMedianLeadJ: number | null; leadsTraites: number; appels: number; joints: number; tauxJoint: number | null; gagnes: number; tauxGagne: number | null }
  couts: { sms: number; coutSms: number; coutParLead: number | null; coutParGagne: number | null }
  parEtape: LigneEtape[]
  parVariante: LigneVariante[]
  parSegment: { champ: string; libelle: string; lignes: LigneSegment[] }[]
  parJour: LigneJour[]
  clicsParJourSemaine: number[]
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
  const gagnes = new Set([...inscrits].filter((id) => parContact.get(id)?.statut === "gagne"))
  const touches = new Set(env.filter((e) => e.statut === "envoye").map((e) => e.contactId))
  const ouvreurs = uniques(evs, "ouvert"), cliqueurs = uniques(evs, "clic"), repondants = uniques(evs, "reponse"), desinsc = uniques(evs, "desinscription")
  const nbSms = env.filter((e) => e.canal === "sms" && e.statut === "envoye").length
  // Éligibles = ceux déjà entrés + ceux qui pourraient encore entrer (un lead ou un désinscrit reste compté).
  const eligibles = new Set([...inscrits, ...contacts.filter((k) => estEligible(k, c)).map((k) => k.id)]).size

  // Le 1er clic de chaque contact, et l'envoi qui l'a provoqué.
  const premierClic = new Map<string, Evenement>()
  for (const e of [...evs].sort((a, b) => (a.le < b.le ? -1 : 1))) if (e.type === "clic" && !premierClic.has(e.contactId)) premierClic.set(e.contactId, e)

  const parEtape: LigneEtape[] = c.etapes.map((et, rang) => {
    const ee = env.filter((e) => e.etapeId === et.id)
    const ids = new Set(ee.map((e) => e.id))
    const ev = evs.filter((e) => e.envoiId && ids.has(e.envoiId))
    const pc = [...premierClic.values()].filter((e) => e.envoiId && ids.has(e.envoiId)).map((e) => e.contactId)
    return {
      etapeId: et.id, rang, libelle: LIBELLE_ETAPE[et.type], type: et.type,
      envoyes: ee.filter((e) => e.statut === "envoye").length, erreurs: ee.filter((e) => e.statut === "erreur").length, sautes: ee.filter((e) => e.statut === "saute").length,
      delivres: uniques(ev, "delivre").size, ouvreurs: uniques(ev, "ouvert").size, cliqueurs: uniques(ev, "clic").size, repondants: uniques(ev, "reponse").size,
      premiersClics: pc.length, leads: pc.filter((id) => lds.some((l) => l.contactId === id)).length, gagnes: pc.filter((id) => gagnes.has(id)).length,
    }
  })

  const parVariante: LigneVariante[] = []
  for (const et of c.etapes) {
    if (!("variantes" in et) || et.variantes.length < 2) continue
    for (const v of et.variantes) {
      const ee = env.filter((e) => e.etapeId === et.id && e.varianteId === v.id && e.statut === "envoye")
      const ids = new Set(ee.map((e) => e.id))
      const ev = evs.filter((e) => e.envoiId && ids.has(e.envoiId))
      const o = uniques(ev, "ouvert").size, k = uniques(ev, "clic").size
      parVariante.push({ etapeId: et.id, varianteId: v.id, nom: v.nom, objet: v.objet, envoyes: ee.length, ouvreurs: o, cliqueurs: k, repondants: uniques(ev, "reponse").size, tauxOuverture: taux(o, ee.length), tauxClic: taux(k, ee.length) })
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
  const j = (iso: string) => { const k = iso.slice(0, 10); let l = jours.get(k); if (!l) { l = { jour: k, entres: 0, envoyes: 0, erreurs: 0, ouvreurs: 0, cliqueurs: 0, leads: 0 }; jours.set(k, l) } return l }
  for (const i of insc) j(i.entreeLe).entres += 1
  for (const e of env) { if (e.statut === "envoye") j(e.le).envoyes += 1; if (e.statut === "erreur") j(e.le).erreurs += 1 }
  for (const [type, cle] of [["ouvert", "ouvreurs"], ["clic", "cliqueurs"]] as const) {
    const vus = new Set<string>()
    for (const e of evs) if (e.type === type) { const k = e.le.slice(0, 10) + e.contactId; if (!vus.has(k)) { vus.add(k); j(e.le)[cle] += 1 } }
  }
  for (const l of lds) j(l.creeLe).leads += 1

  const clicsParJourSemaine = [0, 0, 0, 0, 0, 0, 0], ouverturesParHeure = new Array(24).fill(0)
  for (const e of premierClic.values()) clicsParJourSemaine[(new Date(e.le).getDay() + 6) % 7] += 1
  for (const e of evs) if (e.type === "ouvert") ouverturesParHeure[new Date(e.le).getHours()] += 1

  const delais = lds.map((l) => { const i = insc.find((x) => x.contactId === l.contactId); return i ? (new Date(l.creeLe).getTime() - new Date(i.entreeLe).getTime()) / 86_400_000 : null }).filter((x): x is number => x !== null)
  const commerciaux = new Map<string, { compteId: string; appels: number; joints: number; issues: Record<string, number> }>()
  for (const a of apl) {
    const l = commerciaux.get(a.compteId) ?? { compteId: a.compteId, appels: 0, joints: 0, issues: {} }
    l.appels += 1
    if (a.resultat === "joint") { l.joints += 1; if (a.issue) l.issues[a.issue] = (l.issues[a.issue] ?? 0) + 1 }
    commerciaux.set(a.compteId, l)
  }
  const parCanal = { mail: { envoyes: 0, erreurs: 0, sautes: 0 }, sms: { envoyes: 0, erreurs: 0, sautes: 0 }, linkedin: { envoyes: 0, erreurs: 0, sautes: 0 }, newsletter: { envoyes: 0, erreurs: 0, sautes: 0 } }
  for (const e of env) parCanal[e.canal][e.statut === "envoye" ? "envoyes" : e.statut === "erreur" ? "erreurs" : "sautes"] += 1
  const envoyes = env.filter((e) => e.statut === "envoye").length, erreurs = env.filter((e) => e.statut === "erreur").length
  const delivres = uniques(evs, "delivre").size, rebonds = uniques(evs, "rebond").size
  const coutSms = Math.round(nbSms * c.coutSms * 100) / 100
  const joints = apl.filter((a) => a.resultat === "joint").length

  return {
    audience: {
      eligibles, entres: insc.length, enCours: insc.filter((i) => i.statut === "en_cours").length, terminees: insc.filter((i) => i.statut === "terminee").length,
      sortisLead: insc.filter((i) => i.statut === "lead").length, desinscrits: desinsc.size, rebonds, restants: Math.max(0, eligibles - insc.length),
    },
    envois: { total: env.length, envoyes, erreurs, sautes: env.filter((e) => e.statut === "saute").length, parCanal },
    delivrabilite: { delivres, rebonds, tauxDelivrance: taux(delivres, touches.size), tauxErreur: taux(erreurs, envoyes + erreurs) },
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
    clicsParJourSemaine, ouverturesParHeure, parCommercial: [...commerciaux.values()],
  }
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
  if (ind.engagement.touches === 0) return [{ ton: "attention", titre: "Rien n'est encore parti.", preuve: `${ind.audience.entres} contacts entrés, aucun envoi : la campagne attend sa plage horaire ou son lancement.`, action: "Voir le rythme" }]
  const meilleure = [...envoyeuses].sort((a, b) => b.premiersClics - a.premiersClics)[0]
  if (meilleure && totalPc >= 5 && meilleure.premiersClics / totalPc >= 0.5) out.push({ ton: "ok", titre: `L'étape ${meilleure.rang + 1} (${meilleure.libelle}) fait l'essentiel.`, preuve: `${meilleure.premiersClics} des ${totalPc} premiers clics, ${meilleure.leads} leads.`, action: "La garder telle quelle" })
  for (const e of envoyeuses) {
    if (e.envoyes >= 20 && e.premiersClics === 0) out.push({ ton: "alerte", titre: `L'étape ${e.rang + 1} (${e.libelle}) ne fait rien.`, preuve: `${e.envoyes} envois, aucun premier clic.`, action: "Tester une autre version" })
    if (e.erreurs + e.envoyes >= 10 && e.erreurs / (e.erreurs + e.envoyes) > 0.2) out.push({ ton: "alerte", titre: `L'étape ${e.rang + 1} part mal.`, preuve: `${e.erreurs} envois en erreur pour ${e.envoyes} partis.`, action: "Voir les erreurs" })
    if (e.sautes > 0 && e.sautes >= e.envoyes) out.push({ ton: "attention", titre: `L'étape ${e.rang + 1} (${e.libelle}) est surtout sautée.`, preuve: `${e.sautes} contacts sans ${e.type === "sms" ? "mobile" : "mail"} pour ${e.envoyes} envois.`, action: "Ajouter un « Si… » avant" })
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
