// ════════════════════════════════════════════════════════════════════════════
// RÉGLAGES › OBJECTIFS ET SCRIPT — les trois réglages du démarchage, lus et
// écrits dans `parametres` : l'objectif mensuel d'ordres de service, le script
// d'appel, le seuil d'appels par jour et par numéro. Un seul bouton
// « Enregistrer », grisé tant que rien n'a changé.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react"
import { Save } from "lucide-react"
import { ecrireParametre, lireParametre } from "../../lib/parametresDb"
import { REPOS_JOURS, REPOS_STANDARD_JOURS } from "../../demarchage/sessionOutils"
import { supabaseConfigure } from "../../lib/supabase"
import { Bandeau, Bouton, Carte, Champ, Chargement, Etiquette, TitreCarte, Zone } from "../../ui"

// Les clés, les mêmes que celles lues par le tableau de bord, les sessions de call et les numéros d'appel.
const CLE_OBJECTIF = "objectif_os_mensuel"
const CLE_SCRIPT = "script_appel"
const CLE_QUOTA = "quota_appels_jour"
const CLE_RELANCE = "relance_interesse_jours" // lue aussi par la règle d'appel en base (appel_enregistrer) et par la session
const QUOTA_MIN = 10
const QUOTA_MAX = 500
const RELANCE_MIN = 1
const RELANCE_MAX = 365
const CLE_REPOS = "repos_appel_jours" // lue par la session de call au démarrage
const REPOS_MIN = 1
const REPOS_MAX = 60
const CLE_REPOS_STANDARD = "repos_standard_jours" // après un « standard » (14/10) : lu par la session et par la garde en base
const REPOS_STANDARD_MAX = 90

type Valeurs = { objectif: string; script: string; quota: string; relance: string; repos: string; reposStandard: string }
const memes = (a: Valeurs, b: Valeurs) => a.objectif === b.objectif && a.script === b.script && a.quota === b.quota && a.relance === b.relance && a.repos === b.repos && a.reposStandard === b.reposStandard

function valider(v: Valeurs): string[] {
  const e: string[] = []
  const objectif = Number(v.objectif)
  if (v.objectif.trim() === "" || !Number.isInteger(objectif) || objectif < 0) e.push("L'objectif mensuel doit être un nombre entier (0 si tu ne veux pas d'objectif).")
  const quota = Number(v.quota)
  if (v.quota.trim() === "" || !Number.isInteger(quota) || quota < QUOTA_MIN || quota > QUOTA_MAX) e.push(`Le seuil d'appels par jour doit être entre ${QUOTA_MIN} et ${QUOTA_MAX}.`)
  const relance = Number(v.relance)
  if (v.relance.trim() === "" || !Number.isInteger(relance) || relance < RELANCE_MIN || relance > RELANCE_MAX) e.push(`La relance des intéressés doit être entre ${RELANCE_MIN} et ${RELANCE_MAX} jours.`)
  const repos = Number(v.repos)
  if (v.repos.trim() === "" || !Number.isInteger(repos) || repos < REPOS_MIN || repos > REPOS_MAX) e.push(`Le repos entre deux appels doit être entre ${REPOS_MIN} et ${REPOS_MAX} jours.`)
  const rs = Number(v.reposStandard)
  if (v.reposStandard.trim() === "" || !Number.isInteger(rs) || rs < REPOS_MIN || rs > REPOS_STANDARD_MAX) e.push(`Le repos après un « standard » doit être entre ${REPOS_MIN} et ${REPOS_STANDARD_MAX} jours.`)
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
    Promise.all([lireParametre(CLE_OBJECTIF), lireParametre(CLE_SCRIPT), lireParametre(CLE_QUOTA), lireParametre(CLE_RELANCE), lireParametre(CLE_REPOS), lireParametre(CLE_REPOS_STANDARD)])
      .then(([objectif, script, quota, relance, repos, reposStandard]) => {
        const v: Valeurs = { objectif: objectif ?? "0", script: script ?? "", quota: quota ?? "100", relance: relance ?? "10", repos: repos ?? String(REPOS_JOURS), reposStandard: reposStandard ?? String(REPOS_STANDARD_JOURS) }
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
      const propre: Valeurs = { objectif: String(Number(brouillon.objectif)), script: brouillon.script.trim(), quota: String(Number(brouillon.quota)), relance: String(Number(brouillon.relance)), repos: String(Number(brouillon.repos)), reposStandard: String(Number(brouillon.reposStandard)) }
      // On n'écrit que ce qui a changé.
      if (propre.objectif !== origine.objectif) await ecrireParametre(CLE_OBJECTIF, propre.objectif)
      if (propre.script !== origine.script) await ecrireParametre(CLE_SCRIPT, propre.script)
      if (propre.quota !== origine.quota) await ecrireParametre(CLE_QUOTA, propre.quota)
      if (propre.relance !== origine.relance) await ecrireParametre(CLE_RELANCE, propre.relance)
      if (propre.repos !== origine.repos) await ecrireParametre(CLE_REPOS, propre.repos)
      if (propre.reposStandard !== origine.reposStandard) await ecrireParametre(CLE_REPOS_STANDARD, propre.reposStandard)
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
        Ce que vise le démarchage chaque mois, ce que l'on dit au téléphone, quand relancer une agence intéressée, combien de jours laisser une agence tranquille entre deux appels, et jusqu'où un numéro peut appeler dans la journée.
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
        <TitreCarte>Relance des intéressés</TitreCarte>
        <div className="px-5 pb-5">
          <Etiquette texte="Une agence « intéressée » revient dans « À rappeler aujourd'hui » au bout de… (jours)" aide="Après un appel conclu « intéressé », la tâche « Relancer » se pose à ce délai, à 10 h. 7 jours jusqu'ici ; 15 jours ou 30 jours laissent plus de temps à l'agence. Ne change pas les relances déjà posées.">
            <Champ type="number" min={RELANCE_MIN} max={RELANCE_MAX} step={1} value={brouillon.relance} onChange={(e) => set("relance", e.target.value)} className="chiffres max-w-[160px]" />
          </Etiquette>
        </div>
      </Carte>

      <Carte>
        <TitreCarte>Repos entre deux appels</TitreCarte>
        <div className="px-5 pb-5">
          <Etiquette texte="Une agence déjà appelée ne revient dans la session qu'au bout de… (jours)" aide="Pour ne pas appeler les mêmes numéros tous les jours : une agence appelée (et toute fiche au même standard) sort de « À prospecter » pendant ce délai. On peut toujours l'appeler par la recherche. Les rappels datés et les intéressés ne sont pas concernés : ils reviennent à leur date.">
            <Champ type="number" min={REPOS_MIN} max={REPOS_MAX} step={1} value={brouillon.repos} onChange={(e) => set("repos", e.target.value)} className="chiffres max-w-[160px]" />
          </Etiquette>
          <Etiquette className="mt-4" texte="Après « Standard, pas de gestionnaire » : l'agence ne revient qu'au bout de… (jours)" aide="Quelqu'un a décroché, mais pas le gestionnaire. Pour ne pas harceler l'accueil (et se faire barrer), l'agence sort de « À prospecter » plus longtemps qu'après une simple absence de réponse.">
            <Champ type="number" min={REPOS_MIN} max={REPOS_STANDARD_MAX} step={1} value={brouillon.reposStandard} onChange={(e) => set("reposStandard", e.target.value)} className="chiffres max-w-[160px]" />
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
