// ════════════════════════════════════════════════════════════════════════════
// RÉGLAGES › OBJECTIFS ET SCRIPT — les trois réglages du démarchage, lus et
// écrits dans `parametres` : l'objectif mensuel d'ordres de service, le script
// d'appel, le seuil d'appels par jour et par numéro. Un seul bouton
// « Enregistrer », grisé tant que rien n'a changé.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react"
import { Save } from "lucide-react"
import { ecrireParametre, lireParametre } from "../../lib/parametresDb"
import { supabaseConfigure } from "../../lib/supabase"
import { Bandeau, Bouton, Carte, Champ, Chargement, Etiquette, TitreCarte, Zone } from "../../ui"

// Les clés, les mêmes que celles lues par le tableau de bord, les sessions de call et les numéros d'appel.
const CLE_OBJECTIF = "objectif_os_mensuel"
const CLE_SCRIPT = "script_appel"
const CLE_QUOTA = "quota_appels_jour"
const QUOTA_MIN = 10
const QUOTA_MAX = 500

type Valeurs = { objectif: string; script: string; quota: string }
const memes = (a: Valeurs, b: Valeurs) => a.objectif === b.objectif && a.script === b.script && a.quota === b.quota

function valider(v: Valeurs): string[] {
  const e: string[] = []
  const objectif = Number(v.objectif)
  if (v.objectif.trim() === "" || !Number.isInteger(objectif) || objectif < 0) e.push("L'objectif mensuel doit être un nombre entier (0 si tu ne veux pas d'objectif).")
  const quota = Number(v.quota)
  if (v.quota.trim() === "" || !Number.isInteger(quota) || quota < QUOTA_MIN || quota > QUOTA_MAX) e.push(`Le seuil d'appels par jour doit être entre ${QUOTA_MIN} et ${QUOTA_MAX}.`)
  return e
}

export default function ObjectifsReglage() {
  // `origine` = ce que la base sait ; `brouillon` = ce que l'écran montre.
  const [origine, setOrigine] = useState<Valeurs | null>(null)
  const [brouillon, setBrouillon] = useState<Valeurs | null>(null)
  const [chargement, setChargement] = useState(supabaseConfigure)
  const [erreurs, setErreurs] = useState<string[]>(supabaseConfigure ? [] : ["Base non configurée."])
  const [enreg, setEnreg] = useState(false)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    if (!supabaseConfigure) return
    Promise.all([lireParametre(CLE_OBJECTIF), lireParametre(CLE_SCRIPT), lireParametre(CLE_QUOTA)])
      .then(([objectif, script, quota]) => {
        const v: Valeurs = { objectif: objectif ?? "0", script: script ?? "", quota: quota ?? "100" }
        setOrigine(v)
        setBrouillon(v)
      })
      .catch((e) => setErreurs([e instanceof Error ? e.message : String(e)]))
      .finally(() => setChargement(false))
  }, [])

  // Le bandeau « Enregistré » s'efface seul après 3 s.
  useEffect(() => {
    if (!ok) return
    const t = setTimeout(() => setOk(false), 3000)
    return () => clearTimeout(t)
  }, [ok])

  const set = (k: keyof Valeurs, v: string) => {
    setBrouillon((prev) => (prev ? { ...prev, [k]: v } : prev))
    setOk(false)
  }

  async function enregistrer() {
    if (!brouillon || !origine) return
    const e = valider(brouillon)
    setErreurs(e)
    if (e.length) return
    setEnreg(true)
    try {
      const propre: Valeurs = { objectif: String(Number(brouillon.objectif)), script: brouillon.script.trim(), quota: String(Number(brouillon.quota)) }
      // On n'écrit que ce qui a changé.
      if (propre.objectif !== origine.objectif) await ecrireParametre(CLE_OBJECTIF, propre.objectif)
      if (propre.script !== origine.script) await ecrireParametre(CLE_SCRIPT, propre.script)
      if (propre.quota !== origine.quota) await ecrireParametre(CLE_QUOTA, propre.quota)
      setOrigine(propre)
      setBrouillon(propre)
      setOk(true)
    } catch (err) {
      setErreurs([err instanceof Error ? err.message : String(err)])
    } finally {
      setEnreg(false)
    }
  }

  if (chargement) return <Chargement />
  if (!brouillon || !origine) return erreurs.length ? <Bandeau role="alerte">{erreurs.join(" ")}</Bandeau> : null
  const modifie = !memes(origine, brouillon)

  return (
    <div className="max-w-3xl space-y-5">
      <p className="text-legende text-encre-2">
        Ce que vise le démarchage chaque mois, ce que l'on dit au téléphone, et jusqu'où un numéro peut appeler dans la journée.
      </p>
      {erreurs.length ? <Bandeau role="alerte">{erreurs.join(" ")}</Bandeau> : null}
      {ok ? <Bandeau role="ok">Enregistré.</Bandeau> : null}

      <Carte>
        <TitreCarte>Objectif du mois</TitreCarte>
        <div className="px-5 pb-5">
          <Etiquette texte="Premiers ordres de service visés par mois" aide="Le tableau de bord et l'écran Aujourd'hui comparent ce chiffre à ce qui est fait. 0 = pas d'objectif affiché.">
            <Champ type="number" min={0} step={1} value={brouillon.objectif} onChange={(e) => set("objectif", e.target.value)} className="chiffres max-w-[160px]" />
          </Etiquette>
        </div>
      </Carte>

      <Carte>
        <TitreCarte>Script d'appel</TitreCarte>
        <div className="px-5 pb-5">
          <Etiquette texte="Le texte affiché pendant un appel, dans Sessions de call" aide="L'accroche, les deux questions à poser, la réponse aux objections. Écris-le comme tu le dis à voix haute : il est fait pour être lu en parlant.">
            <Zone rows={10} value={brouillon.script} onChange={(e) => set("script", e.target.value)} placeholder="Bonjour, STC Bâtiment, je cherche le gestionnaire locatif…" />
          </Etiquette>
        </div>
      </Carte>

      <Carte>
        <TitreCarte>Appels par jour et par numéro</TitreCarte>
        <div className="px-5 pb-5">
          <Etiquette texte="Seuil d'appels sortants par jour, pour chaque numéro d'émission" aide={`Au-delà, les opérateurs signalent le numéro « spam » et les agences décrochent moins. La jauge de l'onglet Numéros d'appel s'appuie sur ce seuil (entre ${QUOTA_MIN} et ${QUOTA_MAX} ; 100 est prudent).`}>
            <Champ type="number" min={QUOTA_MIN} max={QUOTA_MAX} step={1} value={brouillon.quota} onChange={(e) => set("quota", e.target.value)} className="chiffres max-w-[160px]" />
          </Etiquette>
        </div>
      </Carte>

      <div className="flex items-center justify-end gap-3">
        {modifie ? <span className="text-legende text-encre-2">Des changements ne sont pas enregistrés.</span> : null}
        <Bouton variante="plein" icone={<Save />} chargement={enreg} disabled={!modifie} onClick={enregistrer}>Enregistrer</Bouton>
      </div>
    </div>
  )
}
