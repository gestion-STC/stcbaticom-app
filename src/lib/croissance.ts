// LE DASHBOARD CROISSANCE (Mahdi, 11/11/2026) : « suivre la prospection, le démarchage, le recrutement sous-traitant,
// pour voir à quelle cadence on avance ». Les calculs, sans rien lire ni afficher. Fichier PUR, testé.

export type Marche = { libelle: string; valeur: number }

const lundi = (d: Date) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
/** Les lundis des N dernières semaines, la plus ancienne d'abord (la semaine en cours comprise). */
export function lundisRecents(maintenant: Date, n = 12): Date[] {
  const l = lundi(maintenant)
  return Array.from({ length: n }, (_, i) => new Date(l.getFullYear(), l.getMonth(), l.getDate() - 7 * (n - 1 - i)))
}
/** Combien de dates tombent dans chaque semaine. */
export function parSemaine(dates: (string | null | undefined)[], lundis: Date[]): number[] {
  const out = lundis.map(() => 0)
  const fin = lundis.length ? new Date(lundis[lundis.length - 1].getTime() + 7 * 86_400_000) : new Date(0)
  for (const d of dates) {
    if (!d) continue
    const t = new Date(d)
    if (t < lundis[0] || t >= fin) continue
    let i = lundis.length - 1
    while (i > 0 && t < lundis[i]) i--
    out[i]++
  }
  return out
}
/** Ce mois-ci et le mois dernier. */
export function moisCompare(dates: (string | null | undefined)[], maintenant: Date): { mois: number; avant: number } {
  const debut = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1), avant = new Date(maintenant.getFullYear(), maintenant.getMonth() - 1, 1)
  let mois = 0, av = 0
  for (const d of dates) { if (!d) continue; const t = new Date(d); if (t >= debut) mois++; else if (t >= avant) av++ }
  return { mois, avant: av }
}

export type AgenceCroissance = { etape: string; tentatives: number | null; joint_fois: number | null; premier_os_le: string | null }
/** Le démarchage, de la base au client. */
export function entonnoirDemarchage(l: AgenceCroissance[]): Marche[] {
  const client = (a: AgenceCroissance) => Boolean(a.premier_os_le) || a.etape === "client"
  const rdv = (a: AgenceCroissance) => client(a) || a.etape === "rdv_planifie"
  const interesse = (a: AgenceCroissance) => rdv(a) || a.etape === "interesse"
  return [
    { libelle: "Agences dans la base", valeur: l.length },
    { libelle: "Contactées", valeur: l.filter((a) => (a.tentatives ?? 0) > 0 || (a.joint_fois ?? 0) > 0 || interesse(a)).length },
    { libelle: "Gestionnaire joint", valeur: l.filter((a) => (a.joint_fois ?? 0) > 0 || interesse(a)).length },
    { libelle: "Intéressées", valeur: l.filter(interesse).length },
    { libelle: "RDV", valeur: l.filter(rdv).length },
    { libelle: "Clients (premier OS)", valeur: l.filter(client).length },
  ]
}

export type ArtisanCroissance = { statut: string; nb_envois_ok: number | null; nb_appels: number | null; nb_joints: number | null; nb_clics: number | null; suivi: string | null; depose_le: string | null; contrat_statut: string | null; contrat_signe_le: string | null; acces_ouvert_le: string | null }
/** Le recrutement, de la base à l'accès ouvert. Chaque marche est comprise dans la précédente (les joints au
 *  téléphone sont dans le tableau de l'équipe : un intéressé ne passe pas toujours par un appel). */
export function entonnoirRecrutement(l: ArtisanCroissance[]): Marche[] {
  const acces = (a: ArtisanCroissance) => Boolean(a.acces_ouvert_le)
  const contrat = (a: ArtisanCroissance) => acces(a) || Boolean(a.contrat_signe_le) || a.contrat_statut === "signe"
  const depose = (a: ArtisanCroissance) => contrat(a) || Boolean(a.depose_le) || a.statut === "depose"
  const interesse = (a: ArtisanCroissance) => depose(a) || (a.nb_clics ?? 0) > 0 || a.suivi === "va_deposer"
  return [
    { libelle: "Artisans dans la base", valeur: l.length },
    { libelle: "Contactés", valeur: l.filter((a) => (a.nb_envois_ok ?? 0) > 0 || (a.nb_appels ?? 0) > 0 || interesse(a)).length },
    { libelle: "Intéressés", valeur: l.filter(interesse).length },
    { libelle: "Dossier déposé", valeur: l.filter(depose).length },
    { libelle: "Contrat signé", valeur: l.filter(contrat).length },
    { libelle: "Accès ouvert", valeur: l.filter(acces).length },
  ]
}

/** Combien de semaines pour épuiser une réserve à ce rythme (null : pas de rythme). */
export const semainesRestantes = (reserve: number, parSemaineMoyen: number): number | null => (parSemaineMoyen > 0 ? Math.ceil(reserve / parSemaineMoyen) : null)
/** Le taux de passage d'une marche à la suivante. */
export const tauxPassage = (de: number, a: number): number | null => (de > 0 ? a / de : null)
