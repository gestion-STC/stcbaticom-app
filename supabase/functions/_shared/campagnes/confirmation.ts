// Une relance attend que le mail d'avant soit PARTI (26/11/2026). Instantly accepte un contact (« confié ») bien avant
// d'envoyer ; abonnement coupé, il ne l'envoie jamais. Le 23/11, 30 agences ont été notées « envoyé » sans mail parti,
// et leur relance (« Re: … ») était prévue le 30/11 : elle serait partie comme une réponse à un mail jamais reçu.
// La règle : avant toute étape qui envoie, le dernier mail confié de l'inscription doit avoir sa confirmation
// « délivré » (email_sent d'Instantly, ou relance partie dans le fil). Sinon l'étape attend, sans limite de temps : un
// délai « au bout de X jours sans erreur, on suppose parti » enverrait justement ces relances-là.
export type EnvoiPasse = { id: string; etape_id: string; canal: string; statut: string; test: boolean; le: string }

/** Vrai si l'étape `etapeAEnvoyer` doit attendre : le dernier mail tenté (hors cette étape) n'a aucune confirmation.
 *  Une étape mail qui n'a que des erreurs retient aussi la relance (lot 2, 27/11/2026) : sinon le mail 2, écrit comme une
 *  relance, partait sans qu'aucun premier mail soit parti. */
export function relanceRetenue(envois: EnvoiPasse[], delivres: Set<string>, etapeAEnvoyer: string): boolean {
  const mails = envois.filter((e) => (e.statut === "envoye" || e.statut === "erreur") && !e.test && (e.canal === "mail" || e.canal === "newsletter") && e.etape_id !== etapeAEnvoyer)
  if (!mails.length) return false
  const dernier = mails.reduce((m, e) => (e.le > m.le ? e : m))
  // Une confirmation sur n'importe quel envoi de cette étape suffit (un renvoi « non parti » confirmé plus tard compte).
  return !envois.some((e) => e.etape_id === dernier.etape_id && delivres.has(e.id))
}

/** Quand le dernier mail confirmé (hors `etapeAEnvoyer`) est VRAIMENT parti (lot 2, 27/11/2026) : la première confirmation
 *  « délivré » de son étape. Instantly envoie quand il peut : un mail confié le jeudi part parfois le lundi. */
export function departDuMailPrecedent(envois: EnvoiPasse[], delivres: Map<string, string>, etapeAEnvoyer: string): { etapeId: string; parti: string } | null {
  const confirmes = envois.filter((e) => !e.test && (e.canal === "mail" || e.canal === "newsletter") && e.etape_id !== etapeAEnvoyer && delivres.has(e.id))
  if (!confirmes.length) return null
  const dernier = confirmes.reduce((m, e) => (delivres.get(e.id)! > delivres.get(m.id)! ? e : m))
  const parti = confirmes.filter((e) => e.etape_id === dernier.etape_id).map((e) => delivres.get(e.id)!).reduce((a, b) => (b < a ? b : a))
  return { etapeId: dernier.etape_id, parti }
}

type EtapeMin = { id: string; type: string; jours?: number }
/** Le moment où l'étape `etapeAEnvoyer` peut partir, compté depuis le départ réel du mail d'avant : les « Attendre » qui
 *  les séparent, et au moins l'écart minimal entre deux touches. En ms. */
export function relancePossibleLe(etapes: EtapeMin[], etapePrecedente: string, etapeAEnvoyer: string, parti: string, ecartMinH: number): number {
  const de = etapes.findIndex((e) => e.id === etapePrecedente), a = etapes.findIndex((e) => e.id === etapeAEnvoyer)
  const jours = de >= 0 && a > de ? etapes.slice(de + 1, a).reduce((s, e) => s + (e.type === "attendre" ? Number(e.jours ?? 0) : 0), 0) : 0
  const t = new Date(parti).getTime()
  return Math.max(t + jours * 86_400_000, t + Math.max(0, ecartMinH) * 3_600_000)
}

/** Les rejeux d'un envoi en erreur (lot 2, 27/11/2026). Un mail : 15 min, 1 h, 4 h, puis 1 jour ; après le dernier
 *  échec, l'inscription s'arrête (la suite serait une relance sans mail d'avant). SMS et LinkedIn : 15 min, 1 h, puis
 *  l'étape est abandonnée et la séquence continue, comme avant. */
export const REJEUX_MIN = { mail: [15, 60, 240, 1440], autre: [15, 60] } as const
export function rejeuApres(canal: string, tentative: number): number | null {
  const l = canal === "mail" || canal === "newsletter" ? REJEUX_MIN.mail : REJEUX_MIN.autre
  return tentative <= l.length ? l[tentative - 1] : null
}

/** La variante à envoyer (lot 2, 27/11/2026) : jamais une variante sans texte (une variante B ajoutée, pas encore écrite,
 *  sur une campagne active). L'autre variante non vide de l'étape la remplace ; aucune : null, l'envoi est reporté. */
export function varianteAvecTexte<V extends { id: string; corps: string }>(variantes: V[], voulue: string | null): V | null {
  const v = variantes.find((x) => x.id === voulue) ?? variantes[0]
  if (v && v.corps.trim()) return v
  return variantes.find((x) => x.corps.trim()) ?? null
}
