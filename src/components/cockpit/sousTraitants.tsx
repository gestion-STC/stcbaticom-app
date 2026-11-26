// LES SOUS-TRAITANTS DE STC BÂTIMENT (26/11/2026) : la liste de suivi et le solde mois par mois, communs à
// Campagnes › Dashboard et Sous-traitants › Dashboard. Règles : lib/cockpitStc.ts (définitions validées par le gérant).
import { Cote, Grille, Legende, Mouvements, Panneau } from "./pieces"
import { STATUT_ST, euros, moisCourt } from "./format"
import type { LigneSt, MoisSt } from "../../lib/cockpitStc"

const joursDepuis = (iso: string, m: Date) => Math.round((new Date(m.getFullYear(), m.getMonth(), m.getDate()).getTime() - new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))).getTime()) / 86_400_000)

/** La liste de suivi des sous-traitants. `origine` : la provenance (machine de recrutement…), si on la connaît. */
export function ListeSousTraitants({ lignes, maintenant, origine, detaille = false }: { lignes: LigneSt[]; maintenant: Date; origine?: (l: LigneSt) => "machine" | "hors base" | null; detaille?: boolean }) {
  return (
    <Grille
      colonnes={[{ titre: "Sous-traitant" }, { titre: "Statut", largeur: "136px" }, ...(detaille ? [{ titre: "Métier · secteur", largeur: "22%" }] : []), { titre: "Missions", largeur: "76px", droite: true, title: "Missions envoyées sur 30 jours" }, { titre: "vs 30 j avant", largeur: "96px", droite: true }, { titre: "Montant", largeur: "84px", droite: true, title: "Montant convenu des missions envoyées sur 30 jours" }, { titre: "Payé 30 j", largeur: "84px", droite: true, title: "Versements enregistrés dans STC Bâtiment sur 30 jours" }, { titre: "Dernière", largeur: "72px", droite: true, title: "Dernière mission envoyée, il y a N jours" }, ...(origine ? [{ titre: "Origine", largeur: "84px", title: "Machine : son e-mail est celui d'une fiche ou d'un dossier du recrutement Baticom" }] : [])]}
      lignes={lignes.map((s) => {
        const st = STATUT_ST[s.statut]
        const j = s.derniere ? joursDepuis(s.derniere, maintenant) : null
        const o = origine?.(s) ?? null
        return { cle: s.nom, title: `${s.nom} : ${st.pourquoi}${s.total && s.premiere ? ` · ${s.total} missions depuis le ${new Date(s.premiere).toLocaleDateString("fr-FR")}` : ""}`, ton: s.statut === "inactif" || s.statut === "jamais" ? "text-encre-2" : "", cellules: [
          <span className="font-medium" title={s.nom}>{s.nom}</span>,
          <span className={`inline-flex items-center gap-1.5 ${st.ton}`}><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${st.point}`} />{st.texte}</span>,
          ...(detaille ? [<span className="text-encre-2" title={[s.metier, s.secteurs.join(", ")].filter(Boolean).join(" · ")}>{s.metier || "—"}{s.secteurs.length ? <span className="text-encre-3"> · {s.secteurs.map((x) => x.split(" ")[0]).join(", ")}</span> : null}</span>] : []),
          s.missions30 ? <b className="font-semibold">{s.missions30}</b> : <span className="text-encre-3">0</span>,
          s.missions30Avant > 0 ? <Cote n={s.missions30} avant={s.missions30Avant} /> : <span className="text-colonne text-encre-2">{s.statut === "nouveau" ? "nouveau" : s.missions30 ? "de 0" : "—"}</span>,
          s.montant30 > 0 ? euros(s.montant30) : <span className="text-encre-3">—</span>,
          s.paye30 > 0 ? euros(s.paye30) : <span className="text-encre-3">—</span>,
          j === null ? <span className="text-encre-3">jamais</span> : <span className={j > 30 && s.statut !== "inactif" ? "font-medium text-alerte" : "text-encre-2"}>{j} j</span>,
          ...(origine ? [o === "machine" ? <span className="inline-flex items-center gap-1 text-info"><span className="h-1.5 w-1.5 rounded-full bg-info" />machine</span> : o === "hors base" ? <span className="text-encre-2" title="Dossier déposé sur le site sans avoir été démarché">site, hors base</span> : <span className="text-encre-3">—</span>] : []),
        ] }
      })} />
  )
}

/** La ligne de résumé du mois : actifs, nouveaux, revenus, sortis, fin du mois d'avant. */
export function ResumeSt({ mouvements, actifs, maintenant, comptes }: { mouvements: MoisSt[]; actifs: number; maintenant: Date; comptes?: { ouverts: number; total: number } }) {
  const x = mouvements[mouvements.length - 1], av = mouvements[mouvements.length - 2]
  if (!x) return null
  const noms = (l: string[]) => (l.length ? <span className="text-encre-2"> ({l.join(", ")})</span> : null)
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b-[0.5px] border-trait py-2 text-colonne text-encre-2">
      <span className="chiffres"><b className="text-legende font-semibold text-encre">{actifs}</b> actifs fin {moisCourt(x.mois)} (au {maintenant.getDate()})</span>
      <span className="chiffres text-ok">+{x.nouveaux.length} nouveau{x.nouveaux.length > 1 ? "x" : ""}{noms(x.nouveaux)}</span>
      <span className="chiffres text-info">+{x.revenus.length} revenu{x.revenus.length > 1 ? "s" : ""}{noms(x.revenus)}</span>
      <span className="chiffres text-alerte">−{x.sortis.length} sorti{x.sortis.length > 1 ? "s" : ""}{noms(x.sortis)}</span>
      {av ? <span className="chiffres">fin {moisCourt(av.mois)} : {av.actifs}</span> : null}
      {comptes ? <span className="chiffres">comptes ouverts : {comptes.ouverts} sur {comptes.total}</span> : null}
    </div>
  )
}

/** Le solde des sous-traitants actifs, mois par mois. */
export function SoldeSousTraitants({ mouvements, maintenant, className = "" }: { mouvements: MoisSt[]; maintenant: Date; className?: string }) {
  return (
    <Panneau className={className} titre="Solde des sous-traitants actifs" droite={<Legende items={[{ puce: "bg-info", texte: "nouv." }, { puce: "bg-info/40", texte: "rev." }, { puce: "bg-alerte", texte: "sortis" }]} />}>
      <div className="pt-2"><Mouvements sousTraitants hauteur={190} mois={mouvements.map((x) => ({ mois: x.mois, actives: x.actifs, nouvelles: x.nouveaux, revenues: x.revenus, decrochees: x.sortis }))} /></div>
      <p className="text-colonne text-encre-2">En tête : actifs en fin de mois (le {maintenant.getDate()} pour {moisCourt(mouvements[mouvements.length - 1]?.mois ?? "2026-01")}). Survol d'un mois : les noms.</p>
      <ul className="mt-2 space-y-0.5 border-t-[0.5px] border-trait pt-2 text-colonne text-encre-2">
        {[...mouvements].reverse().slice(0, 4).map((x) => (
          <li key={x.mois} className="truncate" title={[...x.nouveaux.map((n) => `+ ${n}`), ...x.revenus.map((n) => `revenu : ${n}`), ...x.sortis.map((n) => `− ${n}`)].join("\n")}><b className="chiffres font-semibold text-encre">{moisCourt(x.mois)}</b> {x.nouveaux.length ? <span className="text-ok">+ {x.nouveaux.join(", ")}</span> : null}{x.revenus.length ? <span className="text-info"> ↺ {x.revenus.join(", ")}</span> : null}{x.sortis.length ? <span className="text-alerte"> − {x.sortis.join(", ")}</span> : null}{!x.nouveaux.length && !x.revenus.length && !x.sortis.length ? "aucun mouvement" : null}</li>
        ))}
      </ul>
    </Panneau>
  )
}
