// ════════════════════════════════════════════════════════════════════════════
// RÉGLAGES → ONGLET « RECRUTEMENT » — tout ce qui règle la machine
//
// Mahdi, 08/10/2026 : l'écran « Machine » ne garde que l'interrupteur et les
// campagnes par corps de métier. Tout le reste (volumes, cadences, plages,
// relances, alertes, adresses, liste d'exclusion) vit ici. Un seul bouton
// « Enregistrer », grisé tant que rien n'a changé ; la validation se fait
// dans `lib/reglagesRecrutement.ts`, sans navigateur.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState, type ReactNode } from "react"
import { Save } from "lucide-react"
import type { PilotageST, SequenceST } from "../../recrutement"
import { supabaseConfigure } from "../../lib/supabase"
import { chargerPilotage, majPilotage } from "../../lib/pilotageStDb"
import { chargerSequences } from "../../lib/sequencesStDb"
import { CADENCE_MAX_MS, CADENCE_MIN_MS, DOMAINE_ENVOI, JOURS_SEMAINE, extraireReglages, ligneEtatMachine, memesReglages, validerReglages } from "../../lib/reglagesRecrutement"
import { Bandeau, Bouton, Carte, Case, Champ, Chargement, Etiquette, Pastille, Selecteur, TitreCarte } from "../../ui"
import ExclusionsST from "./ExclusionsST"

/** Un champ numérique contrôlé : vidé à l'écran = NaN, que la validation refuse (jamais un 0 glissé en douce). */
function Nombre({ texte, aide, valeur, onChange, min, max }: { texte: string; aide?: ReactNode; valeur: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <Etiquette texte={texte} aide={aide}>
      <Champ
        type="number"
        min={min}
        max={max}
        value={Number.isNaN(valeur) ? "" : valeur}
        onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))}
        className="chiffres"
      />
    </Etiquette>
  )
}

/** Une carte de réglages : titre, phrase d'explication, puis les champs. */
function Bloc({ titre, explication, children }: { titre: string; explication: ReactNode; children: ReactNode }) {
  return (
    <Carte>
      <TitreCarte>{titre}</TitreCarte>
      <div className="space-y-4 px-5 pb-5">
        <p className="text-legende text-encre-2">{explication}</p>
        {children}
      </div>
    </Carte>
  )
}

const AIDE_CADENCE_EMAIL = "Entre " + CADENCE_MIN_MS + " et " + CADENCE_MAX_MS + " ms ; 700 ms = un peu plus d'un e-mail par seconde."
const AIDE_CADENCE_SMS = "Entre " + CADENCE_MIN_MS + " et " + CADENCE_MAX_MS + " ms ; 3 000 ms = un SMS toutes les 3 secondes."
const AIDE_ADRESSE_ENVOI = "Sur le domaine " + DOMAINE_ENVOI + " ; les réponses arrivent dans la boîte de réception du recrutement."

export default function ReglagesRecrutement() {
  // `origine` = ce que la base sait ; `brouillon` = ce que l'écran montre.
  const [origine, setOrigine] = useState<PilotageST | null>(null)
  const [brouillon, setBrouillon] = useState<PilotageST | null>(null)
  const [sequences, setSequences] = useState<SequenceST[]>([])
  const [chargement, setChargement] = useState(!!supabaseConfigure)
  const [erreurs, setErreurs] = useState<string[]>(supabaseConfigure ? [] : ["Base non configurée."])
  const [enreg, setEnreg] = useState(false)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    if (!supabaseConfigure) return
    Promise.all([chargerPilotage(), chargerSequences()])
      .then(([p, seqs]) => {
        setOrigine(p)
        setBrouillon(p)
        setSequences(seqs)
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

  const set = <K extends keyof PilotageST>(k: K, v: PilotageST[K]) => {
    setBrouillon((prev) => (prev ? { ...prev, [k]: v } : prev))
    setOk(false)
  }

  function basculerJour(n: number) {
    if (!brouillon) return
    const s = new Set(brouillon.jours)
    if (s.has(n)) s.delete(n)
    else s.add(n)
    set("jours", [...s].sort((a, b) => a - b))
  }

  async function enregistrer() {
    if (!brouillon) return
    const e = validerReglages(brouillon)
    setErreurs(e)
    if (e.length) return
    setEnreg(true)
    try {
      // Seuls les champs de l'onglet partent : jamais l'interrupteur.
      await majPilotage(extraireReglages(brouillon))
      setOrigine(brouillon)
      setOk(true)
    } catch (err) {
      setErreurs([err instanceof Error ? err.message : String(err)])
    } finally {
      setEnreg(false)
    }
  }

  if (chargement) return <Chargement />

  const modifie = !!(origine && brouillon) && !memesReglages(origine, brouillon)

  return (
    <div className="space-y-5">
      <p className="text-legende text-encre-2">
        Ces réglages disent à la machine de recrutement combien elle peut envoyer, à quelles heures, comment elle relance un artisan
        qui ne répond pas, et qui elle prévient quand ça se passe mal. L'interrupteur marche/arrêt et les campagnes par corps de
        métier restent sur l'écran Machine.
      </p>

      {origine ? (
        <div className="flex flex-wrap items-center gap-3">
          <Pastille role={origine.actif ? "fait" : "inerte"} point>{origine.actif ? "En marche" : "À l'arrêt"}</Pastille>
          <span className="text-legende text-encre">{ligneEtatMachine(origine)}</span>
        </div>
      ) : null}

      {!brouillon ? (
        erreurs.length ? <Bandeau role="alerte">{erreurs.join(" ")}</Bandeau> : null
      ) : (
        <>
          <Bloc
            titre="Volumes et cadence"
            explication={
              <>
                Le plafond est une sécurité anti-spam : au-delà, la machine attend le lendemain. La cadence est le temps entre deux envois
                d'un même passage : Resend accepte environ 2 envois par seconde, Ringover beaucoup moins — en août 2026, 131 SMS ont été
                refusés « trop rapprochés ».
              </>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Nombre texte="Plafond d'e-mails par jour" valeur={brouillon.plafondJour} onChange={(v) => set("plafondJour", v)} min={1} />
              <Nombre texte="Plafond de SMS par jour" valeur={brouillon.plafondSmsJour} onChange={(v) => set("plafondSmsJour", v)} min={1} />
              <Nombre texte="Cadence e-mail (ms)" aide={AIDE_CADENCE_EMAIL} valeur={brouillon.cadenceEmailMs} onChange={(v) => set("cadenceEmailMs", v)} min={CADENCE_MIN_MS} max={CADENCE_MAX_MS} />
              <Nombre texte="Cadence SMS (ms)" aide={AIDE_CADENCE_SMS} valeur={brouillon.cadenceSmsMs} onChange={(v) => set("cadenceSmsMs", v)} min={CADENCE_MIN_MS} max={CADENCE_MAX_MS} />
            </div>
          </Bloc>

          <Bloc titre="Plages d'envoi" explication="La machine n'écrit que ces jours-là, dans ces heures-là. Les SMS ont leur propre plage, plus courte : un SMS à 8 h du matin agace.">
            <div>
              <span className="mb-2 block text-legende font-medium text-encre">Jours d'envoi</span>
              <div className="flex flex-wrap gap-4">
                {JOURS_SEMAINE.map((j) => (
                  <Case key={j.n} texte={j.court} title={j.long} checked={brouillon.jours.includes(j.n)} onChange={() => basculerJour(j.n)} />
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid grid-cols-2 gap-3">
                <Etiquette texte="E-mails, de"><Champ type="time" value={brouillon.heureMin} onChange={(e) => set("heureMin", e.target.value)} /></Etiquette>
                <Etiquette texte="à"><Champ type="time" value={brouillon.heureMax} onChange={(e) => set("heureMax", e.target.value)} /></Etiquette>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Etiquette texte="SMS, de"><Champ type="time" value={brouillon.heureMinSms} onChange={(e) => set("heureMinSms", e.target.value)} /></Etiquette>
                <Etiquette texte="à"><Champ type="time" value={brouillon.heureMaxSms} onChange={(e) => set("heureMaxSms", e.target.value)} /></Etiquette>
              </div>
            </div>
          </Bloc>

          <Bloc titre="Relances et reprise" explication="Comment la machine insiste quand un envoi échoue, à quel rythme elle revient vers un même artisan, et ce qu'elle fait des étapes restées en retard.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Nombre texte="Tentatives maximum par envoi" aide="Une erreur est rejouée 15 min, 1 h puis 4 h plus tard ; au-delà, l'étape est abandonnée." valeur={brouillon.tentativesMax} onChange={(v) => set("tentativesMax", v)} min={1} max={10} />
              <Nombre texte="Délai minimum entre deux touches (heures)" aide="E-mail ou SMS confondus, à un même artisan. 48 h = jamais deux messages le même jour." valeur={brouillon.delaiMinTouchesH} onChange={(v) => set("delaiMinTouchesH", v)} min={0} max={720} />
              <Nombre texte="Abandonner les étapes en retard de plus de (jours)" aide="Une étape qui aurait dû partir il y a plus longtemps que ça est sautée, pas envoyée hors de propos." valeur={brouillon.abandonApresJours} onChange={(v) => set("abandonApresJours", v)} min={1} max={365} />
            </div>
            <div>
              <Case texte="Recaler les calendriers au redémarrage" checked={brouillon.recalerAuDemarrage} onChange={(e) => set("recalerAuDemarrage", e.target.checked)} />
              <p className="mt-1 text-colonne text-encre-2">
                Sans ça, après un arrêt de plusieurs jours, toutes les relances en retard tombent d'un coup au redémarrage. Avec, chaque fiche
                reprend là où elle en était, avec les écarts prévus par sa séquence.
              </p>
            </div>
          </Bloc>

          <Bloc titre="Alertes" explication="Qui prévenir, et à partir de quand. Au-delà du seuil, un e-mail par jour, pas un par erreur.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Etiquette texte="E-mail d'alerte" aide="Vide = personne n'est prévenu.">
                <Champ type="email" value={brouillon.alerteEmail} onChange={(e) => set("alerteEmail", e.target.value)} placeholder="gestion@stcbatiment.fr" />
              </Etiquette>
              <Nombre texte="Seuil d'erreurs sur la journée (%)" aide="Part des envois du jour en erreur à partir de laquelle l'alerte part." valeur={brouillon.seuilErreursPct} onChange={(v) => set("seuilErreursPct", v)} min={1} max={100} />
            </div>
          </Bloc>

          <Bloc titre="Adresses" explication="D'où partent les messages, où arrivent les essais, et quelle séquence démarre les nouvelles fiches.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Etiquette texte="Adresse d'envoi" aide={AIDE_ADRESSE_ENVOI}>
                <Champ type="email" value={brouillon.adresseEnvoi} onChange={(e) => set("adresseEnvoi", e.target.value)} placeholder={"recrutement@" + DOMAINE_ENVOI} />
              </Etiquette>
              <Etiquette texte="Adresse de test" aide="Reçoit les e-mails d'essai envoyés depuis l'écran Séquences.">
                <Champ type="email" value={brouillon.emailTest} onChange={(e) => set("emailTest", e.target.value)} placeholder="vous@stcbatiment.fr" />
              </Etiquette>
              <Etiquette texte="Séquence par défaut" aide={"Celle que la machine donne aux fiches qu'elle démarre. Le message s'adapte au métier grâce à la variable {{metier}}."} className="sm:col-span-2">
                <Selecteur value={brouillon.sequenceId ?? ""} onChange={(e) => set("sequenceId", e.target.value || null)}>
                  <option value="">La séquence marquée « utilisée » dans l'écran Séquences</option>
                  {sequences.map((s) => (
                    <option key={s.id} value={s.id}>{s.nom}{s.actif ? " (utilisée)" : ""}</option>
                  ))}
                </Selecteur>
              </Etiquette>
            </div>
          </Bloc>

          {erreurs.length ? (
            <Bandeau role="alerte">
              <ul className="list-disc space-y-0.5 pl-4">
                {erreurs.map((e) => <li key={e}>{e}</li>)}
              </ul>
            </Bandeau>
          ) : null}
          {ok ? <Bandeau role="ok">Réglages enregistrés. La machine les applique dès son prochain passage.</Bandeau> : null}

          <div className="flex items-center justify-end gap-3">
            {modifie && !enreg ? <span className="text-colonne text-encre-2">Des changements ne sont pas enregistrés.</span> : null}
            <Bouton variante="plein" icone={<Save />} disabled={!modifie} chargement={enreg} onClick={enregistrer}>Enregistrer</Bouton>
          </div>
        </>
      )}

      <ExclusionsST />
    </div>
  )
}
