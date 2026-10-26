// ════════════════════════════════════════════════════════════════════════════
// RÉGLAGES › OBJECTIFS ET RÈGLES — l'objectif mensuel, le script d'appel, et
// TOUS les réglages des règles du démarchage (14/10/2026).
//
// Les réglages des règles, leurs bornes et leurs valeurs par défaut viennent de
// la base (`reglages_demarchage()`) : cet écran n'en connaît aucun. Ce qu'on
// enregistre ici, la base et tous les écrans l'appliquent aussitôt.
// Un seul bouton « Enregistrer », grisé tant que rien n'a changé.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react"
import { Save } from "lucide-react"
import { ecrireParametre, lireParametre } from "../../lib/parametresDb"
import { chargerDefinitionsReglages, oublierReglages, TEXTES_REGLAGES, type CleReglage, type DefinitionReglage } from "../../demarchage/reglages"
import { supabaseConfigure } from "../../lib/supabase"
import { Bandeau, Bouton, Carte, Champ, Chargement, Etiquette, TitreCarte, Zone } from "../../ui"

// Les clés lues par le tableau de bord et les sessions de call.
const CLE_OBJECTIF = "objectif_os_mensuel"
const CLE_SCRIPT = "script_appel"

type Valeurs = { objectif: string; script: string; regles: Record<CleReglage, string> }
const memes = (a: Valeurs, b: Valeurs) =>
  a.objectif === b.objectif && a.script === b.script && TEXTES_REGLAGES.every((t) => a.regles[t.cle] === b.regles[t.cle])

function valider(v: Valeurs, defs: Map<CleReglage, DefinitionReglage>): string[] {
  const e: string[] = []
  const objectif = Number(v.objectif)
  if (v.objectif.trim() === "" || !Number.isInteger(objectif) || objectif < 0) e.push("L'objectif mensuel doit être un nombre entier (0 si tu ne veux pas d'objectif).")
  for (const t of TEXTES_REGLAGES) {
    const d = defs.get(t.cle)
    const n = Number(v.regles[t.cle])
    if (d && (v.regles[t.cle].trim() === "" || !Number.isInteger(n) || n < d.mini || n > d.maxi)) e.push(`« ${t.titre} » : entre ${d.mini} et ${d.maxi} ${t.unite}.`)
  }
  return e
}

/** Réglages (24/10/2026) : « Objectif et règles d'appel » et « Script d'appel » sont deux pages ;
 *  le bouton « Enregistrer » de chacune écrit ce qui a changé. Sans `partie`, tout s'affiche. */
export default function ObjectifsReglage({ partie }: { partie?: "regles" | "script" } = {}) {
  const montrerRegles = partie !== "script"
  const montrerScript = partie !== "regles"
  // `origine` = ce que la base sait ; `brouillon` = ce que l'écran montre.
  const [origine, setOrigine] = useState<Valeurs | null>(null)
  const [brouillon, setBrouillon] = useState<Valeurs | null>(null)
  const [defs, setDefs] = useState<Map<CleReglage, DefinitionReglage>>(() => new Map())
  const [chargement, setChargement] = useState(supabaseConfigure)
  const [erreurs, setErreurs] = useState<string[]>(supabaseConfigure ? [] : ["Base non configurée."])
  const [enreg, setEnreg] = useState(false)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    if (!supabaseConfigure) return
    Promise.all([lireParametre(CLE_OBJECTIF), lireParametre(CLE_SCRIPT), chargerDefinitionsReglages()])
      .then(([objectif, script, d]) => {
        const parCle = new Map(d.map((x) => [x.cle, x]))
        const regles = Object.fromEntries(TEXTES_REGLAGES.map((t) => [t.cle, String(parCle.get(t.cle)?.valeur ?? "")])) as Record<CleReglage, string>
        const v: Valeurs = { objectif: objectif ?? "0", script: script ?? "", regles }
        setDefs(parCle)
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

  const set = (k: "objectif" | "script", v: string) => {
    setBrouillon((prev) => (prev ? { ...prev, [k]: v } : prev))
    setOk(false)
  }
  const setRegle = (k: CleReglage, v: string) => {
    setBrouillon((prev) => (prev ? { ...prev, regles: { ...prev.regles, [k]: v } } : prev))
    setOk(false)
  }

  async function enregistrer() {
    if (!brouillon || !origine) return
    const e = valider(brouillon, defs)
    setErreurs(e)
    if (e.length) return
    setEnreg(true)
    try {
      const regles = Object.fromEntries(TEXTES_REGLAGES.map((t) => [t.cle, String(Number(brouillon.regles[t.cle]))])) as Record<CleReglage, string>
      const propre: Valeurs = { objectif: String(Number(brouillon.objectif)), script: brouillon.script.trim(), regles }
      // On n'écrit que ce qui a changé.
      if (propre.objectif !== origine.objectif) await ecrireParametre(CLE_OBJECTIF, propre.objectif)
      if (propre.script !== origine.script) await ecrireParametre(CLE_SCRIPT, propre.script)
      for (const t of TEXTES_REGLAGES) if (propre.regles[t.cle] !== origine.regles[t.cle]) await ecrireParametre(t.cle, propre.regles[t.cle])
      oublierReglages() // tous les écrans ouverts relisent
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
        {partie === "script"
          ? "Ce que l'on dit au téléphone, affiché pendant chaque appel. Ce qui est enregistré ici s'applique aussitôt, pour tout le monde."
          : partie === "regles"
            ? "Ce que vise le démarchage chaque mois, et toutes les règles des appels. Ce qui est enregistré ici s'applique aussitôt, pour tout le monde."
            : "Ce que vise le démarchage chaque mois, ce que l'on dit au téléphone, et toutes les règles des appels. Ce qui est enregistré ici s'applique aussitôt, pour tout le monde."}
      </p>
      {erreurs.length ? <Bandeau role="alerte">{erreurs.join(" ")}</Bandeau> : null}
      {ok ? <Bandeau role="ok">Enregistré.</Bandeau> : null}

      {montrerRegles ? <Carte>
        <TitreCarte>Objectif du mois</TitreCarte>
        <div className="px-5 pb-5">
          <Etiquette texte="Premiers ordres de service visés par mois" aide="Le tableau de bord et l'écran Aujourd'hui comparent ce chiffre à ce qui est fait. 0 = pas d'objectif affiché.">
            <Champ type="number" min={0} step={1} value={brouillon.objectif} onChange={(e) => set("objectif", e.target.value)} className="chiffres max-w-[160px]" />
          </Etiquette>
        </div>
      </Carte> : null}

      {montrerScript ? <Carte>
        <TitreCarte>Script d'appel</TitreCarte>
        <div className="px-5 pb-5">
          <Etiquette texte="Le texte affiché pendant un appel, dans Sessions de call" aide="L'accroche, les deux questions à poser, la réponse aux objections. Écris-le comme tu le dis à voix haute : il est fait pour être lu en parlant.">
            <Zone rows={10} value={brouillon.script} onChange={(e) => set("script", e.target.value)} placeholder="Bonjour, STC Bâtiment, je cherche le gestionnaire locatif…" />
          </Etiquette>
        </div>
      </Carte> : null}

      {montrerRegles ? <Carte>
        <TitreCarte>Les règles des appels</TitreCarte>
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 px-5 pb-5 sm:grid-cols-2">
          {TEXTES_REGLAGES.map((t) => {
            const d = defs.get(t.cle)
            return (
              <Etiquette key={t.cle} texte={`${t.titre} (${t.unite})`} aide={`${t.aide}${d ? ` Par défaut : ${d.defaut} ${t.unite}.` : ""}`}>
                <Champ type="number" min={d?.mini} max={d?.maxi} step={1} value={brouillon.regles[t.cle]} onChange={(e) => setRegle(t.cle, e.target.value)} className="chiffres max-w-[160px]" />
              </Etiquette>
            )
          })}
        </div>
      </Carte> : null}

      <div className="flex items-center justify-end gap-3">
        {modifie ? <span className="text-legende text-encre-2">Des changements ne sont pas enregistrés.</span> : null}
        <Bouton variante="plein" icone={<Save />} chargement={enreg} disabled={!modifie} onClick={enregistrer}>Enregistrer</Bouton>
      </div>
    </div>
  )
}
