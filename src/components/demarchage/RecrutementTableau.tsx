// ── LE RECRUTEMENT DES ARTISANS SUR LE DASHBOARD (Mahdi, 09/11/2026) ──
// « Des stats sur le démarchage sous-traitant, pour les admins, pas visibles par les téléprospecteurs. »
// Un chapitre de plus en bas du Dashboard, monté seulement pour un administrateur : les files de la session
// artisans, les appels de la semaine par personne, les dossiers déposés. Les stats d'envoi sont dans la campagne.
// « Mon recrutement » (Mahdi, 11/11/2026) : Aujourd'hui (et Démarrer la session), l'entonnoir du recrutement, les
// manques par métier et par zone (où il faut recruter), l'équipe.
import { useEffect, useMemo, useState } from "react"
import { Play } from "lucide-react"
import { Bouton } from "../../ui"
import { chargerSousTraitants } from "../../lib/sousTraitantsDb"
import { entonnoirRecrutement } from "../../lib/croissance"
import type { SousTraitant } from "../../recrutement"
import { compterAppelsST, compterDeposesDepuis, compterFilesST } from "../../lib/appelsStDb"
import type { FileST } from "../../lib/appelsStOutils"
import { Bandeau, Bloc, Chapitre, Entonnoir, Table } from "./aujourdhui/courtier"

const fr = (n: number) => n.toLocaleString("fr-FR")
const pctTxt = (n: number, sur: number) => (sur ? `${Math.round((n / sur) * 100)} %` : "—")
const lundi = (d: Date) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
const debutDuMois = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)

type Donnees = {
  files: Record<FileST, number>
  appels: { compteNom: string; appels: number; joints: number }[]
  deposesSemaine: number
  deposesMois: number
  artisans: SousTraitant[]
}

export default function RecrutementTableau({ onDemarrer }: { onDemarrer?: () => void }) {
  const [d, setD] = useState<Donnees | null>(null)
  const [erreur, setErreur] = useState("")
  useEffect(() => {
    let vivant = true
    const now = new Date()
    Promise.all([compterFilesST(now), compterAppelsST(lundi(now), new Date(now.getTime() + 60_000)), compterDeposesDepuis(lundi(now)), compterDeposesDepuis(debutDuMois(now)), chargerSousTraitants().catch(() => [] as SousTraitant[])])
      .then(([files, appels, deposesSemaine, deposesMois, artisans]) => { if (vivant) setD({ files, appels, deposesSemaine, deposesMois, artisans }) })
      .catch((e) => { if (vivant) setErreur(e instanceof Error ? e.message : String(e)) })
    return () => { vivant = false }
  }, [])

  // L'entonnoir et les manques : toute la base des artisans.
  const entonnoir = useMemo(() => entonnoirRecrutement((d?.artisans ?? []).map((a) => ({ statut: a.statut, nb_envois_ok: a.nbEnvoisOk, nb_appels: a.nbAppels ?? 0, nb_joints: a.nbJoints ?? 0, nb_clics: a.nbClics, suivi: a.suivi ?? null, depose_le: a.deposeLe ?? null, contrat_statut: a.contratStatut ?? null, contrat_signe_le: a.contratSigneLe ?? null, acces_ouvert_le: a.accesOuvertLe ?? null }))), [d])
  const manques = useMemo(() => {
    const actif = (a: SousTraitant) => Boolean(a.accesOuvertLe) || a.contratStatut === "signe" || Boolean(a.contratSigneLe)
    const enCours = (a: SousTraitant) => !actif(a) && (a.statut === "depose" || Boolean(a.deposeLe) || ["envoye", "livre", "signe_artisan"].includes(a.contratStatut ?? ""))
    const groupes = new Map<string, { metier: string; zone: string; actifs: number; enCours: number; base: number }>()
    for (const a of d?.artisans ?? []) {
      const metier = (a.metier || "Sans métier").trim(), zone = (a.zone || "Sans zone").trim(), cle = `${metier}|${zone}`
      const g = groupes.get(cle) ?? { metier, zone, actifs: 0, enCours: 0, base: 0 }
      g.base++; if (actif(a)) g.actifs++; else if (enCours(a)) g.enCours++
      groupes.set(cle, g)
    }
    return [...groupes.values()].sort((x, y) => x.actifs - y.actifs || y.base - x.base).slice(0, 20)
  }, [d])
  const appels = d?.appels.reduce((s, x) => s + x.appels, 0) ?? 0
  const joints = d?.appels.reduce((s, x) => s + x.joints, 0) ?? 0
  return (
    <Chapitre id="recrutement" titre="Mon recrutement" sous="Ce qu'il y a à appeler aujourd'hui, où en est le recrutement, et où il manque des artisans." droite={onDemarrer ? <Bouton variante="plein" icone={<Play />} onClick={onDemarrer}>Démarrer la session</Bouton> : undefined}>
      {erreur ? <p className="text-legende text-alerte">{erreur}</p> : null}
      <Bandeau cases={[
        { libelle: "Leads à appeler", valeur: d ? fr(d.files.leads) : "…", ton: d?.files.leads ? "text-signature" : "text-encre" },
        { libelle: "À rappeler aujourd'hui", valeur: d ? fr(d.files.rappels) : "…", ton: d?.files.rappels ? "text-alerte" : "text-encre" },
        { libelle: "Ont promis de déposer", valeur: d ? fr(d.files.promis) : "…" },
        { libelle: "Appels cette semaine", valeur: d ? fr(appels) : "…", variation: d ? <span className="chiffres text-colonne text-encre-2">{fr(joints)} joints · {pctTxt(joints, appels)}</span> : undefined },
        { libelle: "Dossiers déposés cette semaine", valeur: d ? fr(d.deposesSemaine) : "…", ton: d?.deposesSemaine ? "text-ok" : "text-encre" },
        { libelle: "Dossiers déposés ce mois", valeur: d ? fr(d.deposesMois) : "…" },
      ]} />
      <div className="grid gap-x-10 gap-y-10 @min-[1100px]:grid-cols-2">
        <Bloc titre="L'entonnoir du recrutement" droite="toute la base · taux depuis la marche d'avant">{d ? <Entonnoir marches={entonnoir} /> : <p className="py-6 text-legende text-encre-2">Lecture…</p>}</Bloc>
        <Bloc titre="Les manques" droite="par métier et par zone · le moins couvert d'abord">
          <Table vide={d ? "Aucun artisan dans la base." : "Lecture…"}
            colonnes={[{ titre: "Métier" }, { titre: "Zone", largeur: "26%" }, { titre: "Actifs", largeur: "64px", droite: true }, { titre: "En cours", largeur: "76px", droite: true }, { titre: "Base", largeur: "60px", droite: true }]}
            lignes={manques.map((g) => ({ cle: g.metier + g.zone, cellules: [g.metier, <span className="text-encre-2">{g.zone}</span>, <b className={`font-semibold ${g.actifs === 0 ? "text-alerte" : g.actifs < 2 ? "text-attention" : "text-ok"}`}>{fr(g.actifs)}</b>, fr(g.enCours), <span className="text-encre-2">{fr(g.base)}</span>] }))} />
        </Bloc>
      </div>
      <Bloc titre="Appels aux artisans par personne" droite="cette semaine">
        <Table colonnes={[{ titre: "Qui" }, { titre: "Appels", largeur: "100px", droite: true }, { titre: "Joints", largeur: "100px", droite: true }, { titre: "Taux de joint", largeur: "120px", droite: true }]}
          vide={d ? "Aucun appel aux artisans cette semaine." : "Lecture…"}
          lignes={(d?.appels ?? []).map((x) => ({ cle: x.compteNom, cellules: [x.compteNom, fr(x.appels), fr(x.joints), pctTxt(x.joints, x.appels)] }))} />
      </Bloc>
    </Chapitre>
  )
}
