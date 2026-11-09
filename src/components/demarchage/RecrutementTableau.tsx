// ── LE RECRUTEMENT DES ARTISANS SUR LE DASHBOARD (Mahdi, 09/11/2026) ──
// « Des stats sur le démarchage sous-traitant, pour les admins, pas visibles par les téléprospecteurs. »
// Un chapitre de plus en bas du Dashboard, monté seulement pour un administrateur : les files de la session
// artisans, les appels de la semaine par personne, les dossiers déposés. Les stats d'envoi sont dans la campagne.
import { useEffect, useState } from "react"
import { compterAppelsST, compterDeposesDepuis, compterFilesST } from "../../lib/appelsStDb"
import type { FileST } from "../../lib/appelsStOutils"
import { Bandeau, Bloc, Chapitre, Table } from "./aujourdhui/courtier"

const fr = (n: number) => n.toLocaleString("fr-FR")
const pctTxt = (n: number, sur: number) => (sur ? `${Math.round((n / sur) * 100)} %` : "—")
const lundi = (d: Date) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
const debutDuMois = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)

type Donnees = {
  files: Record<FileST, number>
  appels: { compteNom: string; appels: number; joints: number }[]
  deposesSemaine: number
  deposesMois: number
}

export default function RecrutementTableau() {
  const [d, setD] = useState<Donnees | null>(null)
  const [erreur, setErreur] = useState("")
  useEffect(() => {
    let vivant = true
    const now = new Date()
    Promise.all([compterFilesST(now), compterAppelsST(lundi(now), new Date(now.getTime() + 60_000)), compterDeposesDepuis(lundi(now)), compterDeposesDepuis(debutDuMois(now))])
      .then(([files, appels, deposesSemaine, deposesMois]) => { if (vivant) setD({ files, appels, deposesSemaine, deposesMois }) })
      .catch((e) => { if (vivant) setErreur(e instanceof Error ? e.message : String(e)) })
    return () => { vivant = false }
  }, [])

  const appels = d?.appels.reduce((s, x) => s + x.appels, 0) ?? 0
  const joints = d?.appels.reduce((s, x) => s + x.joints, 0) ?? 0
  return (
    <Chapitre id="recrutement" titre="Recrutement des artisans" sous="Visible par les administrateurs seulement. Les envois et les clics sont dans le suivi de chaque campagne.">
      {erreur ? <p className="text-legende text-alerte">{erreur}</p> : null}
      <Bandeau cases={[
        { libelle: "Leads à appeler", valeur: d ? fr(d.files.leads) : "…", ton: d?.files.leads ? "text-signature" : "text-encre" },
        { libelle: "À rappeler aujourd'hui", valeur: d ? fr(d.files.rappels) : "…", ton: d?.files.rappels ? "text-alerte" : "text-encre" },
        { libelle: "Ont promis de déposer", valeur: d ? fr(d.files.promis) : "…" },
        { libelle: "Appels cette semaine", valeur: d ? fr(appels) : "…", variation: d ? <span className="chiffres text-colonne text-encre-2">{fr(joints)} joints · {pctTxt(joints, appels)}</span> : undefined },
        { libelle: "Dossiers déposés cette semaine", valeur: d ? fr(d.deposesSemaine) : "…", ton: d?.deposesSemaine ? "text-ok" : "text-encre" },
        { libelle: "Dossiers déposés ce mois", valeur: d ? fr(d.deposesMois) : "…" },
      ]} />
      <Bloc titre="Appels aux artisans par personne" droite="cette semaine">
        <Table colonnes={[{ titre: "Qui" }, { titre: "Appels", largeur: "100px", droite: true }, { titre: "Joints", largeur: "100px", droite: true }, { titre: "Taux de joint", largeur: "120px", droite: true }]}
          vide={d ? "Aucun appel aux artisans cette semaine." : "Lecture…"}
          lignes={(d?.appels ?? []).map((x) => ({ cle: x.compteNom, cellules: [x.compteNom, fr(x.appels), fr(x.joints), pctTxt(x.joints, x.appels)] }))} />
      </Bloc>
    </Chapitre>
  )
}
