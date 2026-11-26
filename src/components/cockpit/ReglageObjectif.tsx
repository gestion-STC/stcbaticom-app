// L'OBJECTIF ET LES RÉGLAGES DU CALCUL (repris tels quels de l'ancien dashboard Croissance, 11/11/2026) : la fenêtre
// « Mon objectif » (CA visé, échéance) et « Réglages du calcul » (seuils d'une agence active). Écrit parametres.cockpit_croissance.
import { useState, type FormEvent } from "react"
import { Champ } from "../../ui"
import { FENETRE, PIED_FENETRE, PILULE_CLAIRE, PILULE_NOIRE } from "../agenda/dessinBureau"
import { ecrireParametre } from "../../lib/parametresDb"
import { echeanceDe, type ReelStc, type ReglageCockpit } from "../../lib/croissance"

type Saisie = { objectifMensuel: string; echeance: string; caParClient: string; factureMin: string; osMin: string; chutePct: string }
const jourIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const versSaisie = (r: ReglageCockpit): Saisie => ({ objectifMensuel: String(r.objectifMensuel), echeance: jourIso(echeanceDe(r)), caParClient: String(r.caParClient), factureMin: String(r.factureMin), osMin: String(r.osMin), chutePct: String(r.chutePct) })
const moisLong = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString("fr-FR", { month: "long" })
const periode = (mois: string[]) => mois.length > 1 ? `${moisLong(mois[0])} à ${moisLong(mois[mois.length - 1])}` : moisLong(mois[0] ?? "")

export default function ReglageObjectif({ fenetre, reglage, reel, onFermer, onEnregistre }: {
  fenetre: "objectif" | "calcul"; reglage: ReglageCockpit; reel: ReelStc | null; onFermer: () => void; onEnregistre: (r: ReglageCockpit) => void
}) {
  const [saisie, setSaisie] = useState<Saisie>(() => versSaisie(reglage))
  const [erreur, setErreur] = useState("")
  const nombre = (x: string) => Math.max(0, Number(x.replace(/\s/g, "").replace(",", ".")) || 0)
  const enregistrer = async (e: FormEvent) => {
    e.preventDefault()
    const ech = /^\d{4}-\d{2}-\d{2}$/.test(saisie.echeance) ? saisie.echeance : jourIso(echeanceDe(reglage))
    const r: ReglageCockpit = { objectifMensuel: nombre(saisie.objectifMensuel), moisPourYArriver: reglage.moisPourYArriver, echeance: ech, caParClient: nombre(saisie.caParClient), factureMin: nombre(saisie.factureMin), osMin: nombre(saisie.osMin), chutePct: Math.min(100, nombre(saisie.chutePct)) }
    try {
      // L'objectif du mois des gestionnaires (premiers OS) ne s'écrit pas d'ici : Réglages fait foi.
      await ecrireParametre("cockpit_croissance", JSON.stringify(r))
      onEnregistre(r)
    } catch (x) { setErreur(x instanceof Error ? x.message : String(x)) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111113]/25 p-4" onClick={onFermer}>
      <form role="dialog" aria-label={fenetre === "objectif" ? "Mon objectif" : "Réglages du calcul"} onSubmit={enregistrer} onClick={(e) => e.stopPropagation()} className={`${FENETRE} w-full max-w-[480px] overflow-hidden`}>
        <div className="px-[22px] pb-1 pt-5 text-[15px] font-semibold">{fenetre === "objectif" ? "Mon objectif" : "Réglages du calcul"}</div>
        <div className="flex flex-col gap-3 px-[22px] pb-5 pt-2">
          {fenetre === "objectif" ? <>
            <div className="text-[13px] text-[#6B6B70]">Le chiffre d'affaires que tu vises chaque mois, et la date à laquelle tu veux y être. Le cockpit en déduit les agences et les objectifs de la semaine.</div>
            <label className="flex items-center gap-3">
              <span className="flex-1 text-[13px]">Chiffre d'affaires visé</span>
              <span className="w-[130px]"><Champ inputMode="numeric" value={saisie.objectifMensuel} onChange={(e) => setSaisie((x) => ({ ...x, objectifMensuel: e.target.value }))} aria-label="Chiffre d'affaires visé" /></span>
              <span className="w-[70px] text-[13px] text-[#6B6B70]">€ par mois</span>
            </label>
            <label className="flex items-center gap-3">
              <span className="flex-1 text-[13px]">Pour le</span>
              <span className="w-[130px]"><Champ type="date" value={saisie.echeance} onChange={(e) => setSaisie((x) => ({ ...x, echeance: e.target.value }))} aria-label="Date d'échéance" /></span>
              <span className="w-[70px] text-[13px] text-[#6B6B70]">échéance</span>
            </label>
          </> : <>
            <div className="text-[13px] text-[#6B6B70]">{reel ? `Vrais chiffres de STC Bâtiment (facturé HT, avoirs déduits, brouillons exclus), mis à jour le ${reel.calculeLe.toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}. Ce que rapporte une agence active = moyenne des mois où elle tourne, de ${periode(reel.mois)}.` : "La passerelle de STC Bâtiment n'a encore rien déposé : le chiffre d'affaires d'une agence est à régler."}</div>
            {reel ? null : (
              <label className="flex items-center gap-3">
                <span className="flex-1 text-[13px]">Chiffre d'affaires d'une agence cliente</span>
                <span className="w-[130px]"><Champ inputMode="numeric" value={saisie.caParClient} onChange={(e) => setSaisie((x) => ({ ...x, caParClient: e.target.value }))} aria-label="Chiffre d'affaires d'une agence cliente" /></span>
                <span className="w-[70px] text-[13px] text-[#6B6B70]">€ par mois</span>
              </label>
            )}
            {reel ? <>
              <div className="mt-2 border-t-[0.5px] border-[#E6E6EA] pt-3 text-[13px] font-medium">Une agence est active si, sur les 30 derniers jours :</div>
              {([["factureMin", "Facturé au moins", "€"], ["osMin", "OS envoyés au moins", "OS"], ["chutePct", "Et au moins, des OS du mois d'avant", "%"]] as [keyof Saisie, string, string][]).map(([cle, titre, unite]) => (
                <label key={cle} className="flex items-center gap-3">
                  <span className="flex-1 text-[13px]">{titre}</span>
                  <span className="w-[130px]"><Champ inputMode="numeric" value={saisie[cle]} onChange={(e) => setSaisie((x) => ({ ...x, [cle]: e.target.value }))} aria-label={titre} /></span>
                  <span className="w-[70px] text-[13px] text-[#6B6B70]">{unite}</span>
                </label>
              ))}
              <div className="text-[12px] text-[#8E8E93]">La chute n'est jugée que pour les agences qui avaient envoyé au moins 4 OS le mois d'avant.</div>
            </> : null}
          </>}
          {erreur ? <div className="text-[12px] text-alerte">{erreur}</div> : null}
        </div>
        <div className={PIED_FENETRE}>
          <button type="button" className={PILULE_CLAIRE} onClick={onFermer}>Annuler</button>
          <button type="submit" className={PILULE_NOIRE}>Enregistrer</button>
        </div>
      </form>
    </div>
  )
}
