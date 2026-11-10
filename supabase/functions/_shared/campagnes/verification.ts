// LA VÉRIFICATION DES ADRESSES AVANT L'ENVOI (Mahdi, 11/11/2026 : « si on peut les vérifier avant d'envoyer, ce serait très
// bien »). Deux niveaux : gratuit (l'adresse est bien écrite, son domaine reçoit des mails), puis Instantly (la boîte existe).
// Le verdict est gardé dans cmp_verifications : une adresse n'est vérifiée qu'une fois.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

export type Verdict = { email: string; statut: "valide" | "douteux" | "invalide" | "attente"; source: "local" | "instantly"; motif: string }
const FORME = /^[^\s@<>()[\],;:"]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i
const domaines = new Map<string, boolean>()

/** Le domaine reçoit-il des mails ? Un enregistrement MX, sinon une adresse (la règle des messageries). */
async function domaineRecoit(domaine: string): Promise<boolean> {
  if (domaines.has(domaine)) return domaines.get(domaine)!
  // Seul « ce domaine n'existe pas / n'a rien » compte comme un refus. Une panne ou un serveur qui ne sait pas
  // interroger les DNS ne refuse personne : Instantly fera la vérification.
  const lire = async (type: "MX" | "A"): Promise<boolean | null> => {
    try { return (await Deno.resolveDns(domaine, type)).length > 0 } catch (e) { return e instanceof Deno.errors.NotFound ? false : null }
  }
  const mx = await lire("MX")
  const ok = mx === true ? true : mx === null ? true : (await lire("A")) !== false
  domaines.set(domaine, ok)
  return ok
}

async function parInstantly(cle: string, email: string): Promise<Verdict | null> {
  try {
    const r = await fetch("https://api.instantly.ai/api/v2/email-verification", { method: "POST", headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" }, body: JSON.stringify({ email }) })
    if (!r.ok) return null // pas de forfait (402), pas le droit (401), trop de demandes (429) : on garde le niveau gratuit
    const d = await r.json() as { verification_status?: string; catch_all?: boolean | string }
    if (d.verification_status === "invalid") return { email, statut: "invalide", source: "instantly", motif: "la boîte n'existe pas" }
    if (d.verification_status === "pending") return { email, statut: "attente", source: "instantly", motif: "vérification en cours" }
    if (d.verification_status === "verified") return d.catch_all === true ? { email, statut: "douteux", source: "instantly", motif: "le domaine accepte toutes les adresses : impossible de savoir" } : { email, statut: "valide", source: "instantly", motif: "" }
    return null
  } catch { return null }
}

/** Vérifie une adresse (gratuit, puis Instantly si sa clé est là). */
export async function verifierAdresse(email: string, cleInstantly: string): Promise<Verdict> {
  const e = email.trim().toLowerCase()
  if (!FORME.test(e)) return { email: e, statut: "invalide", source: "local", motif: "adresse mal écrite" }
  if (!(await domaineRecoit(e.split("@")[1]))) return { email: e, statut: "invalide", source: "local", motif: "le domaine ne reçoit pas de mails" }
  return (cleInstantly ? await parInstantly(cleInstantly, e) : null) ?? { email: e, statut: "valide", source: "local", motif: "" }
}

/** Les verdicts déjà connus. Une vérification « en cours » se redemande. */
export async function verdictsConnus(sb: SupabaseClient, emails: string[]): Promise<Map<string, Verdict>> {
  const out = new Map<string, Verdict>()
  const liste = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))]
  for (let i = 0; i < liste.length; i += 200) {
    const { data } = await sb.from("cmp_verifications").select("email, statut, source, motif").in("email", liste.slice(i, i + 200))
    for (const v of (data ?? []) as Verdict[]) if (v.statut !== "attente") out.set(v.email, v)
  }
  return out
}

/** Vérifie ce qui ne l'est pas encore (au plus `max`), garde les verdicts et rend le tout. */
export async function verifierLesAdresses(sb: SupabaseClient, emails: string[], cleInstantly: string, max: number): Promise<Map<string, Verdict>> {
  const connus = await verdictsConnus(sb, emails)
  const aFaire = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter((e) => e && !connus.has(e)))].slice(0, max)
  // Par cinq à la fois : Instantly limite le nombre de demandes.
  const nouveaux: Verdict[] = []
  for (let i = 0; i < aFaire.length; i += 5) nouveaux.push(...await Promise.all(aFaire.slice(i, i + 5).map((e) => verifierAdresse(e, cleInstantly))))
  if (nouveaux.length) await sb.from("cmp_verifications").upsert(nouveaux.map((v) => ({ ...v, verifie_le: new Date().toISOString() })), { onConflict: "email" })
  for (const v of nouveaux) connus.set(v.email, v)
  return connus
}
