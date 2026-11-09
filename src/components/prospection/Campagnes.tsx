// ── CAMPAGNES : le tableau de toutes MES campagnes, chiffres vivants (07/11/2026) ──
// Façon gestionnaire de publicités : un interrupteur par ligne, les indicateurs clés en colonnes, un clic
// ouvre le suivi complet. Seules les campagnes des bases du compte apparaissent.
import { useMemo, useState } from "react"
import { ChevronRight, Plus } from "lucide-react"
import { Bouton, Interrupteur, Pastille } from "../../ui"
import { Bandeau, Table } from "../demarchage/aujourdhui/courtier"
import { useDepot } from "../../prospection/depot"
import { indicateurs } from "../../prospection/indicateurs"
import type { Campagne } from "../../prospection/modele"
import { ORIGINE_TRACABILITE, configDe } from "../../prospection/configCampagne"
import { NomBase, Onglets, Titre } from "./morceaux"
import { fr, pct, useVue } from "./outils"

const ROLE = { brouillon: "inerte", active: "fait", pause: "attente", terminee: "inerte" } as const
const LIB = { brouillon: "Brouillon", active: "Active", pause: "En pause", terminee: "Terminée" } as const
// La traçabilité des agences tourne hors du moteur : en base elle reste « pause » pour qu'il ne la touche jamais.
const tracabilite = (c: Campagne) => c.origine === ORIGINE_TRACABILITE
const criteres = (c: Campagne) => { const q = configDe(c).qualification; return `Lead : ${q.etapes.find((e) => e.id === q.leadA)?.nom ?? "à choisir"} · Gagné : ${q.etapes.find((e) => e.id === q.gagneA)?.nom ?? "à choisir"}` }

export default function Campagnes({ ouvrir, creer }: { ouvrir: (id: string) => void; creer: () => void }) {
  const v = useVue()
  const depot = useDepot()
  const [filtre, setFiltre] = useState("")
  const mes = v.etat.campagnes.filter((c) => v.idsBases.has(c.baseId) && (!filtre || c.baseId === filtre))
  const lignes = useMemo(() => mes.map((c) => ({ c, i: indicateurs(c, v.base(c.baseId)!, v.etat.contacts, v.etat.inscriptions, v.etat.envois, v.evenements, v.etat.leads, v.etat.appels) })), [mes, v])
  const somme = (f: (x: (typeof lignes)[number]) => number) => lignes.reduce((s, x) => s + f(x), 0)
  const touches = somme((x) => x.i.engagement.touches), cliqueurs = somme((x) => x.i.engagement.cliqueurs)
  const basculer = (c: Campagne) => depot.changerStatut(c.id, c.statut === "active" ? "pause" : "active")
  return (
    <div className="space-y-6">
      <Titre titre="Campagnes" sous={v.compte.role === "gerant" ? "Toutes les bases" : `Tes bases : ${v.bases.map((b) => b.nom).join(", ")}`} droite={<Bouton variante="plein" icone={<Plus />} onClick={creer}>Créer une campagne</Bouton>} />
      <Bandeau cases={[
        { libelle: "Actives", valeur: mes.filter((c) => c.statut === "active").length },
        { libelle: "Contacts en séquence", valeur: fr(somme((x) => x.i.audience.enCours)) },
        { libelle: "Touchés", valeur: fr(touches) },
        { libelle: "Ont cliqué", valeur: fr(cliqueurs), variation: <span className="chiffres text-colonne text-encre-2">{pct(touches ? cliqueurs / touches : null)}</span> },
        { libelle: "Leads", valeur: fr(somme((x) => x.i.conversion.leads)), ton: "text-ok" },
        { libelle: "Gagnés", valeur: fr(somme((x) => x.i.conversion.gagnes)) },
      ]} />
      {/* Le choix de base de la page (07/11/2026 : pas de sélecteur en haut du menu, un choix dans chaque page). */}
      {v.bases.length > 1 ? <Onglets valeur={filtre} onChange={setFiltre} options={[["", "Toutes"], ...v.bases.map((b) => [b.id, b.unite === "agences" ? "Agences" : "Artisans"] as [string, string])]} /> : null}
      <Table colonnes={[{ titre: "", largeur: "44px" }, { titre: "Campagne" }, ...(v.bases.length > 1 ? [{ titre: "Base", largeur: "170px" }] : []), { titre: "Statut", largeur: "120px" }, { titre: "En cours", largeur: "76px", droite: true }, { titre: "Touchés", largeur: "76px", droite: true }, { titre: "Ouverture", largeur: "84px", droite: true }, { titre: "Clic", largeur: "70px", droite: true }, { titre: "Leads", largeur: "64px", droite: true }, { titre: "Gagnés", largeur: "70px", droite: true }, { titre: "Coût", largeur: "76px", droite: true }, { titre: "", largeur: "28px" }]}
        vide="Aucune campagne : crée la première."
        lignes={lignes.map(({ c, i }) => ({ cle: c.id, cellules: [
          tracabilite(c) ? <span /> : <Interrupteur allume={c.statut === "active"} onChange={() => basculer(c)} libelle={c.statut === "active" ? "Mettre en pause" : "Lancer"} />,
          <button type="button" onClick={() => ouvrir(c.id)} className="block w-full truncate py-1.5 text-left"><span className="font-medium text-encre hover:underline">{c.nom}</span><span className="block truncate text-colonne text-encre-2">{criteres(c)}</span></button>,
          ...(v.bases.length > 1 ? [<NomBase base={v.base(c.baseId)} />] : []),
          <Pastille role={tracabilite(c) ? "fait" : ROLE[c.statut]}>{tracabilite(c) ? "Active" : LIB[c.statut]}</Pastille>,
          fr(i.audience.enCours), fr(i.engagement.touches), pct(i.engagement.tauxOuverture), pct(i.engagement.tauxClic),
          <b className="font-medium">{fr(i.conversion.leads)}</b>, fr(i.conversion.gagnes), <span className="text-encre-2">{i.couts.coutSms ? `${i.couts.coutSms.toLocaleString("fr-FR")} €` : "—"}</span>,
          <ChevronRight size={14} className="text-encre-3" />,
        ] }))} />
    </div>
  )
}
