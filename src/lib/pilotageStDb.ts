import { supabase } from "./supabase"
import type { PilotageST } from "../recrutement"

// Les réglages de la machine tiennent sur UNE seule ligne (id = 1).
type LignePilotage = {
  id: number
  actif: boolean
  objectif_hebdo: number
  plafond_jour: number
  plafond_sms_jour: number | null
  cadence_email_ms: number | null
  cadence_sms_ms: number | null
  heure_min: string
  heure_max: string
  heure_min_sms: string | null
  heure_max_sms: string | null
  jours: number[]
  sequence_id: string | null
  delai_min_touches_h: number | null
  tentatives_max: number | null
  abandon_apres_jours: number | null
  alerte_email: string | null
  seuil_erreurs_pct: number | null
  email_test: string | null
  adresse_envoi: string | null
  recaler_au_demarrage: boolean | null
  actif_depuis: string | null
  arrete_le: string | null
  recale_le: string | null
  maj_le: string | null
}

const hhmm = (v: string | null | undefined, def: string) => String(v ?? def).slice(0, 5)

function vers(r: LignePilotage): PilotageST {
  return {
    actif: r.actif ?? false,
    objectifHebdo: r.objectif_hebdo ?? 2,
    plafondJour: r.plafond_jour ?? 100,
    plafondSmsJour: r.plafond_sms_jour ?? 40,
    cadenceEmailMs: r.cadence_email_ms ?? 700,
    cadenceSmsMs: r.cadence_sms_ms ?? 3000,
    heureMin: hhmm(r.heure_min, "09:00"),
    heureMax: hhmm(r.heure_max, "18:00"),
    heureMinSms: hhmm(r.heure_min_sms, "10:00"),
    heureMaxSms: hhmm(r.heure_max_sms, "17:00"),
    jours: r.jours ?? [1, 2, 3, 4, 5],
    sequenceId: r.sequence_id,
    delaiMinTouchesH: r.delai_min_touches_h ?? 48,
    tentativesMax: r.tentatives_max ?? 3,
    abandonApresJours: r.abandon_apres_jours ?? 21,
    alerteEmail: r.alerte_email ?? "",
    seuilErreursPct: r.seuil_erreurs_pct ?? 20,
    emailTest: r.email_test ?? "",
    adresseEnvoi: r.adresse_envoi ?? "recrutement@crm.stcbatiment.fr",
    recalerAuDemarrage: r.recaler_au_demarrage ?? true,
    actifDepuis: r.actif_depuis,
    arreteLe: r.arrete_le,
    recaleLe: r.recale_le,
    majLe: r.maj_le,
  }
}

export async function chargerPilotage(): Promise<PilotageST> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase.from("st_pilotage").select("*").eq("id", 1).single()
  if (error) throw new Error(error.message)
  return vers(data as LignePilotage)
}

export async function majPilotage(p: Partial<PilotageST>): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const ligne: Record<string, unknown> = { maj_le: new Date().toISOString() }
  const poser = (cle: string, v: unknown) => { if (v !== undefined) ligne[cle] = v }
  poser("actif", p.actif)
  poser("objectif_hebdo", p.objectifHebdo)
  poser("plafond_jour", p.plafondJour)
  poser("plafond_sms_jour", p.plafondSmsJour)
  poser("cadence_email_ms", p.cadenceEmailMs)
  poser("cadence_sms_ms", p.cadenceSmsMs)
  poser("heure_min", p.heureMin)
  poser("heure_max", p.heureMax)
  poser("heure_min_sms", p.heureMinSms)
  poser("heure_max_sms", p.heureMaxSms)
  poser("jours", p.jours)
  poser("sequence_id", p.sequenceId)
  poser("delai_min_touches_h", p.delaiMinTouchesH)
  poser("tentatives_max", p.tentativesMax)
  poser("abandon_apres_jours", p.abandonApresJours)
  poser("alerte_email", p.alerteEmail)
  poser("seuil_erreurs_pct", p.seuilErreursPct)
  poser("email_test", p.emailTest)
  poser("adresse_envoi", p.adresseEnvoi)
  poser("recaler_au_demarrage", p.recalerAuDemarrage)
  const { error } = await supabase.from("st_pilotage").update(ligne).eq("id", 1)
  if (error) throw new Error(error.message)
}
