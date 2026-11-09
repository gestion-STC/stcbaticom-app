// LA QUALIFICATION D'UN SOUS-TRAITANT (Mahdi, 09/11/2026) : hors de la campagne et hors de la création du lead.
// Le formulaire interne, rempli par STC au téléphone, tel qu'il existait dans Google Forms. Fichier PUR.

export type TypeQuestionST = "oui_non" | "texte" | "long" | "nombre" | "date" | "tel" | "choix" | "cases" | "echelle"
export type QuestionST = { id: string; libelle: string; type: TypeQuestionST; requis?: boolean; options?: string[]; autre?: boolean; si?: { id: string; valeurs: string[] } }
export type SectionST = { id: string; titre: string; aide?: string; questions: QuestionST[] }
export type ReponsesST = Record<string, string | string[]>
export type DecisionST = "Accepté" | "En attente" | "Refusé"

const q = (id: string, libelle: string, type: TypeQuestionST, requis = false, suite: Partial<QuestionST> = {}): QuestionST => ({ id, libelle, type, requis, ...suite })
const choix = (id: string, libelle: string, options: string[], requis = false, suite: Partial<QuestionST> = {}) => q(id, libelle, "choix", requis, { options, ...suite })
const cases = (id: string, libelle: string, options: string[], requis = false, suite: Partial<QuestionST> = {}) => q(id, libelle, "cases", requis, { options, ...suite })

export const METIERS_ST = ["Plomberie", "Chauffage", "Électricité", "TCE", "Peinture", "Plâtrerie / Placo", "Carrelage / Faïence", "Sols souples / Parquet", "Menuiserie intérieure", "Menuiserie extérieure", "Maçonnerie", "Serrurerie", "VMC / Ventilation", "Climatisation"]
export const DECISIONS_ST: DecisionST[] = ["Accepté", "En attente", "Refusé"]
const OUI_REGULIER = ["Oui, ponctuellement", "Oui, régulièrement"]

export const SECTIONS_ST: SectionST[] = [
  { id: "eliminatoires", titre: "Critères éliminatoires", aide: "À vérifier avant tout. Un seul « Non » = refus.", questions: [
    q("decennale", "Décennale valide et couvrant ses métiers", "oui_non", true),
    q("kbis", "Kbis de moins de 3 mois", "oui_non", true),
    q("smartphone", "Smartphone et à l'aise avec une application", "oui_non", true),
    q("francais", "Lit et écrit le français suffisamment (OM, messagerie)", "oui_non", true),
  ] },
  { id: "entreprise", titre: "Entreprise", questions: [
    q("raison_sociale", "Raison sociale", "texte", true),
    q("gerant", "Nom du gérant", "texte", true),
    q("telephone", "Téléphone", "tel"),
    q("siren", "SIREN", "texte", true),
    q("creation", "Date de création de l'entreprise", "date", true),
    choix("statut", "Statut juridique", ["Micro-entreprise / auto-entrepreneur", "EI", "EURL / SARL", "SASU / SAS"], true, { autre: true }),
    q("siege", "Adresse du siège (Kbis)", "texte", true),
    choix("domiciliation", "Le siège est-il une domiciliation ?", ["Non, adresse réelle", "Oui, domiciliation"], true),
    q("ville_reelle", "Si domiciliation : ville où il est réellement basé", "texte", false, { si: { id: "domiciliation", valeurs: ["Oui, domiciliation"] } }),
    choix("ca", "Chiffre d'affaires annuel approximatif", ["< 50 k€", "50 – 150 k€", "150 – 500 k€", "> 500 k€", "Ne sait pas / ne dit pas"]),
  ] },
  { id: "equipe", titre: "Équipe", questions: [
    q("salaries", "Nombre de salariés déclarés", "nombre"),
    q("terrain", "Nombre de personnes réellement sur le terrain", "nombre", true),
    q("equipes", "Nombre d'équipes pouvant tourner en même temps", "nombre", true),
    choix("sous_traite", "Sous-traite-t-il lui-même ?", ["Non", ...OUI_REGULIER], true),
    q("sous_traite_detail", "Si oui : à qui et sur quels lots ?", "long", false, { si: { id: "sous_traite", valeurs: OUI_REGULIER } }),
    choix("gerant_surtout", "Le gérant est surtout…", ["Sur les chantiers", "Au bureau", "Les deux"], true),
    choix("francais_equipe", "Niveau de français de l'équipe terrain", ["Bon", "Moyen", "Faible"], true),
  ] },
  { id: "metiers", titre: "Métiers", questions: [
    q("metier", "Métier principal", "texte", true),
    cases("metiers_secondaires", "Métiers secondaires", METIERS_ST),
    cases("qualifications", "Qualifications / habilitations", ["Qualibat", "RGE", "Habilitation électrique", "Attestation / PGN gaz", "Aucune"], false, { autre: true }),
    q("ne_fait_pas", "Ce qu'il ne fait PAS (à ne jamais lui envoyer)", "long"),
  ] },
  { id: "zone", titre: "Zone et capacité", questions: [
    cases("departements", "Départements où il travaille déjà", ["75 Paris", "77 Seine-et-Marne", "78 Yvelines", "91 Essonne", "92 Hauts-de-Seine", "93 Seine-Saint-Denis", "94 Val-de-Marne", "95 Val-d'Oise"], true),
    choix("secteur", "Secteur STC proposé (choisi par STC)", ["B1 Ouest", "B2 Nord-Est", "B3 Centre / Sud-Est", "B4 Sud-Ouest"], true),
    q("interventions_semaine", "Capacité : interventions par semaine", "nombre", true),
    q("chantiers_parallele", "Capacité : chantiers en parallèle", "nombre", true),
    choix("delai", "Délai d'intervention habituel", ["Sous 48 h", "Sous 1 semaine", "Sous 2 semaines", "Plus de 2 semaines"], true),
    cases("disponible", "Disponible en…", ["Urgence", "Samedi", "Aucun des deux"]),
  ] },
  { id: "moyens", titre: "Moyens et méthode", questions: [
    choix("vehicule", "Véhicule et outillage", ["Complet", "Partiel", "Non"], true),
    choix("materiel", "Achat du matériel", ["Avance les frais sans problème", "Préfère que STC commande", "Ne peut pas avancer"], true),
    choix("locatif", "Habitué au locatif occupé (locataire + agence)", ["Oui, régulièrement", "Un peu", "Non"], true),
    choix("photos_rapports", "Photos et rapports de chantier sur smartphone", ["À l'aise", "À accompagner", "Difficile"], true),
    q("tarifs", "Tarifs / taux de référence annoncés", "long"),
    choix("litiges", "Litiges ou chantiers abandonnés dans le passé", ["Non", "Oui"], true),
    q("litiges_detail", "Si oui : lesquels et pourquoi ?", "long", false, { si: { id: "litiges", valeurs: ["Oui"] } }),
  ] },
  { id: "references", titre: "Références", questions: [
    cases("clients", "Types de clients habituels", ["Agences / gestion locative", "Syndics", "Entreprises générales", "Particuliers", "Bailleurs sociaux"], false, { autre: true }),
    q("anciens_clients", "Anciens clients cités", "long"),
    q("commentaire_chantiers", "Commentaire sur 2 ou 3 chantiers réalisés", "long", true),
    choix("photos", "Photos de chantiers", ["Reçues", "Promises", "Aucune"], true),
    q("lien_photos", "Lien vers les photos (Drive, WhatsApp…)", "texte"),
    q("reference", "Référence à rappeler (nom + téléphone)", "texte"),
  ] },
  { id: "avis", titre: "Avis STC", questions: [
    q("serieux", "Sérieux", "echelle", true),
    q("communication", "Communication", "echelle", true),
    q("capacite", "Capacité", "echelle", true),
    q("prix", "Prix", "echelle", true),
    q("commentaire", "Commentaire libre", "long", true),
    q("motif", "Motif de la décision", "long"),
    q("qualifie_par", "Qualifié par", "texte", true),
  ] },
]

export const TOUTES_QUESTIONS = SECTIONS_ST.flatMap((s) => s.questions)
/** Ce que le calcul de la décision utilise : on peut les renommer, pas les retirer. */
export const SECTIONS_PROTEGEES = ["eliminatoires", "avis"]
export const QUESTIONS_PROTEGEES = ["motif", "qualifie_par"]

let compteurId = 0
export const nouvelIdST = () => `q-${Date.now().toString(36)}-${(++compteurId).toString(36)}`

/** Le questionnaire prêt à enregistrer : sans question vide ni réponse vide, et tout en Oui / Non dans les éliminatoires. */
export function nettoyerQuestionnaire(sections: SectionST[]): SectionST[] {
  return sections.map((s) => ({
    ...s, titre: s.titre.trim(),
    questions: s.questions.filter((q) => q.libelle.trim()).map((q) => ({ ...q, libelle: q.libelle.trim(), type: s.id === "eliminatoires" ? "oui_non" as const : q.type, options: q.options?.map((o) => o.trim()).filter(Boolean) })),
  }))
}
export function erreurQuestionnaire(sections: SectionST[]): string {
  if (sections.some((s) => !s.titre)) return "Une partie n'a pas de titre."
  const sansReponse = sections.flatMap((s) => s.questions).find((q) => (q.type === "choix" || q.type === "cases") && !q.options?.length && !q.autre)
  return sansReponse ? `« ${sansReponse.libelle} » n'a aucune réponse possible.` : ""
}

export function visible(question: QuestionST, r: ReponsesST): boolean {
  return !question.si || question.si.valeurs.includes(String(r[question.si.id] ?? ""))
}
export function estRepondue(question: QuestionST, r: ReponsesST): boolean {
  const v = r[question.id]
  if (Array.isArray(v)) return v.length > 0
  return String(v ?? "").trim() !== ""
}
/** Les questions obligatoires qui restent à remplir. */
export function manques(r: ReponsesST, sections: SectionST[] = SECTIONS_ST): QuestionST[] {
  return sections.flatMap((s) => s.questions).filter((x) => x.requis && visible(x, r) && !estRepondue(x, r))
}
export function avancementSection(s: SectionST, r: ReponsesST): { fait: number; total: number } {
  const l = s.questions.filter((x) => x.requis && visible(x, r))
  return { fait: l.filter((x) => estRepondue(x, r)).length, total: l.length }
}
export function avancement(r: ReponsesST, sections: SectionST[] = SECTIONS_ST): { fait: number; total: number } {
  const l = sections.flatMap((s) => s.questions).filter((x) => x.requis && visible(x, r))
  return { fait: l.filter((x) => estRepondue(x, r)).length, total: l.length }
}
/** Les critères éliminatoires auxquels il a répondu « Non ». */
export function echecs(r: ReponsesST, sections: SectionST[] = SECTIONS_ST): string[] {
  return (sections.find((s) => s.id === "eliminatoires")?.questions ?? []).filter((x) => r[x.id] === "Non").map((x) => x.libelle)
}
export function moyenneAvis(r: ReponsesST, sections: SectionST[] = SECTIONS_ST): number | null {
  const avis = (sections.find((s) => s.id === "avis")?.questions ?? []).filter((q) => q.type === "echelle")
  const notes = avis.map((q) => Number(r[q.id])).filter((n) => n > 0)
  return notes.length && notes.length === avis.length ? Math.round((notes.reduce((a, b) => a + b, 0) / notes.length) * 10) / 10 : null
}
/** Pourquoi cette décision n'est pas encore possible ; rien si elle l'est. */
export function blocageDecision(d: DecisionST, r: ReponsesST, sections: SectionST[] = SECTIONS_ST): string {
  if (d === "Refusé") return String(r.motif ?? "").trim() ? "" : "Indique le motif du refus."
  if (d !== "Accepté") return ""
  if (echecs(r, sections).length) return "Un critère éliminatoire n'est pas rempli."
  const n = manques(r, sections).length
  return n ? `Il reste ${n} question${n > 1 ? "s" : ""} obligatoire${n > 1 ? "s" : ""}.` : ""
}
/** Ce qu'on sait déjà, pour ne pas le redemander au téléphone. */
export function prerempli(st: { entreprise?: string | null; contact?: string | null; telephone?: string | null; metier?: string | null }, parNom: string): ReponsesST {
  const r: ReponsesST = {}
  const poser = (cle: string, v?: string | null) => { if (v?.trim()) r[cle] = v.trim() }
  poser("raison_sociale", st.entreprise); poser("gerant", st.contact); poser("telephone", st.telephone); poser("metier", st.metier); poser("qualifie_par", parNom)
  return r
}
