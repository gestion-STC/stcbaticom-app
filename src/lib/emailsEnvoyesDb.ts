import { supabase } from "./supabase"

export type EmailEnvoye = {
  id?: string
  prospectId: string
  modeleNom: string
  objet: string
  envoyeLe?: string
  aRepondu: boolean
}

type Ligne = {
  id: string
  prospect_id: string
  modele_nom: string
  objet: string
  envoye_le: string
  a_repondu: boolean
}

function vers(l: Ligne): EmailEnvoye {
  return {
    id: l.id,
    prospectId: l.prospect_id,
    modeleNom: l.modele_nom,
    objet: l.objet,
    envoyeLe: l.envoye_le,
    aRepondu: l.a_repondu,
  }
}

// Journalise un email envoyé.
export async function logEmailEnvoye(e: {
  prospectId: string
  modeleNom: string
  objet: string
}): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from("emails_envoyes").insert({
    prospect_id: e.prospectId,
    modele_nom: e.modeleNom,
    objet: e.objet,
  })
  if (error) console.error("Log email :", error.message)
}

export async function chargerEmailsEnvoyes(): Promise<EmailEnvoye[]> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase
    .from("emails_envoyes")
    .select("id, prospect_id, modele_nom, objet, envoye_le, a_repondu")
    .order("envoye_le", { ascending: false })
    .limit(2000)
  if (error) throw new Error(error.message)
  return (data as Ligne[]).map(vers)
}

// Marque un email (ou un prospect) comme « a répondu ».
export async function marquerReponse(prospectId: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase
    .from("emails_envoyes")
    .update({ a_repondu: true })
    .eq("prospect_id", prospectId)
  if (error) console.error("Marquer réponse :", error.message)
}
