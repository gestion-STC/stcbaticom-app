// LES ESSAIS DE PERSONNALISATION (10/11/2026) : l'écran demande à l'IA ce qu'elle écrirait pour de vraies fiches.
// Réservé aux administrateurs. Rien n'est envoyé ici. Déployée sans vérification de JWT : le jeton est contrôlé ci-dessous.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import { fichePauvre, type ReglageIA } from "../_shared/campagnes/ia.ts"
import { apprendreDesAppels, ceQuiMarche, ficheIA, genererTexteIA, interventionsSecteurs, lireAppris, lireReponse, offreSTC } from "../_shared/campagnes/generationIA.ts"
import { appelInstantly, envoyerParInstantly, preparerInstantly } from "../_shared/campagnes/instantly.ts"
import { verifierLesAdresses } from "../_shared/campagnes/verification.ts"
import { boitesDe, corpsAvecMentions, remplirVariables, type Mentions } from "../_shared/campagnes/instantlyOutils.ts"

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-passage-cle", "Access-Control-Allow-Methods": "POST, OPTIONS" }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } })
type Contact = { id: string; base_id: string; nom: string; personne: string; email: string; champs: Record<string, string> }
const melanger = <T,>(l: T[]) => [...l].map((v) => [Math.random(), v] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1])

async function autorise(sb: SupabaseClient, req: Request): Promise<boolean> {
  const cle = req.headers.get("x-passage-cle")
  if (cle) {
    const { data } = await sb.from("parametres").select("valeur").eq("cle", "analyse_passage_cle").maybeSingle()
    return Boolean((data as { valeur?: string } | null)?.valeur) && (data as { valeur: string }).valeur === cle
  }
  const jeton = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim()
  const { data } = await sb.auth.getUser(jeton)
  return data.user?.app_metadata?.role === "admin"
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
  try {
    if (!(await autorise(sb, req))) return json({ error: "Réservé aux administrateurs." }, 403)
    const entree = await req.json() as Record<string, unknown>
    // Ce qui marche au téléphone : la fiche lue, ou refaite à partir des appels analysés.
    if (entree.action === "appris") return json({ appris: await lireAppris(sb) })
    if (entree.action === "apprendre") return json({ appris: await apprendreDesAppels(sb) })
    // Vérifier des adresses tout de suite (25 au plus par appel ; l'écran enchaîne les lots).
    if (entree.action === "verifier") {
      const emails = (Array.isArray(entree.emails) ? entree.emails : []).map(String).slice(0, 25)
      const v = await verifierLesAdresses(sb, emails, Deno.env.get("INSTANTLY_API_KEY") ?? "", 25)
      return json({ verdicts: [...v.values()] })
    }
    // Le test « boîte de réception ou spam » (Mahdi, 11/11/2026) : le vrai mail, par les vraies boîtes, vers les boîtes de test d'Instantly.
    if (entree.action === "spam_lancer" || entree.action === "spam_resultats") {
      const cle = Deno.env.get("INSTANTLY_API_KEY") ?? ""
      if (!cle) return json({ error: "Instantly n'est pas branché." }, 400)
      const a = entree as unknown as { campagneId: string; baseId: string; nom: string; objet: string; corps: string; mentions?: Mentions; suivi?: boolean }
      const marque = `baticom:${a.campagneId}`
      if (entree.action === "spam_lancer") {
        const ins = await preparerInstantly(sb, Deno.env.get("SUPABASE_URL")!, new Date().toISOString())
        const boites = boitesDe(a.baseId, ins.pretes)
        if (!boites.length) return json({ error: "Aucune boîte d'envoi n'est prête pour cette cible." }, 400)
        const options = await appelInstantly(cle, "/inbox-placement-tests/email-service-provider-options")
        const labels = Array.isArray(options.data) ? options.data : []
        const valeurs = { contact: "Claire Martin", prenom: "Claire", entreprise: "Agence Exemple", agence: "Agence Exemple", secteur: "Paris 12e", enseigne: "", metier: "Peinture", zone: "Paris", accroche_ia: "" }
        const propre = (x: string) => remplirVariables(x, valeurs).replace(/\{\{lien_[a-z_]+\}\}/g, "https://www.stcbatiment.fr")
        const r = await appelInstantly(cle, "/inbox-placement-tests", { corps: {
          name: String(a.nom || "Test").slice(0, 120), description: marque, type: 1, sending_method: 1, delivery_mode: 2,
          email_subject: propre(a.objet), email_body: corpsAvecMentions(propre(a.corps), "https://www.stcbatiment.fr", true, a.mentions ?? {}),
          emails: boites, recipients_labels: labels, text_only: a.suivi === false, run_immediately: true,
        } })
        if (!r.ok) return json({ error: `Instantly a refusé le test (${r.status}) ${String(r.data?.message ?? "").slice(0, 160)}` }, 502)
        return json({ id: String(r.data?.id ?? "") })
      }
      const l = await appelInstantly(cle, "/inbox-placement-tests?limit=100")
      const tous = ((l.data?.items ?? []) as { id: string; name: string; description?: string | null; timestamp_created: string; status?: number | null }[])
      const tests = tous.filter((t) => t.description === marque).sort((x, y) => y.timestamp_created.localeCompare(x.timestamp_created)).slice(0, 6)
      if (!tests.length) return json({ tests: [] })
      const ids = tests.map((t) => t.id)
      const stats = async (esp?: number) => { const r = await appelInstantly(cle, "/inbox-placement-analytics/stats-by-test-id", { corps: { test_ids: ids, ...(esp ? { recipient_esp: [esp] } : {}) } }); return new Map(((Array.isArray(r.data) ? r.data : []) as { test_id: string }[]).map((x) => [x.test_id, x])) }
      const [tout, google, outlook] = await Promise.all([stats(), stats(1), stats(2)])
      return json({ tests: tests.map((t) => ({ id: t.id, nom: t.name, le: t.timestamp_created, statut: t.status ?? null, tout: tout.get(t.id) ?? null, google: google.get(t.id) ?? null, outlook: outlook.get(t.id) ?? null })) })
    }
    if (entree.action === "trier") return json(await lireReponse(String(entree.objet ?? ""), String(entree.texte ?? "")))
    // Le test d'arrivée : le vrai mail, par les vraies boîtes, vers des adresses à soi. Rien n'est compté dans la campagne.
    if (entree.action === "arrivee") {
      const a = entree as unknown as { campagne: { id: string; nom: string; baseId: string; rythme: { jours: number[]; heureMin: number; heureMax: number } }; adresses: string[]; objet: string; corps: string; varianteId: string }
      const ins = await preparerInstantly(sb, Deno.env.get("SUPABASE_URL")!, new Date().toISOString())
      if (!ins.pretes.length) return json({ error: "Aucune boîte d'envoi n'est prête." }, 400)
      const valeurs = { contact: "", prenom: "", entreprise: "Agence Exemple", agence: "Agence Exemple", secteur: "Paris 12e", enseigne: "", metier: "Peinture", zone: "Paris", accroche_ia: "" }
      const propre = (s: string) => remplirVariables(s, valeurs).replace(/\{\{lien_[a-z_]+\}\}/g, "https://www.stcbatiment.fr")
      for (const to of a.adresses.slice(0, 5)) {
        const r = await envoyerParInstantly(sb, ins, { id: a.campagne.id, nom: a.campagne.nom, baseId: a.campagne.baseId, rythme: a.campagne.rythme, plafond: 30, suiviOuvertures: false }, { id: "essai-arrivee", nom: "Essai", personne: "" }, to.trim(), `[ESSAI] ${propre(a.objet)}`, propre(a.corps), a.varianteId, true, "https://www.stcbatiment.fr")
        if (!r.ok) return json({ error: r.erreur ?? "Envoi refusé." }, 502)
      }
      return json({ ok: true })
    }
    const b = entree as unknown as { baseId: string; campagneNom: string; objet: string; corps: string; ia: ReglageIA; nombre?: number; contactRef?: string }
    let contacts: Contact[]
    if (b.contactRef) {
      const { data } = await sb.from("cmp_contacts").select("id, base_id, nom, personne, email, champs").eq("base_id", b.baseId).eq("id", b.contactRef)
      contacts = (data ?? []) as Contact[]
    } else {
      const { data, error } = await sb.from("cmp_contacts").select("id, base_id, nom, personne, email, champs").eq("base_id", b.baseId).neq("email", "").eq("statut", "libre").limit(600)
      if (error) throw new Error(error.message)
      const possibles = ((data ?? []) as Contact[]).filter((k) => b.ia.qui !== "fichiers" || b.ia.fichiers.includes(k.champs?.fichier ?? ""))
      contacts = melanger(possibles).slice(0, Math.min(Math.max(b.nombre ?? 10, 1), 10))
    }
    const offre = await offreSTC(sb)
    const appels = await ceQuiMarche(sb, b.baseId, b.ia)
    const interventions = await interventionsSecteurs(sb)
    const lignes = await Promise.all(contacts.map(async (k) => {
      const contact = { id: k.id, baseId: k.base_id, nom: k.nom, personne: k.personne, champs: k.champs ?? {} }
      const fiche = await ficheIA(sb, contact, b.ia)
      const detail = [contact.champs.metier, contact.champs.secteur || contact.champs.zone].filter(Boolean).join(" · ")
      if (fichePauvre(b.ia, fiche)) return { contactRef: k.id, nom: k.nom, detail, texte: "", pauvre: true, cout: 0 }
      const r = await genererTexteIA({ baseId: b.baseId, reglage: b.ia, campagneNom: b.campagneNom, objet: b.objet, corps: b.corps, fiche, offre, appels, interventions })
      return { contactRef: k.id, nom: k.nom, detail, texte: r.texte, pauvre: false, cout: r.cout }
    }))
    return json({ lignes, cout: lignes.reduce((s, l) => s + l.cout, 0) })
  } catch (e) {
    console.error("[CAMPAGNES-IA]", e)
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
