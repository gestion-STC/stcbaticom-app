// « M'envoyer un essai » (Mahdi, 10/11/2026) : voir le vrai mail ou le vrai SMS sans toucher à aucun contact ni à la campagne.
import { useState } from "react"
import { Send } from "lucide-react"
import { Bouton, Champ } from "../../../ui"
import { useSession } from "../../../lib/auth"
import { envoyerEssaiMail, envoyerEssaiSms, testerArrivee } from "../../../lib/essaiCampagne"
import { essaiMail, essaiSms, type ValeursEssai } from "../../../prospection/apercuMail"
import type { ConfigCampagne, Creatif } from "../../../prospection/configCampagne"
import { appliquerIA } from "../../../prospection/ia"
import { essayerIA } from "../../../lib/campagnesIa"

export default function EssaiCreatif({ k, cfg, exemple, baseId, campagneNom, campagne }: { k: Creatif; cfg: ConfigCampagne; exemple?: ValeursEssai; baseId: string; campagneNom: string; campagne: { id: string; nom: string; rythme: { jours: number[]; heureMin: number; heureMax: number } } }) {
  const [adresses, setAdresses] = useState("")
  const [arrivee, setArrivee] = useState("")
  const session = useSession()
  const sms = k.type === "sms"
  const [saisie, setAdresse] = useState<string | null>(null)
  const adresse = saisie ?? (sms ? "" : session?.user?.email ?? "")
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
        else {
          let corps = v.corps
          if (k.ia?.actif) { const x = await essayerIA({ baseId, campagneNom: campagneNom || "Campagne", objet: v.objet, corps: v.corps, ia: k.ia, nombre: 1 }); corps = appliquerIA(v.corps, k.ia.mode, x.lignes[0]?.texte ?? "") }
          const m = essaiMail(v.objet, corps, marque, bouton, prospection, exemple, { signature: cfg.garde.signature, libelleLien: cfg.garde.libelleLien }); await envoyerEssaiMail(adresse.trim(), m.objet, m.html)
        }
      }
      setEtat(`Envoyé à ${adresse.trim()}${k.variantes.length > 1 ? ` (${k.variantes.length} versions)` : ""}.`)
    } catch (e) { setErreur(e instanceof Error ? e.message : String(e)) } finally { setOccupe(false) }
  }
  const tester = async () => {
    setOccupe(true); setArrivee(""); setErreur("")
    try { const v = k.variantes[0]; await testerArrivee({ campagne: { id: campagne.id, nom: campagne.nom || "Essai", baseId, rythme: campagne.rythme }, adresses: adresses.split(/[\s,;]+/).filter(Boolean), objet: v.objet, corps: v.corps, varianteId: v.id }); setArrivee("Demandé. Regarde dans quel dossier il arrive : principal, promotions ou spam. L'envoi part dans les heures d'envoi de la campagne.") } catch (e) { setErreur(e instanceof Error ? e.message : String(e)) } finally { setOccupe(false) }
  }
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2"><span className="min-w-[180px] flex-1"><Champ value={adresse} placeholder={sms ? "Mon mobile" : "Mon adresse"} aria-label={sms ? "Mobile pour l'essai" : "Adresse pour l'essai"} onChange={(e) => setAdresse(e.target.value)} /></span><Bouton icone={<Send />} chargement={occupe} disabled={!adresse.trim() || vides} title={vides ? "Un texte est vide" : undefined} onClick={() => void envoyer()}>M'envoyer un essai</Bouton></div>
      {etat ? <p className="text-colonne text-ok">{etat}</p> : null}
      {erreur ? <p className="text-colonne text-alerte">{erreur}</p> : null}
      <p className="text-colonne text-encre-2">Aucun contact n'est touché et la campagne ne bouge pas.</p>
      {k.type === "mail" && prospection ? <div className="space-y-2 border-t-[0.5px] border-trait pt-3"><p className="text-legende font-medium">Tester l'arrivée en boîte</p><div className="flex flex-wrap gap-2"><span className="min-w-[180px] flex-1"><Champ value={adresses} placeholder="Tes adresses Gmail, Outlook…" aria-label="Adresses pour tester l'arrivée" onChange={(e) => setAdresses(e.target.value)} /></span><Bouton chargement={occupe} disabled={!adresses.trim() || vides} onClick={() => void tester()}>Tester</Bouton></div><p className="text-colonne text-encre-2">Le vrai mail part par les vraies boîtes d'envoi, 5 adresses au plus.</p>{arrivee ? <p className="text-colonne text-ok">{arrivee}</p> : null}</div> : null}
    </div>
  )
}
