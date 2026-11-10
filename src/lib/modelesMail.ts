// Les modèles de mails réutilisables d'une campagne à l'autre (Mahdi, 10/11/2026).
import { ecrireParametre, lireParametre } from "./parametresDb"

export type ModeleMail = { id: string; nom: string; objet: string; corps: string }
const CLE = "modeles_mail"

export async function chargerModelesMail(): Promise<ModeleMail[]> {
  try { const l = JSON.parse((await lireParametre(CLE)) || "[]") as unknown; return Array.isArray(l) ? (l as ModeleMail[]) : [] } catch { return [] }
}

export async function enregistrerModeleMail(nom: string, objet: string, corps: string): Promise<ModeleMail[]> {
  const liste = [...(await chargerModelesMail()).filter((m) => m.nom !== nom), { id: crypto.randomUUID(), nom, objet, corps }]
  await ecrireParametre(CLE, JSON.stringify(liste))
  return liste
}
