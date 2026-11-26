// CAMPAGNES › DASHBOARD : LE COCKPIT DE LA DIRECTION (proposition 1 validée par le gérant le 26/11/2026).
// Une rangée de cotes sur toute la largeur (l'année → le jour, de gauche à droite), le prévisionnel à 6 mois, puis LA
// liste de suivi des agences actives au premier plan avec l'objectif et le solde des agences ; les sous-traitants
// (demande du gérant du 26/11) ; dessous, CA, OS reçus, premiers OS, téléprospection par commercial et campagnes.
// Tout est lu EN DIRECT : Baticom (appels, premiers OS, leads, campagnes) et STC Bâtiment (la passerelle
// parametres.chiffres_stc, mise à jour chaque heure). Calculs : lib/cockpitStc.ts, lib/cockpitTelepro.ts, lib/prevision.ts.
// Ce qui manque encore dans la passerelle s'affiche « en attente des chiffres de STC Bâtiment », jamais à zéro.
import { useMemo, useState } from "react"
import { Courbe } from "../demarchage/aujourdhui/courtier"
import { Bandeau as BandeauAlerte, Bouton, Chargement } from "../../ui"
import { nomCle } from "../../demarchage/modele"
import { echeanceDe, type ReglageCockpit } from "../../lib/croissance"
import { caMoisCompare, estActif, lignesAgences, lignesSt, lireChiffres, mouvementsAgences, mouvementsSt, moisIso, osRecus, type StatutCockpit } from "../../lib/cockpitStc"
import { ListeSousTraitants, ResumeSt, SoldeSousTraitants } from "../cockpit/sousTraitants"
import { bornes, joursDuMois, leadsPeriode, moyenneJour, semaineJours, stats, statsParCompte } from "../../lib/cockpitTelepro"
import { agencesClientes, campagnesEnCours } from "../../lib/cockpitDb"
import { chargerCommun } from "../cockpit/donnees"
import { useRafraichi } from "../cockpit/useRafraichi"
import { PrevisionComplete } from "../cockpit/PanneauPrevision"
import ReglageObjectif from "../cockpit/ReglageObjectif"
import { AttenteStc, BandeauCotes, Colonnes, Cote, Direct, Grille, Jauge, Legende, MiniCourbe, Mouvements, Panneau, TeteEcran, Tuile, Unites } from "../cockpit/pieces"
import { REGLE_ST, euros, fr, k, moisCourt, pct } from "../cockpit/format"

const BASE: Record<string, string> = { agences: "Gestionnaires", apporteurs: "Apporteurs", artisans: "Artisans", locataires: "Locataires", clients_gestionnaires: "Clients", sous_traitants_actifs: "Sous-traitants actifs" }
const STATUT: Record<StatutCockpit, { texte: string; point: string; ton: string }> = {
  surveiller: { texte: "À surveiller", point: "bg-alerte", ton: "font-medium text-alerte" },
  active: { texte: "Active", point: "bg-ok", ton: "text-encre" },
  chute: { texte: "En chute", point: "bg-alerte", ton: "text-alerte" },
  decrochee: { texte: "Décrochée", point: "bg-alerte/50", ton: "text-encre-2" },
  pas_active: { texte: "Pas active", point: "bg-encre-3", ton: "text-encre-2" },
}
const moisAnnee = (d: Date) => d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
const jourMois = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`
const seance = (d: Date) => `Séance du ${d.toLocaleDateString("fr-FR", { weekday: "short" })} ${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} · ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
/** Le premier mois de Baticom (les premiers OS sont suivis depuis juillet 2026). */
const DEBUT_BATICOM = "2026-07"

async function lire(maintenant: Date) {
  const [commun, campagnes, clientes] = await Promise.all([chargerCommun(maintenant), campagnesEnCours().catch(() => null), agencesClientes().catch(() => [] as { id: string; nom: string }[])])
  return { commun, campagnes, clientes }
}

export default function Croissance({ onOuvrirAgence }: { onOuvrirAgence?: (agenceId: string) => void }) {
  const [cle, setCle] = useState(0)
  const { d, erreur, recharger } = useRafraichi(lire, cle)
  const [vue, setVue] = useState<"actives" | "suivies" | "toutes">("toutes")
  const [vueSt, setVueSt] = useState<"actifs" | "suivis" | "tous">("suivis")
  const [fenetre, setFenetre] = useState<"objectif" | "calcul" | null>(null)
  const [reglageLocal, setReglageLocal] = useState<ReglageCockpit | null>(null)

  const c = useMemo(() => {
    if (!d) return null
    const C = d.commun, m = C.maintenant, P = C.prevision, reglage = reglageLocal ?? C.reglage
    const seuils = { factureMin: reglage.factureMin, osMin: reglage.osMin, chutePct: reglage.chutePct }
    const brut = lireChiffres(C.brut)
    const reel = P.reel
    // ── STC Bâtiment ──
    const caAnnee = reel?.caAnnee ?? null
    const caMois = brut?.ca_jours ? caMoisCompare(brut.ca_jours, m) : null
    const etendu = Boolean(brut?.historique_depuis && brut.agences.every((a) => Array.isArray(a.os)))
    const activesMaintenant = new Set((reel?.agences ?? []).filter((a) => a.active).map((a) => a.nom))
    const mv = etendu && brut ? mouvementsAgences(brut.agences, brut.historique_depuis!, m, seuils, activesMaintenant) : null
    const moisCourbe = Array.from({ length: 6 }, (_, i) => moisIso(new Date(m.getFullYear(), m.getMonth() - 5 + i, 1)))
    const agences = brut ? lignesAgences(brut.agences, seuils, mv?.dejaActives ?? new Set(), moisCourbe, m).filter((a) => a.os_90 > 0 || a.statut !== "pas_active" || !etendu) : []
    const actives = agences.filter((a) => a.statut === "active" || a.statut === "surveiller")
    const os = brut?.os_recents ? osRecus(brut.os_recents, m) : null
    const sts = brut?.sous_traitants ?? null
    const st = sts ? { lignes: lignesSt(sts, m), mouvements: mouvementsSt(sts, m) } : null
    // ── Baticom ──
    const bM = bornes("mois", m), bMD = bornes("moisDernier", m), bS = bornes("semaine", m), bJ = bornes("jour", m)
    const mois = stats(C.appels, C.os, bM.de, bM.a), moisAvant = stats(C.appels, C.os, bM.avantDe, bM.avantA)
    const sem = stats(C.appels, [], bS.de, bS.a), semAvant = stats(C.appels, [], bS.avantDe, bS.avantA)
    const jour = stats(C.appels, [], bJ.de, bJ.a)
    const parMois = statsParCompte(C.appels, C.os, C.commerciaux.map((x) => x.id), bM.de, bM.a)
    const parMoisDernier = statsParCompte(C.appels, C.os, C.commerciaux.map((x) => x.id), bMD.de, bMD.a)
    const commerciaux = C.commerciaux.map((x) => ({ ...x, m: parMois[x.id], md: parMoisDernier[x.id] })).filter((x) => x.m.appels || x.md.appels || x.m.premiersOs || x.md.premiersOs).sort((a, b) => b.m.appels - a.m.appels || b.md.appels - a.md.appels)
    const leadsMois = leadsPeriode(C.leads, bM.de, bM.a), leadsAvant = leadsPeriode(C.leads, bM.avantDe, bM.avantA), leadsJour = leadsPeriode(C.leads, bJ.de, bJ.a)
    const osMois = C.os.filter((o) => o.date.slice(0, 7) === moisIso(m))
    const moisOs = []
    for (let x = new Date(Number(DEBUT_BATICOM.slice(0, 4)), Number(DEBUT_BATICOM.slice(5, 7)) - 1, 1); moisIso(x) <= moisIso(m); x = new Date(x.getFullYear(), x.getMonth() + 1, 1)) moisOs.push(moisIso(x))
    const osAnnee = C.os.filter((o) => o.date.slice(0, 4) === String(m.getFullYear()))
    const idParNom = new Map(d.clientes.map((a) => [nomCle(a.nom), a.id]))
    return {
      m, P, reglage, reel, brut, caAnnee, caMois, etendu, mv, moisCourbe, agences, actives, os, st, mois, moisAvant, sem, semAvant, jour, commerciaux, leadsMois, leadsAvant, leadsJour,
      osMois, moisOs, osParMois: moisOs.map((x) => C.os.filter((o) => o.date.slice(0, 7) === x).length), osAnnee, idParNom,
      joursMois: joursDuMois(C.appels, m), semJours: semaineJours(C.appels, m), moyJour: moyenneJour(C.appels, m), objectifOs: C.objectifOs,
    }
  }, [d, reglageLocal])

  if (!c) {
    return (
      <div className="@container w-full">
        <TeteEcran titre="Dashboard" sous="Direction · CA, agences actives, premiers OS, campagnes" />
        <div className="p-4">{erreur ? <BandeauAlerte role="alerte" action={<Bouton taille="sm" onClick={recharger}>Réessayer</Bouton>}>{erreur}</BandeauAlerte> : <Chargement texte="Lecture du cockpit…" />}</div>
      </div>
    )
  }

  const { m, P, reglage, reel, caAnnee, caMois, mv, os, st } = c
  const echeance = echeanceDe(reglage)
  const moyenne3 = P.plan.caEstime
  const clos = (reel?.mois ?? []).slice(-3)
  const pctAtteint = reglage.objectifMensuel ? Math.round((moyenne3 / reglage.objectifMensuel) * 100) : 0
  const prevu = P.prevu
  const phrase = prevu.semainesPourObjectif === 0 ? "Objectif déjà atteint."
    : P.atteint ? `À ce rythme : atteint en ${moisAnnee(P.atteint)}${P.atteint > echeance ? ", après l'échéance" : ""}.` : "À ce rythme, l'objectif n'est jamais atteint."
  const phraseCourte = prevu.semainesPourObjectif === 0 ? "atteint" : P.atteint ? `atteint en ${P.atteint.toLocaleDateString("fr-FR", { month: "short", year: "numeric" })}` : "jamais atteint à ce rythme"
  const caDepuisJanvier = caAnnee ? caAnnee.reduce((t, x) => t + x.ht, 0) : null
  const caCeMois = caMois?.mois ?? (caAnnee ? caAnnee[caAnnee.length - 1].ht : null)
  const moisAvantCourt = moisCourt(moisIso(new Date(m.getFullYear(), m.getMonth() - 1, 1)))
  const mvDernier = mv ? mv.mois[mv.mois.length - 1] : null
  const finMoisAvant = mv && mv.mois.length > 1 ? mv.mois[mv.mois.length - 2].actives : null
  const nActives = reel ? reel.agencesActives : null
  const surveiller = c.agences.filter((a) => a.statut === "surveiller")
  const facture30 = c.actives.reduce((t, a) => t + a.facture_30, 0), os30 = c.actives.reduce((t, a) => t + a.os_30, 0)
  const objOs = c.objectifOs
  const attenduOs = objOs ? Math.round((objOs * m.getDate()) / new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate()) : 0
  const enRetardOs = objOs > 0 && c.osMois.length < attenduOs
  const liste = c.agences.filter((a) => vue === "toutes" || (vue === "actives" ? a.statut === "active" || a.statut === "surveiller" : a.statut !== "pas_active"))
  const stActifs = st ? st.lignes.filter(estActif) : []
  const stMois = st ? st.mouvements[st.mouvements.length - 1] : null
  const stListe = st ? st.lignes.filter((x) => vueSt === "tous" || (vueSt === "actifs" ? estActif(x) : x.statut !== "inactif")) : []
  const lienAgence = (nom: string) => {
    const id = c.idParNom.get(nomCle(nom))
    return id && onOuvrirAgence ? <button type="button" className="truncate font-medium hover:underline" title={`Ouvrir la fiche de ${nom}`} onClick={() => onOuvrirAgence(id)}>{nom}</button> : <span className="font-medium" title={nom}>{nom}</span>
  }
  const jourLibelle = `${m.getDate()}/${String(m.getMonth() + 1).padStart(2, "0")}`

  return (
    <div className="@container w-full">
      <TeteEcran titre="Dashboard" sous="Direction · CA, agences actives, premiers OS, campagnes · de gauche à droite : l'année → le jour"
        droite={<Direct texte={seance(m)} />} />

      <div className="space-y-2 bg-fond-2 p-3">
        {erreur ? <BandeauAlerte role="attention">Dernière mise à jour impossible : {erreur}</BandeauAlerte> : null}
        {/* ═══ LE BANDEAU DE COTES ═══ */}
        <BandeauCotes treize>
          <Tuile periode="année" libelle="CA facturé" valeur={caDepuisJanvier !== null ? `${k(caDepuisJanvier)}€` : "—"} repere={caDepuisJanvier !== null ? <>{euros(caDepuisJanvier)} HT, avoirs déduits</> : "en attente de STC Bâtiment"}
            courbe={caAnnee ? <MiniCourbe barres valeurs={caAnnee.map((x) => x.ht)} enCours /> : null} title={`Barres : CA HT par mois, janvier → ${moisCourt(moisIso(m))} (au ${m.getDate()})`} />
          <Tuile periode="objectif" libelle={`Objectif ${k(reglage.objectifMensuel)}€`} valeur={reel ? `${pctAtteint} %` : "—"} ton={pctAtteint >= 100 ? "text-ok" : "text-alerte"} accent={reel ? (pctAtteint >= 100 ? "ok" : "alerte") : undefined}
            repere={reel ? <>{euros(moyenne3)} / mois · {phraseCourte}</> : "en attente de STC Bâtiment"}
            title={`Moyenne des 3 mois clos (${clos.map(moisCourt).join(", ")}) rapportée à l'objectif de ${euros(reglage.objectifMensuel)} / mois pour ${moisAnnee(echeance)}. ${phrase}`}
            courbe={reel ? <Jauge realise={moyenne3} objectif={reglage.objectifMensuel} ton="bg-encre" h={6} /> : null} />
          <Tuile periode="mois" libelle="CA facturé" valeur={caCeMois !== null ? euros(caCeMois) : "—"} cote={caMois ? <Cote n={caMois.mois} avant={caMois.avantMemesJours} /> : undefined}
            repere={caMois ? <>vs {euros(caMois.avantMemesJours)} 1er→{caMois.jusquAu} {moisAvantCourt}</> : caCeMois !== null ? "comparaison en attente de STC" : "en attente de STC Bâtiment"}
            courbe={caAnnee ? <MiniCourbe valeurs={caAnnee.slice(-6).map((x) => x.ht)} /> : null} title="Courbe : CA HT des 6 derniers mois" />
          <Tuile periode="30 j" libelle="Facturé actives" valeur={reel ? `${k(facture30)}€` : "—"} repere={reel ? <>{euros(facture30)} · {os30} OS</> : "en attente de STC Bâtiment"}
            courbe={reel ? <MiniCourbe barres valeurs={c.actives.map((a) => a.facture_30)} /> : null} title="Facturé sur 30 jours par les agences actives (dont à surveiller), une barre par agence" />
          <Tuile periode="mois" libelle="Agences actives" valeur={nActives ?? "—"} cote={finMoisAvant !== null && nActives !== null ? <Cote n={nActives} avant={finMoisAvant} unite="nb" /> : undefined} accent={reel ? "ok" : undefined}
            repere={mvDernier ? <><span className="text-ok">+{mvDernier.nouvelles.length + mvDernier.revenues.length}</span> · <span className="text-alerte">−{mvDernier.decrochees.length}</span> · fin {moisAvantCourt} {finMoisAvant}</> : reel ? "mouvements en attente de STC" : "en attente de STC Bâtiment"}
            courbe={mv ? <MiniCourbe valeurs={mv.mois.map((x) => x.actives)} ton="ok" /> : null}
            title={mvDernier ? `Nouvelles : ${mvDernier.nouvelles.join(", ") || "aucune"}. Revenues : ${mvDernier.revenues.join(", ") || "aucune"}. Décrochées : ${mvDernier.decrochees.join(", ") || "aucune"}. Courbe : actives en fin de mois.` : undefined} />
          <Tuile periode="mois" libelle="À surveiller" valeur={reel ? surveiller.length : "—"} ton={surveiller.length ? "text-alerte" : "text-encre"} accent={surveiller.length ? "alerte" : undefined}
            repere={!reel ? "en attente de STC Bâtiment" : surveiller.length ? surveiller.map((a) => a.nom.split(" – ")[0]).join(", ") : "aucune"} title={surveiller.map((a) => `${a.nom} : ${a.pourquoi}`).join("\n") || "Aucune agence active silencieuse"}
            courbe={reel && c.actives.length ? <MiniCourbe barres ton="alerte" valeurs={c.actives.map((a) => (a.statut === "surveiller" ? 1 : 0))} /> : null} />
          <Tuile periode="mois" libelle="Sous-traitants actifs" valeur={st ? stActifs.length : "—"} accent={st ? "ok" : undefined}
            repere={st && stMois ? <><span className="text-ok">+{stMois.nouveaux.length} nouv. · +{stMois.revenus.length} rev.</span> · <span className="text-alerte">−{stMois.sortis.length} sorti{stMois.sortis.length > 1 ? "s" : ""}</span></> : "en attente de STC Bâtiment"}
            courbe={st ? <MiniCourbe valeurs={st.mouvements.map((x) => x.actifs)} ton="ok" /> : null}
            title={st && stMois ? `${REGLE_ST} Ce mois : nouveaux ${stMois.nouveaux.join(", ") || "aucun"} ; revenus ${stMois.revenus.join(", ") || "aucun"} ; sortis ${stMois.sortis.join(", ") || "aucun"}. Courbe : actifs en fin de mois.` : undefined} />
          <Tuile periode="mois" libelle="Premiers OS" valeur={<>{c.osMois.length}{objOs ? <span className="text-[14px] font-normal text-encre-2"> / {objOs}</span> : null}</>} ton={objOs ? (enRetardOs ? "text-alerte" : "text-ok") : "text-encre"} accent={objOs ? (enRetardOs ? "alerte" : "ok") : undefined}
            cote={<Cote n={c.mois.premiersOs} avant={c.moisAvant.premiersOs} unite="nb" />} repere={objOs ? <>attendu au {jourLibelle} : {attenduOs}</> : "objectif à régler dans Réglages"}
            courbe={objOs ? <Jauge realise={c.osMois.length} objectif={objOs} attendu={attenduOs} ton={enRetardOs ? "bg-alerte" : "bg-ok"} h={6} /> : null} />
          <Tuile periode="mois" libelle="Leads reçus" valeur={c.leadsMois.recus} cote={<Cote n={c.leadsMois.recus} avant={c.leadsAvant.recus} />} repere={<>{c.leadsMois.clients} devenus clients · hors robots</>}
            courbe={<MiniCourbe barres valeurs={[c.leadsMois.recus, c.leadsMois.traites, c.leadsMois.clients]} />} title="Barres : reçus, traités, devenus clients" />
          <Tuile periode="semaine" libelle="OS reçus" valeur={os ? os.semaine : "—"} cote={os ? <Cote n={os.semaine} avant={os.semaineAvant} /> : undefined} repere={os ? <>vs {os.semaineAvant} à la même heure</> : "en attente de STC Bâtiment"}
            courbe={os ? <MiniCourbe barres valeurs={os.semaines.map((x) => x.n)} enCours /> : null} title="OS reçus dans STC Bâtiment, 12 semaines" />
          <Tuile periode="semaine" libelle="Appels équipe" valeur={c.sem.appels} cote={<Cote n={c.sem.appels} avant={c.semAvant.appels} />}
            repere={<>joints {c.sem.joints} · vs {c.semAvant.appels}</>} courbe={<MiniCourbe barres valeurs={c.semJours.map((x) => x.appels ?? 0)} enCours />} title="Appels sortants depuis lundi, comparés à la semaine dernière à la même heure" />
          <Tuile periode="jour" libelle="OS reçus" valeur={os ? os.jour : "—"} repere={os ? `moy. ${fr(os.moyenneJourOuvre)} / jour ouvré` : "en attente de STC Bâtiment"} courbe={os ? <MiniCourbe valeurs={os.semaines.slice(-8).map((x) => x.n)} /> : null} title="Courbe : OS par semaine, 8 dernières semaines" />
          <Tuile periode="jour" libelle="Appels · leads" valeur={<>{c.jour.appels}<span className="text-[14px] font-normal text-encre-2"> · {c.leadsJour.recus}</span></>} repere={`moy. ${c.moyJour.appels} appels / jour ouvré`}
            courbe={<MiniCourbe valeurs={c.joursMois.slice(-8).map((x) => x.appels)} />} className="col-span-2 @min-[640px]:col-span-3 @min-[880px]:col-span-4 @min-[1100px]:col-span-6 @min-[1560px]:col-span-1" />
        </BandeauCotes>

        {/* ═══ LE PRÉVISIONNEL À 6 MOIS ═══ */}
        <PrevisionComplete P={P} />

        <div className="grid grid-cols-1 gap-2 @min-[760px]:grid-cols-2 @min-[1100px]:grid-cols-3 @min-[1500px]:grid-cols-4">
          {/* ═══ LES AGENCES ACTIVES ═══ */}
          <Panneau className="@min-[760px]:col-span-2 @min-[1100px]:col-span-2 @min-[1500px]:col-span-3 @min-[1100px]:row-span-2" titre="Agences actives" compte={nActives ?? undefined}
            droite={reel ? <span><b className="chiffres font-semibold text-encre">{euros(facture30)}</b> facturés et <b className="chiffres font-semibold text-encre">{os30}</b> OS sur 30 j par les actives</span> : undefined}
            outils={reel ? <Unites valeur={vue} onChange={setVue} options={[{ id: "actives", label: "Actives", title: "Actives (dont à surveiller)" }, { id: "suivies", label: "+ décrochées", title: "Actives, à surveiller, en chute et décrochées" }, { id: "toutes", label: "Toutes", title: "Toute agence avec au moins 1 OS sur 90 jours" }]} /> : undefined}>
            {!reel ? <AttenteStc /> : <>
              {mvDernier ? (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b-[0.5px] border-trait py-2 text-colonne text-encre-2">
                  <span className="chiffres"><b className="text-legende font-semibold text-encre">{nActives}</b> actives fin {moisCourt(moisIso(m))} (au {m.getDate()})</span>
                  <span className="chiffres text-ok">+{mvDernier.nouvelles.length} nouvelle{mvDernier.nouvelles.length > 1 ? "s" : ""} {mvDernier.nouvelles.length ? <span className="text-encre-2">({mvDernier.nouvelles.join(", ")})</span> : null}</span>
                  <span className="chiffres">+{mvDernier.revenues.length} revenue{mvDernier.revenues.length > 1 ? "s" : ""} {mvDernier.revenues.length ? <span className="text-encre-2">({mvDernier.revenues.join(", ")})</span> : null}</span>
                  <span className="chiffres text-alerte">−{mvDernier.decrochees.length} décrochée{mvDernier.decrochees.length > 1 ? "s" : ""} {mvDernier.decrochees.length ? <span className="text-encre-2">({mvDernier.decrochees.join(", ")})</span> : null}</span>
                  <span className="chiffres">fin {moisAvantCourt} : {finMoisAvant}</span>
                </div>
              ) : <AttenteStc quoi="de l'historique des agences de STC Bâtiment" className="border-b-[0.5px] border-trait" />}
              <Grille
                colonnes={[{ titre: "Agence" }, { titre: "Statut", largeur: "118px" }, { titre: "OS 30 j", largeur: "64px", droite: true }, { titre: "vs 30 j avant", largeur: "96px", droite: true }, { titre: "Facturé 30 j", largeur: "100px", droite: true }, { titre: "Dernier OS", largeur: "80px", droite: true }, { titre: "Rythme", largeur: "70px", droite: true, title: "Un OS tous les N jours (90 derniers jours)" }, { titre: `OS ${moisCourt(c.moisCourbe[0])} → ${moisCourt(c.moisCourbe[5])}`, largeur: "120px", droite: true }]}
                lignes={liste.map((a) => {
                  const s = STATUT[a.statut]
                  const silencieuse = a.intervalle !== null && a.intervalle > 0 && a.joursSansOs !== null && a.joursSansOs > 2 * a.intervalle
                  return { cle: a.nom, title: a.pourquoi, ton: a.statut === "pas_active" ? "text-encre-2" : "", cellules: [
                    lienAgence(a.nom),
                    <span className={`inline-flex items-center gap-1.5 ${s.ton}`} title={a.pourquoi}><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.point}`} />{s.texte}</span>,
                    <b className="font-semibold">{a.os_30}</b>,
                    a.os_30_60 > 0 ? <Cote n={a.os_30} avant={a.os_30_60} /> : <span className="text-colonne text-encre-2">{a.os_30 ? "nouveau" : "—"}</span>,
                    a.facture_30 > 0 ? euros(a.facture_30) : <span className="text-encre-2">{euros(a.facture_30)}</span>,
                    a.joursSansOs === null ? <span className="text-encre-2">—</span> : <span className={silencieuse && a.statut !== "pas_active" ? "font-medium text-alerte" : "text-encre-2"}>{a.joursSansOs} j</span>,
                    <span className="text-encre-2">{a.intervalle !== null ? `${String(a.intervalle).replace(".", ",")} j` : "—"}</span>,
                    c.etendu ? <span className="flex justify-end" title={c.moisCourbe.map((x, i) => `${moisCourt(x)} ${a.osMois[i]}`).join(" · ")}><Courbe valeurs={a.osMois} l={104} h={20} /></span> : <span className="text-encre-3">·</span>,
                  ] }
                })} />
              <p className="mt-2 text-colonne text-encre-2">Active : sur 30 jours, au moins {fr(reglage.factureMin)} € facturés et {reglage.osMin} OS, sans chute (moins de la moitié des OS des 30 jours d'avant, jugée dès 4 OS). À surveiller : active mais silencieuse depuis plus de 2 fois son rythme. En chute : les seuils sont atteints mais les OS ont chuté (pas comptée active). Survol d'une ligne : la raison du statut.</p>
            </>}
          </Panneau>

          <div className="flex min-w-0 flex-col gap-2 @min-[1100px]:row-span-2">
            {/* L'objectif (la carte noire) */}
            <section className="flex min-w-0 shrink-0 flex-col rounded-6 bg-encre px-4 pb-4 pt-3.5 text-white">
              <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.08em] text-[#C7C7CC]"><span>Objectif</span><span>échéance {echeance.toLocaleDateString("fr-FR")}</span></div>
              <div className="mt-2 text-[13px] text-[#C7C7CC]"><b className="font-medium text-white">{euros(reglage.objectifMensuel)} / mois</b> pour {moisAnnee(echeance)}
                <button type="button" className="ml-1.5 text-[12px] text-[#C7C7CC] underline underline-offset-2 hover:text-white" onClick={() => setFenetre("objectif")}>Modifier</button></div>
              {reel ? <>
                <div className="mt-1 text-[30px] font-medium tabular-nums leading-9 tracking-[-0.02em]">{euros(moyenne3)}<span className="text-[14px] font-normal text-[#C7C7CC]"> / mois</span></div>
                <div className="text-[12px] text-[#C7C7CC]">moyenne des 3 mois clos ({clos.map(moisCourt).join(", ")}) · <b className="font-medium text-white">{pctAtteint} % atteint</b></div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15" aria-hidden="true"><div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, pctAtteint)}%` }} /></div>
                <div className="mt-3 text-[13px] text-white">{phrase}</div>
                <div className="mt-0.5 text-[11px] text-[#8E8E93]">{fr(P.cadence * 4)} nouveaux clients par mois × {euros(P.plan.caParClient)} par agence active</div>
              </> : <div className="mt-3 text-[13px] text-[#C7C7CC]">En attente des chiffres de STC Bâtiment.</div>}
              <button type="button" className="mt-2 self-end text-[11px] text-[#8E8E93] underline underline-offset-2 hover:text-white" onClick={() => setFenetre("calcul")}>Réglages du calcul</button>
            </section>

            {/* Le solde des agences actives, mois par mois */}
            <Panneau className="flex-1" titre="Solde des agences actives" droite={<Legende items={[{ puce: "bg-info", texte: "nouv." }, { puce: "bg-info/40", texte: "rev." }, { puce: "bg-alerte", texte: "décr." }]} />}>
              {mv ? <>
                <div className="pt-2"><Mouvements mois={mv.mois} hauteur={200} /></div>
                <p className="text-colonne text-encre-2">En tête : actives en fin de mois (le {m.getDate()} pour {moisCourt(moisIso(m))}). Survol d'un mois : les noms.</p>
                <ul className="mt-2 space-y-0.5 border-t-[0.5px] border-trait pt-2 text-colonne text-encre-2">
                  {[...mv.mois].reverse().slice(0, 4).map((x) => (
                    <li key={x.mois} className="truncate" title={[...x.nouvelles.map((n) => `+ ${n}`), ...x.revenues.map((n) => `revenue : ${n}`), ...x.decrochees.map((n) => `− ${n}`)].join("\n")}><b className="chiffres font-semibold text-encre">{moisCourt(x.mois)}</b> {x.nouvelles.length ? <span className="text-ok">+ {x.nouvelles.join(", ")}</span> : null}{x.revenues.length ? <span className="text-info"> ↺ {x.revenues.join(", ")}</span> : null}{x.decrochees.length ? <span className="text-alerte"> − {x.decrochees.join(", ")}</span> : null}{!x.nouvelles.length && !x.revenues.length && !x.decrochees.length ? "aucun mouvement" : null}</li>
                  ))}
                </ul>
              </> : <AttenteStc />}
            </Panneau>
          </div>

          {/* ═══ LES SOUS-TRAITANTS (demande du gérant, 26/11/2026) ═══ */}
          <Panneau className="@min-[760px]:col-span-2 @min-[1500px]:col-span-3" titre="Sous-traitants actifs" compte={st ? stActifs.length : undefined}
            droite={st ? <span><b className="chiffres font-semibold text-encre">{stActifs.reduce((t, x) => t + x.missions30, 0)}</b> missions et <b className="chiffres font-semibold text-encre">{euros(stActifs.reduce((t, x) => t + x.montant30, 0))}</b> sur 30 j · détail : Sous-traitants › Dashboard</span> : undefined}
            outils={st ? <Unites valeur={vueSt} onChange={setVueSt} options={[{ id: "actifs", label: "Actifs" }, { id: "suivis", label: "+ sortis, sans mission" }, { id: "tous", label: "Tous", title: "Tous les comptes de STC Bâtiment (hors compte d'essai)" }]} /> : undefined}>
            {!st ? <AttenteStc /> : <>
              <ResumeSt mouvements={st.mouvements} actifs={stActifs.length} maintenant={m} />
              <div className="max-h-[392px] overflow-y-auto"><ListeSousTraitants lignes={stListe} maintenant={m} /></div>
              <p className="mt-2 text-colonne text-encre-2">{REGLE_ST}</p>
            </>}
          </Panneau>
          {st ? <SoldeSousTraitants mouvements={st.mouvements} maintenant={m} /> : <Panneau titre="Solde des sous-traitants actifs"><AttenteStc /></Panneau>}

          {/* Le CA par mois */}
          <Panneau className="@min-[760px]:col-span-2" titre="CA facturé par mois" compte={caDepuisJanvier !== null ? euros(caDepuisJanvier) : undefined} droite={`HT, avoirs déduits · ${moisCourt(moisIso(m))} au ${m.getDate()}`}>
            {caAnnee ? <>
              <div className="pt-3"><Colonnes h={150} valeurs={caAnnee.map((x) => x.ht)} etiquettes={caAnnee.map((x) => moisCourt(x.mois))} enCours={caAnnee.length - 1} format={k}
                titre={(i) => `${moisCourt(caAnnee[i].mois)} : ${euros(caAnnee[i].ht)} HT${i === caAnnee.length - 1 ? ` (au ${m.getDate()})` : ""}`} /></div>
              <div className="mt-1 flex flex-wrap gap-x-5 text-colonne text-encre-2">
                {caMois ? <span>{moisCourt(moisIso(m))} au {m.getDate()} <b className="chiffres font-semibold text-encre">{euros(caMois.mois)}</b> <Cote n={caMois.mois} avant={caMois.avantMemesJours} /> vs 1er→{caMois.jusquAu} {moisAvantCourt}</span> : null}
                <span>moy. 3 mois clos <b className="chiffres font-semibold text-encre">{euros(moyenne3)}</b></span>
              </div>
            </> : <AttenteStc />}
          </Panneau>

          {/* Les OS reçus par semaine */}
          <Panneau titre="OS reçus par semaine" compte={os ? os.semaine : undefined} droite="STC Bâtiment · 12 sem.">
            {os ? <>
              <div className="pt-3"><Colonnes h={150} valeurs={os.semaines.map((x) => x.n)} etiquettes={os.semaines.map((x, i) => (i % 2 && i !== os.semaines.length - 1 ? "" : jourMois(x.lundi)))} enCours={os.semaines.length - 1}
                titre={(i) => `Semaine du ${os.semaines[i].lundi.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} : ${os.semaines[i].n} OS${i === os.semaines.length - 1 ? " (en cours)" : ""}`} /></div>
              <div className="mt-1 text-colonne text-encre-2">cette semaine <b className="chiffres font-semibold text-encre">{os.semaine}</b> <Cote n={os.semaine} avant={os.semaineAvant} /> vs {os.semaineAvant} la semaine dernière à la même heure</div>
            </> : <AttenteStc />}
          </Panneau>

          {/* Les premiers OS */}
          <Panneau titre="Premiers OS" compte={objOs ? `${c.osMois.length} / ${objOs}` : c.osMois.length} droite="nouvelles agences clientes">
            <div className="pt-4"><Colonnes h={92} valeurs={c.osParMois} etiquettes={c.moisOs.map(moisCourt)} enCours={c.moisOs.length - 1} ligne={objOs || undefined} ligneLibelle={objOs ? `obj. ${objOs}` : undefined} /></div>
            <div className="mt-2 border-t-[0.5px] border-trait pt-2">
              {objOs ? <Jauge realise={c.osMois.length} objectif={objOs} attendu={attenduOs} ton={enRetardOs ? "bg-alerte" : "bg-ok"} h={6} /> : null}
              <div className="mt-1 text-colonne text-encre-2">{objOs ? <>attendu au {jourLibelle} : {attenduOs} · </> : null}depuis janvier : <b className="chiffres font-semibold text-encre">{c.osAnnee.length}</b></div>
              <ul className="mt-1 space-y-0.5 text-colonne text-encre-2">{c.osMois.map((o) => <li key={o.agenceId} className="truncate">✓ {onOuvrirAgence ? <button type="button" className="hover:underline" onClick={() => onOuvrirAgence(o.agenceId)}>{o.nom}</button> : o.nom} ({new Date(o.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })})</li>)}</ul>
            </div>
          </Panneau>

          {/* La téléprospection du mois, par commercial */}
          <Panneau className="@min-[760px]:col-span-2" titre="Téléprospection · par commercial" droite={`${moisCourt(moisIso(m))} au ${m.getDate()} · entre parenthèses : ${moisCourt(moisIso(new Date(m.getFullYear(), m.getMonth() - 1, 1)))} entier`}>
            <Grille colonnes={[{ titre: "Commercial" }, { titre: "Appels", largeur: "92px", droite: true }, { titre: "Joints", largeur: "80px", droite: true }, { titre: "Taux", largeur: "60px", droite: true }, { titre: "Intér.", largeur: "70px", droite: true, title: "Agences distinctes intéressées ou en RDV" }, { titre: "1ers OS", largeur: "70px", droite: true }]}
              lignes={c.commerciaux.map((x) => ({ cle: x.id, ton: x.m.appels ? "" : "text-encre-2", cellules: [<span className="font-medium">{x.nom}</span>,
                <>{fr(x.m.appels)} <span className="text-encre-3">({fr(x.md.appels)})</span></>, <>{x.m.joints} <span className="text-encre-3">({x.md.joints})</span></>, pct(x.m.joints, x.m.appels),
                <>{x.m.interesses} <span className="text-encre-3">({x.md.interesses})</span></>, <b className="font-semibold">{x.m.premiersOs} <span className="font-normal text-encre-3">({x.md.premiersOs})</span></b>] }))}
              pied={["Équipe", <>{fr(c.mois.appels)}</>, c.mois.joints, pct(c.mois.joints, c.mois.appels), c.mois.interesses, c.mois.premiersOs]} />
            <p className="mt-2 text-colonne text-encre-2">Le détail jour / semaine / mois / année est sur Gestionnaires › Dashboard. Équipe : premiers OS de toutes les agences, avec ou sans commercial.</p>
          </Panneau>

          {/* Les campagnes */}
          <Panneau className="@min-[760px]:col-span-2" titre="Campagnes" compte={d?.campagnes ? d.campagnes.length : undefined} droite="en cours · clics et leads hors robots">
            {d?.campagnes ? (
              <Grille colonnes={[{ titre: "Campagne" }, { titre: "Base", largeur: "140px" }, { titre: "Envoyés", largeur: "76px", droite: true }, { titre: "Ouverts", largeur: "92px", droite: true }, { titre: "Clics", largeur: "52px", droite: true }, { titre: "Leads", largeur: "48px", droite: true }]}
                lignes={d.campagnes.map((x) => ({ cle: x.id, cellules: [
                  <span className="font-medium" title={x.nom}>{x.nom}</span>, <span className="text-encre-2">{BASE[x.base] ?? x.base}</span>, fr(x.envoyes),
                  x.ouverts === null ? <span className="text-encre-2" title="SMS : pas d'ouverture mesurable">—</span> : <>{fr(x.ouverts)} <span className="text-encre-3">{pct(x.ouverts, x.envoyes)}</span></>, fr(x.clics), <b className="font-semibold">{x.leads}</b>,
                ] }))} />
            ) : <p className="py-4 text-colonne text-encre-2">Lecture des campagnes impossible pour l'instant.</p>}
          </Panneau>
        </div>
      </div>

      {fenetre ? <ReglageObjectif fenetre={fenetre} reglage={reglage} reel={reel} onFermer={() => setFenetre(null)} onEnregistre={(r) => { setReglageLocal(r); setFenetre(null); setCle((x) => x + 1) }} /> : null}
    </div>
  )
}
