// ════════════════════════════════════════════════════════════════════════════
// ANALYSE IA · MON ENTRAÎNEMENT (07/11/2026, maquette validée par Mahdi : « chaque commercial peut
// aller là-bas pour analyser ses points forts, ses points faibles », « un vrai feedback de où en est
// son démarchage et comment s'améliorer »).
//
// Rien que SES appels analysés, comparés à toute l'équipe sur la même période (style courtier de la
// page Aujourd'hui) : le bandeau de ses chiffres, ses points forts et ses points à travailler (tirés de
// ses derniers appels), ses objections avec la réponse qui a marché chez nous, et l'appel à réécouter.
// Les calculs sont dans demarchage/analyseOutils.ts (`entrainement`, testé).
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Sparkles } from "lucide-react"
import { accordIa, type AppelIa } from "../../demarchage/appelsIa"
import { entrainement, pourcent } from "../../demarchage/analyseOutils"
import { dateCourte } from "../../demarchage/agencesOutils"
import { dateHeureCourte } from "../../demarchage/sessionOutils"
import { Bouton } from "../../ui"
import { Bandeau, Bloc, Table, Variation } from "./aujourdhui/courtier"

const pts = (t: number | null) => (t == null ? 0 : Math.round(t * 100))
const compare = (moi: number | null, equipe: number | null) => (moi == null || equipe == null ? null : <span className="flex flex-col whitespace-nowrap leading-4"><Variation n={pts(moi)} avant={pts(equipe)} unite="pts" /><span className="text-colonne text-encre-2">équipe {pourcent(equipe)}</span></span>)
const valeur = (v: string | number) => <span className="whitespace-nowrap">{v}</span>
/** Un texte long dans une case de tableau : il passe à la ligne au lieu d'être coupé. */
const Long = ({ children, className = "" }: { children: ReactNode; className?: string }) => <span className={`block whitespace-normal py-2 leading-[1.45] ${className}`}>{children}</span>

export default function MonEntrainement({ appels, nom, de, a, onLireTranscription }: { appels: AppelIa[]; nom: string; de: Date; a: Date; onLireTranscription: (t: string) => void }) {
  const e = useMemo(() => entrainement(appels, nom), [appels, nom])
  const [accord, setAccord] = useState<{ cle: string; v: { compares: number; accords: number } | null } | null>(null)
  const cle = `${nom}|${de.toISOString()}|${a.toISOString()}`
  useEffect(() => {
    let vivant = true
    accordIa(nom, de, a).then((v) => { if (vivant) setAccord({ cle, v }) }).catch(() => {})
    return () => { vivant = false }
  }, [nom, de, a, cle])
  const acc = accord?.cle === cle ? accord.v : null

  if (!e.appels) return <p className="py-10 text-center text-legende text-encre-2">Aucun appel de {nom} analysé sur la période.</p>

  return (
    <div className="@container space-y-10">
      <Bandeau cases={[
        { libelle: "Appels analysés", valeur: e.appels },
        { libelle: "Aboutis", title: "Intéressé ou RDV", valeur: valeur(pourcent(e.taux)), variation: compare(e.taux, e.tauxEquipe) },
        { libelle: "Gestionnaire eu", title: "Un décideur en ligne, selon l'IA", valeur: e.jointsConfirmes, variation: <span className="chiffres flex flex-col leading-4 text-colonne text-encre-2"><span>sur {e.jointsNotes}</span><span>notés « joint »</span></span> },
        { libelle: "Objections levées", valeur: valeur(pourcent(e.tauxLevee)), ton: e.tauxLevee != null && e.tauxLeveeEquipe != null && e.tauxLevee < e.tauxLeveeEquipe ? "text-alerte" : undefined, variation: compare(e.tauxLevee, e.tauxLeveeEquipe) },
        { libelle: "Agences chaudes", valeur: e.chaudes, ton: e.chaudes ? "text-ok" : undefined, title: "Intérêt fort selon l'IA", variation: e.chaudesStandard ? <span className="chiffres flex flex-col leading-4 text-colonne text-attention"><span>dont {e.chaudesStandard}</span><span>notée{e.chaudesStandard > 1 ? "s" : ""} « standard »</span></span> : undefined },
        { libelle: "Accord avec l'IA", title: "Sa proposition au raccroché contre le résultat que tu as noté", valeur: acc ? valeur(pourcent(acc.accords / acc.compares)) : "—", variation: <span className="chiffres flex flex-col leading-4 text-colonne text-encre-2">{acc ? <><span>{acc.accords} sur</span><span>{acc.compares} appels</span></> : <><span>dès les premiers</span><span>appels proposés</span></>}</span> },
      ]} />

      <div className="grid gap-x-10 gap-y-10 @min-[1100px]:grid-cols-2">
        <Bloc titre="Mes points forts" droite={<span className="text-colonne text-encre-2">tirés de mes derniers appels</span>}>
          <Table colonnes={[{ titre: "Point fort" }, { titre: "Appel", largeur: "30%" }]} vide="Rien encore."
            lignes={e.pointsForts.map((r) => ({ cle: r.texte, cellules: [<Long>{r.texte}</Long>, <Long className="text-encre-2">{r.agence} · {dateCourte(r.date)}</Long>] }))} />
        </Bloc>
        <Bloc titre="Mes points à travailler" droite={<span className="text-colonne text-encre-2">un à la fois : le premier d'abord</span>}>
          <Table colonnes={[{ titre: "À travailler" }, { titre: "Appel", largeur: "30%" }]} vide="Rien à signaler."
            lignes={e.aTravailler.map((r, i) => ({ cle: r.texte, cellules: [<Long className={i === 0 ? "font-medium" : ""}>{r.texte}</Long>, <Long className="text-encre-2">{r.agence} · {dateCourte(r.date)}</Long>] }))} />
        </Bloc>
      </div>

      {e.aReecouter ? (
        <Bloc titre="L'appel à réécouter" droite={<span className="text-colonne text-encre-2">une occasion restée ouverte</span>}>
          <div className="mt-3 grid gap-6 @min-[1100px]:grid-cols-2">
            <div className="min-w-0">
              <p className="text-legende font-medium text-encre">{e.aReecouter.agenceNom} · {dateHeureCourte(e.aReecouter.creeLe)} · intérêt {e.aReecouter.interet === "fort" ? "fort" : "moyen"}</p>
              <p className="mt-1 whitespace-pre-line text-legende text-encre-2">{e.aReecouter.resume}</p>
              {e.aReecouter.transcription ? <Bouton className="mt-3" taille="sm" icone={<Sparkles />} onClick={() => onLireTranscription(e.aReecouter!.transcription)}>Lire l'appel</Bouton> : null}
            </div>
            <div className="space-y-3">
              {e.aReecouter.analyse!.objections.filter((o) => !o.levee).slice(0, 2).map((o, i) => (
                <blockquote key={i} className="border-l-2 border-signature/50 pl-3 text-legende text-encre">
                  {o.extrait}
                  <span className="mt-1 block text-encre-2">{o.libelle} · {o.reponse ? `ta réponse : « ${o.reponse} »` : "pas de réponse"} · restée ouverte</span>
                </blockquote>
              ))}
            </div>
          </div>
        </Bloc>
      ) : null}

      <Bloc titre="Mes objections" compte={e.objections} droite={<span className="text-colonne text-encre-2">et la réponse qui a marché chez nous</span>}>
        <Table colonnes={[{ titre: "Objection" }, { titre: "Entendue", largeur: "84px", droite: true }, { titre: "Levée", largeur: "64px", droite: true }, { titre: "Équipe", largeur: "72px", droite: true }, { titre: "La réponse qui a marché", largeur: "46%" }]}
          vide="Aucune objection entendue."
          lignes={e.objectionsPerso.map((o) => ({ cle: o.libelle, cellules: [
            <Long className="font-medium">{o.libelle}</Long>, o.entendues,
            <span className={o.levees ? "" : "text-alerte"}>{o.levees}</span>,
            <span className="text-encre-2">{pourcent(o.tauxEquipe)}</span>,
            <Long className="text-encre-2">{o.reponse || "pas encore de réponse qui a marché"}</Long>,
          ] }))} />
      </Bloc>
    </div>
  )
}
