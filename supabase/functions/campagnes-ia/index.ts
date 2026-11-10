// LES ESSAIS DE PERSONNALISATION (10/11/2026) : l'écran demande à l'IA ce qu'elle écrirait pour de vraies fiches.
// Réservé aux administrateurs. Rien n'est envoyé ici. Déployée sans vérification de JWT : le jeton est contrôlé ci-dessous.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import { fichePauvre, type ReglageIA } from "../_shared/campagnes/ia.ts"
import { apprendreDesAppels, ceQuiMarche, ficheIA, genererTexteIA, lireAppris, offreSTC, trierReponse } from "../_shared/campagnes/generationIA.ts"
import { envoyerParInstantly, preparerInstantly } from "../_shared/campagnes/instantly.ts"
import { verifierLesAdresses } from "../_shared/campagnes/verification.ts"
import { remplirVariables } from "../_shared/campagnes/instantlyOutils.ts"

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
    if (entree.action === "trier") return json({ tri: await trierReponse(String(entree.objet ?? ""), String(entree.texte ?? "")) })
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
    const lignes = await Promise.all(contacts.map(async (k) => {
      const contact = { id: k.id, baseId: k.base_id, nom: k.nom, personne: k.personne, champs: k.champs ?? {} }
      const fiche = await ficheIA(sb, contact, b.ia)
      const detail = [contact.champs.metier, contact.champs.secteur || contact.champs.zone].filter(Boolean).join(" · ")
      if (fichePauvre(b.ia, fiche)) return { contactRef: k.id, nom: k.nom, detail, texte: "", pauvre: true, cout: 0 }
      const r = await genererTexteIA({ baseId: b.baseId, reglage: b.ia, campagneNom: b.campagneNom, objet: b.objet, corps: b.corps, fiche, offre, appels })
      return { contactRef: k.id, nom: k.nom, detail, texte: r.texte, pauvre: false, cout: r.cout }
    }))
    return json({ lignes, cout: lignes.reduce((s, l) => s + l.cout, 0) })
  } catch (e) {
    console.error("[CAMPAGNES-IA]", e)
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
