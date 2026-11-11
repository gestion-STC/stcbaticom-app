// ════════════════════════════════════════════════════════════════════════════
// LES BOÎTES MAIL (Mahdi, 11/11/2026) : dans quelle boîte arrive un mail, et de quelle adresse part un mail.
//
// ⚠ DEUX COPIES IDENTIQUES : src/lib/boitesMail.ts (l'écran, les tests) et
// supabase/functions/_shared/boitesMail.ts (le serveur). Un test vérifie qu'elles sont identiques :
// on modifie l'une, on recopie l'autre. Pur : aucun accès réseau, aucun import.
//
// 1. UNE ADRESSE PAR COMMERCIAL, comme STC Bâtiment (admins.email_reception, prenom@os.stcbatiment.fr) :
//    le même nom de champ, « email_reception », sur le domaine du CRM. Au passage dans STC Bâtiment,
//    c'est un changement de domaine : DOMAINES_RECEPTION ci-dessous (et le contrôle SQL de la table equipe).
//    Le recrutement garde UNE adresse commune (recrutement@) : pas d'adresse personnelle là-bas.
// 2. LA BONNE BOÎTE : un mail va au recrutement (Sous-traitants) si l'UN de ces indices est là :
//    · il est adressé au recrutement ;
//    · l'expéditeur est un artisan de la base de recrutement ;
//    · il répond à un de nos mails du recrutement ;
//    · son texte (citations retirées) dit clairement « je suis artisan et je propose mes services ».
//    Sinon il va au démarchage (Gestionnaires). ⚠ Le Kbis, le RIB, l'attestation ne sont PAS des indices :
//    STC Bâtiment est elle-même prestataire des agences, qui les lui demandent tous les jours.
// ════════════════════════════════════════════════════════════════════════════

/** Le domaine des adresses dédiées (le premier sert à compléter une saisie sans « @ »). */
export const DOMAINES_RECEPTION = ["crm.stcbatiment.fr"]
/** L'adresse générale du démarchage : ses mails ne sont à personne, les administrateurs les voient. */
export const ADRESSE_GENERALE = "contact@crm.stcbatiment.fr"
export const ADRESSE_RECRUTEMENT = "recrutement@crm.stcbatiment.fr"
export const ADRESSES_RECRUTEMENT = [ADRESSE_RECRUTEMENT, "partenaires@crm.stcbatiment.fr"]
/** Les adresses communes : jamais l'adresse dédiée d'une personne. */
export const NOMS_RESERVES = ["contact", "recrutement", "partenaires", "noreply", "no-reply", "info", "bonjour", "admin", "postmaster"]

export type Espace = "demarchage" | "recrutement"

/** « Jean <J.Dupont@X.fr> » → « j.dupont@x.fr ». */
export function adresseSeule(brut: unknown): string {
  const s = String(brut ?? "").trim()
  const m = s.match(/<([^>]+)>/)
  return (m ? m[1] : s).toLowerCase().trim()
}

export function estDuDomaine(adresse: string): boolean {
  const a = adresseSeule(adresse)
  return DOMAINES_RECEPTION.some((d) => a.endsWith("@" + d))
}

/** La saisie de l'administrateur : minuscules, sans espaces ; « karim » devient « karim@crm.stcbatiment.fr ». */
export function normaliserAdresseDediee(saisie: string): string {
  const s = String(saisie ?? "").trim().toLowerCase().replace(/\s+/g, "")
  if (!s) return ""
  return s.includes("@") ? s : `${s}@${DOMAINES_RECEPTION[0]}`
}

export type AdresseValidee = { ok: true; adresse: string | null } | { ok: false; erreur: string }

/** Vide = pas d'adresse dédiée. Sinon : sur le domaine du CRM, et pas une adresse commune. */
export function validerAdresseDediee(saisie: string): AdresseValidee {
  const a = normaliserAdresseDediee(saisie)
  if (!a) return { ok: true, adresse: null }
  const [local, domaine] = a.split("@")
  if (!DOMAINES_RECEPTION.includes(domaine ?? "")) return { ok: false, erreur: `L'adresse doit être sur @${DOMAINES_RECEPTION[0]} (ex. prenom@${DOMAINES_RECEPTION[0]}).` }
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(local ?? "")) return { ok: false, erreur: "Lettres sans accent, chiffres, point, tiret : par exemple prenom ou prenom.nom." }
  if (NOMS_RESERVES.includes(local)) return { ok: false, erreur: `« ${local}@ » est une adresse commune : choisissez le prénom de la personne.` }
  return { ok: true, adresse: a }
}

/** Le compte dont l'adresse dédiée est parmi les destinataires (la première trouvée), sinon null. */
export function compteDesDestinataires(destinataires: string[], adresses: { compteId: string; email: string }[]): string | null {
  const vus = destinataires.map(adresseSeule)
  return adresses.find((x) => x.email && vus.includes(adresseSeule(x.email)))?.compteId ?? null
}

// ── LA BONNE BOÎTE ──────────────────────────────────────────────────────────

/** Le texte écrit par l'expéditeur, sans le mail cité en dessous (« Le … a écrit : », « De : », « > »). */
export function sansCitation(corps: string): string {
  const lignes = String(corps ?? "").replace(/\r\n/g, "\n").split("\n")
  const garde: string[] = []
  for (const l of lignes) {
    const t = l.trim()
    if (/^(le|on)\s.{3,200}(a écrit|wrote)\s*:?\s*$/i.test(t)) break
    if (/^(de|from|envoyé|sent)\s*:/i.test(t) && garde.length > 0) break
    if (/^-{2,}\s*(original message|message d'origine|message transféré|forwarded message)/i.test(t)) break
    if (/^_{5,}$/.test(t)) break
    if (t.startsWith(">")) continue
    garde.push(l)
  }
  return garde.join("\n")
}

const METIERS = "artisan|plombier|[ée]lectricien|peintre|carreleur|ma[çc]on|menuisier|plaquiste|chauffagiste|serrurier|couvreur|vitrier|parqueteur|fa[çc]adier|frigoriste|climaticien|charpentier|solier|staffeur|multiservices?|homme toutes mains"
const ACTIVITES = "b[âa]timent|btp|plomberie|[ée]lectricit[ée]|peinture|r[ée]novation|ma[çc]onnerie|menuiserie|carrelage|chauffage|couverture|serrurerie|multiservices?|second[- ]?[œo]euvre|travaux"
const ARTISAN: RegExp[] = [
  new RegExp(`\\b(je suis|nous sommes)\\s+(un |une |des )?(${METIERS})s?\\b`, "i"),
  new RegExp(`\\b(je suis|nous sommes)\\s+(une |un )?(entreprise|soci[ée]t[ée]|artisan)\\s+(de |du |en |d')\\s*(${ACTIVITES})`, "i"),
  new RegExp(`\\b(mon|notre) entreprise (de |du |en |d')\\s*(${ACTIVITES})`, "i"),
  /\bje (vous )?(propose|offre) mes services\b/i,
  /\b(proposer|offrir) mes services\b/i,
  /\b(je suis|nous sommes|devenir|[êe]tre|travailler (comme|en tant que))\s+(votre |vos |un |une )?sous[- ]?traitants?\b/i,
  /\btravailler en sous[- ]?traitance\b/i,
  /\bcontrats? de sous[- ]?traitance\b/i,
  /\bartisans? partenaires?\b/i,
  /\b(rejoindre|int[ée]grer) (votre|le) r[ée]seau\b/i,
  /\brejoignez le r[ée]seau\b/i,
  /\bun vrai partenaire, pas une plateforme\b/i,
  /\b(je suis|en tant qu'?)\s*(auto[- ]?entrepreneur|micro[- ]?entrepreneur)\b/i,
]

/** Le mail vient clairement d'un artisan qui propose ses services (objet + son propre texte, citations retirées). */
export function ressembleAUnArtisan(objet: string, corps: string): boolean {
  const texte = `${String(objet ?? "")}\n${sansCitation(corps).slice(0, 3000)}`
  return ARTISAN.some((r) => r.test(texte))
}

/** « RE: TR : Re: Bonjour » → « bonjour ». */
export function sujetDeBase(objet: string): string {
  let s = String(objet ?? "").trim()
  for (let i = 0; i < 6; i++) {
    const avant = s
    s = s.replace(/^\s*(re|r[ée]f|tr|fw|fwd|aw|wg)\s*(\[\d+\])?\s*:\s*/i, "").trim()
    if (s === avant) break
  }
  return s.replace(/\s+/g, " ").toLowerCase()
}

export const estUneReponse = (objet: string) => /^\s*(re|r[ée]f|aw)\s*(\[\d+\])?\s*:/i.test(String(objet ?? ""))

/** Les identifiants de nos mails cités par In-Reply-To / References, sous les formes où on les range. */
export function identifiantsCites(...entetes: (string | null | undefined)[]): string[] {
  const out = new Set<string>()
  for (const e of entetes) {
    for (const brut of String(e ?? "").split(/[\s,]+/)) {
      const id = brut.replace(/^<|>$/g, "").trim()
      if (!id) continue
      out.add(id)
      const local = id.split("@")[0]
      if (local && local !== id) out.add(local)
    }
  }
  return [...out]
}

/** Répond-il à un de nos mails du recrutement envoyés à cette adresse ? (même sujet, et c'est une réponse) */
export function repondAUnSujet(objet: string, sujetsEnvoyes: string[]): boolean {
  if (!estUneReponse(objet)) return false
  const base = sujetDeBase(objet)
  return !!base && sujetsEnvoyes.some((s) => sujetDeBase(s) === base)
}

export type IndicesEspace = {
  destinataires: string[]
  expediteurEstArtisan: boolean
  repondAuRecrutement: boolean
  objet: string
  corps: string
}
export type RaisonEspace = "adresse" | "artisan" | "reponse" | "contenu" | "defaut"

export function espaceDuMailRecu(i: IndicesEspace): { espace: Espace; raison: RaisonEspace } {
  if (i.destinataires.map(adresseSeule).some((a) => ADRESSES_RECRUTEMENT.includes(a))) return { espace: "recrutement", raison: "adresse" }
  if (i.expediteurEstArtisan) return { espace: "recrutement", raison: "artisan" }
  if (i.repondAuRecrutement) return { espace: "recrutement", raison: "reponse" }
  if (ressembleAUnArtisan(i.objet, i.corps)) return { espace: "recrutement", raison: "contenu" }
  return { espace: "demarchage", raison: "defaut" }
}

// ── L'ADRESSE QUI ENVOIE (démarchage) ───────────────────────────────────────

/** Qui envoie : le compte connecté ; sans lui (envoi du serveur), le commercial de l'agence ; sinon personne. */
export function compteQuiEnvoie(c: { appelantId?: string | null; commercialAgence?: string | null }): string | null {
  return c.appelantId || c.commercialAgence || null
}

/**
 * L'expéditeur d'un mail du démarchage : l'adresse dédiée de la personne quand elle en a une
 * (« Prénom Nom — STC Bâtiment <prenom@crm.stcbatiment.fr> », réponses à la même adresse, signature avec
 * elle) ; sinon l'expéditeur par défaut, inchangé (contact@).
 */
export function expediteurDemarchage(e: { adresseDediee?: string | null; nom?: string | null; parDefaut: string }): { from: string; replyTo: string | null; adresseSignature: string } {
  const v = validerAdresseDediee(e.adresseDediee ?? "")
  if (!v.ok || !v.adresse) return { from: e.parDefaut, replyTo: null, adresseSignature: adresseSeule(e.parDefaut) || ADRESSE_GENERALE }
  const nom = String(e.nom ?? "").replace(/[<>"\r\n]/g, "").trim()
  return { from: `${nom ? nom + " — " : ""}STC Bâtiment <${v.adresse}>`, replyTo: v.adresse, adresseSignature: v.adresse }
}

/** La signature STC porte l'adresse générale : on y met l'adresse de la personne (le lien et le texte du lien seulement). */
export function signatureAvecAdresse(html: string, adresse: string): string {
  const a = adresseSeule(adresse)
  if (!a || a === ADRESSE_GENERALE) return html
  return String(html ?? "").split(`mailto:${ADRESSE_GENERALE}`).join(`mailto:${a}`).split(`>${ADRESSE_GENERALE}</a>`).join(`>${a}</a>`)
}
