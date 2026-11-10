// LES ESSAIS DE PERSONNALISATION (10/11/2026) : l'écran demande à l'IA ce qu'elle écrirait pour de vraies fiches.
// Réservé aux administrateurs. Rien n'est envoyé ici. Déployée sans vérification de JWT : le jeton est contrôlé ci-dessous.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import { fichePauvre, type ReglageIA } from "../_shared/campagnes/ia.ts"
import { ficheIA, genererTexteIA, offreSTC } from "../_shared/campagnes/generationIA.ts"

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
    const b = await req.json() as { baseId: string; campagneNom: string; objet: string; corps: string; ia: ReglageIA; nombre?: number; contactRef?: string }
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
    const lignes = await Promise.all(contacts.map(async (k) => {
      const contact = { id: k.id, baseId: k.base_id, nom: k.nom, personne: k.personne, champs: k.champs ?? {} }
      const fiche = await ficheIA(sb, contact, b.ia)
      const detail = [contact.champs.metier, contact.champs.secteur || contact.champs.zone].filter(Boolean).join(" · ")
      if (fichePauvre(b.ia, fiche)) return { contactRef: k.id, nom: k.nom, detail, texte: "", pauvre: true, cout: 0 }
      const r = await genererTexteIA({ baseId: b.baseId, reglage: b.ia, campagneNom: b.campagneNom, objet: b.objet, corps: b.corps, fiche, offre })
      return { contactRef: k.id, nom: k.nom, detail, texte: r.texte, pauvre: false, cout: r.cout }
    }))
    return json({ lignes, cout: lignes.reduce((s, l) => s + l.cout, 0) })
  } catch (e) {
    console.error("[CAMPAGNES-IA]", e)
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
