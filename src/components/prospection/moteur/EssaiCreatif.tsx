// « M'envoyer un essai » (Mahdi, 10/11/2026) : voir le vrai mail ou le vrai SMS sans toucher à aucun contact ni à la campagne.
import { useState } from "react"
import { Send } from "lucide-react"
import { Bouton, Champ } from "../../../ui"
import { useSession } from "../../../lib/auth"
import { envoyerEssaiMail, envoyerEssaiSms } from "../../../lib/essaiCampagne"
import { essaiMail, essaiSms, type ValeursEssai } from "../../../prospection/apercuMail"
import type { ConfigCampagne, Creatif } from "../../../prospection/configCampagne"

export default function EssaiCreatif({ k, cfg, exemple }: { k: Creatif; cfg: ConfigCampagne; exemple: ValeursEssai }) {
  const session = useSession()
  const sms = k.type === "sms"
  const [adresse, setAdresse] = useState(sms ? "" : session?.user?.email ?? "")
  const [occupe, setOccupe] = useState(false)
  const [etat, setEtat] = useState("")
  const [erreur, setErreur] = useState("")
  const vides = k.variantes.some((v) => !v.corps.trim())
  const vers = cfg.creatifs.find((x) => x.id === k.versId)
  const bouton = vers ? (k.video ? "Voir la vidéo" : vers.type === "formulaire" ? "Remplir le formulaire" : "En savoir plus") : ""
  const prospection = !cfg.creatifs.some((x) => x.type === "avis")
  const envoyer = async () => {
    setOccupe(true); setEtat(""); setErreur("")
    try {
      for (const v of k.variantes) {
        const marque = k.variantes.length > 1 ? `[ESSAI ${v.nom}] ` : "[ESSAI] "
        if (sms) await envoyerEssaiSms(adresse.trim(), essaiSms(v.corps, marque, exemple))
        else { const m = essaiMail(v.objet, v.corps, marque, bouton, prospection, exemple); await envoyerEssaiMail(adresse.trim(), m.objet, m.html) }
      }
      setEtat(`Envoyé à ${adresse.trim()}${k.variantes.length > 1 ? ` (${k.variantes.length} versions)` : ""}.`)
    } catch (e) { setErreur(e instanceof Error ? e.message : String(e)) } finally { setOccupe(false) }
  }
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2"><span className="min-w-[180px] flex-1"><Champ value={adresse} placeholder={sms ? "Mon mobile" : "Mon adresse"} aria-label={sms ? "Mobile pour l'essai" : "Adresse pour l'essai"} onChange={(e) => setAdresse(e.target.value)} /></span><Bouton icone={<Send />} chargement={occupe} disabled={!adresse.trim() || vides} title={vides ? "Un texte est vide" : undefined} onClick={() => void envoyer()}>M'envoyer un essai</Bouton></div>
      {etat ? <p className="text-colonne text-ok">{etat}</p> : null}
      {erreur ? <p className="text-colonne text-alerte">{erreur}</p> : null}
      <p className="text-colonne text-encre-2">Aucun contact n'est touché et la campagne ne bouge pas.</p>
    </div>
  )
}
