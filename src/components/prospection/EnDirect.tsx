// EN DIRECT (Mahdi, 11/11/2026) : « voir combien il y a de calls journaliers et par semaine, en direct ».
// Aujourd'hui et la semaine depuis lundi, heure par heure, et par personne. Se remet à jour toute seule chaque minute.
import { useEffect, useState } from "react"
import { Bandeau, Bloc, Chapitre, Table } from "../demarchage/aujourdhui/courtier"
import { fr } from "../demarchage/aujourdhui/outils"
import { calculerDirect, lundiDe, type Direct } from "../../lib/croissance"
import { chargerDirect } from "../../lib/croissanceDb"

const MINUTE = 60_000
const semaine = (n: number) => <span className="chiffres text-colonne text-encre-2">{fr(n)} cette semaine</span>

export default function EnDirect() {
  const [d, setD] = useState<Direct | null>(null)
  const [le, setLe] = useState<Date | null>(null)
  const [erreur, setErreur] = useState("")
  useEffect(() => {
    let vivant = true
    const lire = () => {
      const maintenant = new Date()
      chargerDirect(lundiDe(maintenant))
        .then((x) => { if (vivant) { setD(calculerDirect(x, maintenant)); setLe(maintenant); setErreur("") } })
        .catch((e) => { if (vivant) setErreur(e instanceof Error ? e.message : String(e)) })
    }
    lire()
    const t = setInterval(lire, MINUTE)
    return () => { vivant = false; clearInterval(t) }
  }, [])
  const heureCourante = le?.getHours() ?? -1
  const max = Math.max(1, ...(d?.parHeure.map((h) => h.appels) ?? [1]))
  return (
    <Chapitre id="direct" titre="En direct" sous="Les appels d'aujourd'hui et de la semaine, au fil de l'eau."
      droite={<span className="inline-flex items-center gap-2 text-colonne text-encre-2"><span className="h-2 w-2 rounded-full bg-ok" aria-hidden="true" />{erreur ? "Lecture impossible pour l'instant" : le ? `Mis à jour à ${le.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · chaque minute` : "Lecture…"}</span>}>
      {d ? <>
        <Bandeau cases={[
          { libelle: "Appels aujourd'hui", valeur: fr(d.jour.appels), variation: semaine(d.semaine.appels), title: "Appels passés aux agences" },
          { libelle: "Gestionnaires joints", valeur: fr(d.jour.joints), variation: semaine(d.semaine.joints) },
          { libelle: "Intéressés", valeur: fr(d.jour.interesses), ton: d.jour.interesses ? "text-ok" : "text-encre", variation: semaine(d.semaine.interesses), title: "Appels qui finissent « intéressé » ou en rendez-vous" },
          { libelle: "Rendez-vous pris", valeur: fr(d.jour.rdv), variation: semaine(d.semaine.rdv) },
          { libelle: "Artisans appelés", valeur: fr(d.jour.artisans), variation: semaine(d.semaine.artisans), title: "Appels du recrutement des sous-traitants" },
        ]} />
        <div className="grid gap-10 @min-[1000px]:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <Bloc titre="Aujourd'hui, heure par heure" droite={`${fr(d.jour.appels + d.jour.artisans)} appels`}>
            <div role="img" aria-label="Appels d'aujourd'hui, heure par heure" className="grid h-32 items-end gap-1.5 pt-4" style={{ gridTemplateColumns: `repeat(${d.parHeure.length}, minmax(0, 1fr))` }}>
              {d.parHeure.map((h) => {
                const vu = h.heure === heureCourante
                return (
                  <div key={h.heure} className="flex h-full flex-col items-center justify-end gap-1" title={`${h.heure} h : ${h.appels} appel${h.appels > 1 ? "s" : ""}`}>
                    {h.appels ? <span className="chiffres text-[11px] text-encre-2">{h.appels}</span> : null}
                    <span className="block w-[60%] rounded-t-[2px]" style={{ height: `${Math.max(2, Math.round((h.appels / max) * 80))}px`, background: vu ? "#111113" : "#C9D7F2" }} />
                    <span className={`text-[11px] ${vu ? "font-semibold text-encre" : "text-encre-2"}`}>{h.heure}h</span>
                  </div>
                )
              })}
            </div>
          </Bloc>
          <Bloc titre="Par personne" droite="aujourd'hui · cette semaine">
            {d.parPersonne.length ? (
              <Table colonnes={[{ titre: "" }, { titre: "Appels", largeur: "80px", droite: true }, { titre: "Joints", largeur: "70px", droite: true }, { titre: "Intéressés", largeur: "90px", droite: true }, { titre: "Artisans", largeur: "80px", droite: true }, { titre: "Semaine", largeur: "90px", droite: true }]}
                lignes={d.parPersonne.map((p) => ({ cle: p.cle, cellules: [p.nom, <b className="font-semibold">{fr(p.jour.appels)}</b>, fr(p.jour.joints), fr(p.jour.interesses), fr(p.jour.artisans), <span className="text-encre-2">{fr(p.semaine.appels + p.semaine.artisans)}</span>] }))} />
            ) : <p className="pt-4 text-colonne text-encre-2">Aucun appel cette semaine pour l'instant.</p>}
          </Bloc>
        </div>
      </> : erreur ? <p className="text-colonne text-alerte">{erreur}</p> : <p className="text-colonne text-encre-2">Lecture des appels…</p>}
    </Chapitre>
  )
}
