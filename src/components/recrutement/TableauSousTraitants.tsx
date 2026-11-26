// ════════════════════════════════════════════════════════════════════════════
// SOUS-TRAITANTS › DASHBOARD : LE COCKPIT DU RECRUTEMENT (maquette validée par le gérant le 26/11/2026).
// En tête : les sous-traitants qui TRAVAILLENT chez STC Bâtiment (actifs, nouveaux, revenus, sortis), sur le modèle
// des agences actives ; puis le recrutement de Baticom : l'état de la machine, l'entonnoir de la base à l'artisan
// actif, la cadence des dossiers, où on a des artisans et où il en manque, et les listes de suivi. Tout est lu EN
// DIRECT (rafraîchi toutes les 60 s quand l'onglet est visible) : Baticom (fiches, envois, clics, dossiers, contrats,
// réglages de la machine) et STC Bâtiment (la passerelle parametres.chiffres_stc). L'écran Machine garde ses commandes.
// Calculs : lib/tableauSt.ts et lib/cockpitStc.ts ; lectures : lib/tableauStDb.ts.
// ════════════════════════════════════════════════════════════════════════════
import { useMemo, useState, type ReactNode } from "react"
import { Play } from "lucide-react"
import { Bandeau as BandeauAlerte, Bouton, Chargement } from "../../ui"
import { chargerTableauSt } from "../../lib/tableauStDb"
import { erreursParCause } from "../../lib/statsMachine"
import { estActif, lignesSt, lireChiffres, moisIso, mouvementsSt } from "../../lib/cockpitStc"
import { clicsHorsRobots, joursDepuis, moisAuJour, origineParEmail, parCorps, parMois, parSecteur, parSemaines, parZone, premiersContacts, zoneRangee } from "../../lib/tableauSt"
import { lundisRecents } from "../../lib/cockpitTelepro"
import { useRafraichi } from "../cockpit/useRafraichi"
import { AttenteStc, BandeauCotes, Barre, Colonnes, Cote, Direct, Grille, Jauge, MiniCourbe, Panneau, TeteEcran, Tuile, Unites } from "../cockpit/pieces"
import { REGLE_ST, euros, fr, moisCourt, pct } from "../cockpit/format"
import { ListeSousTraitants, ResumeSt, SoldeSousTraitants } from "../cockpit/sousTraitants"

/** Le premier mois du recrutement suivi (le premier import date du 29/07/2026). */
const DEBUT_RECRUTEMENT = "2026-07"
const jj = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
const seance = (d: Date) => `Séance du ${d.toLocaleDateString("fr-FR", { weekday: "short" })} ${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} · ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
const nomFiche = (f: { entreprise: string; contact: string }) => f.entreprise || f.contact || "Sans nom"

function Ligne({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t-[0.5px] border-trait py-1.5 text-[12.5px]">
      <span className="shrink-0 text-encre-2">{libelle}</span><span className="chiffres min-w-0 text-right text-encre">{children}</span>
    </div>
  )
}

export default function TableauSousTraitants({ onDemarrer }: { onDemarrer?: () => void }) {
  const { d, erreur, recharger } = useRafraichi(chargerTableauSt)
  const [vue, setVue] = useState<"actifs" | "suivis" | "tous">("suivis")

  const c = useMemo(() => {
    if (!d) return null
    const m = d.maintenant
    // ── STC Bâtiment ──
    const brut = lireChiffres(d.brutStc)
    const sts = brut?.sous_traitants ?? null
    const st = sts ? { lignes: lignesSt(sts, m), mouvements: mouvementsSt(sts, m), comptes: sts.length, ouverts: sts.filter((s) => s.compte_actif).length } : null
    const actifs = st ? st.lignes.filter(estActif) : []
    const origine = origineParEmail(d.fiches, d.dossiers)
    // ── Le recrutement de Baticom ──
    const contacts = premiersContacts(d.envois)
    const cl = clicsHorsRobots(d.clics)
    const deposes = d.dossiers.map((x) => x.creeLe)
    const contrats = d.fiches.filter((f) => f.contratLe && f.contratStatut && f.contratStatut !== "annule" && f.contratStatut !== "erreur")
    const emailsMachine = new Set(st ? st.lignes.filter((x) => origine(x.email) === "machine").map((x) => x.nom) : [])
    const lundis = lundisRecents(m, 12)
    const reussis = d.envois.filter((e) => e.statut === "envoye")
    const fichesParId = new Map(d.fiches.filter((f) => f.id).map((f) => [f.id as string, f]))
    return {
      m, st, actifs, origine,
      base: d.fiches.length,
      aContacter: d.fiches.filter((f) => f.statut === "a_contacter").length,
      aContacterAvecMail: d.fiches.filter((f) => f.statut === "a_contacter" && f.email).length,
      enSequence: d.fiches.filter((f) => f.statut === "en_sequence").length,
      contactes: contacts.size, cliqueurs: cl.premier.size, robotsSeuls: cl.robotsSeuls, rafale: cl.rafale,
      dossiers: d.dossiers.length, dossiersFiches: d.dossiers.filter((x) => x.sousTraitantId).length, dossiersTraites: d.dossiers.filter((x) => x.traiteLe).length,
      contratsEnvoyes: contrats.length,
      contratsSignesArtisan: d.fiches.filter((f) => f.contratStatut === "signe_artisan").length,
      contratsComplets: d.fiches.filter((f) => f.contratStatut === "signe").length,
      comptesMachine: emailsMachine.size, actifsMachine: actifs.filter((x) => emailsMachine.has(x.nom)),
      duRecrutement: st ? st.lignes.filter((x) => origine(x.email)) : [],
      desinscrits: d.fiches.filter((f) => f.desinscritLe),
      auJour: {
        contactes: moisAuJour([...contacts.values()], m), cliqueurs: moisAuJour([...cl.premier.values()], m),
        dossiers: moisAuJour(deposes, m), contrats: moisAuJour(contrats.map((f) => f.contratLe), m),
      },
      mois: {
        contactes: parMois([...contacts.values()], DEBUT_RECRUTEMENT, m), cliqueurs: parMois([...cl.premier.values()], DEBUT_RECRUTEMENT, m),
        dossiers: parMois(deposes, DEBUT_RECRUTEMENT, m), contrats: parMois(contrats.map((f) => f.contratLe), DEBUT_RECRUTEMENT, m),
      },
      lundis, semDossiers: parSemaines(deposes, lundis, m), semEnvois: parSemaines(reussis.map((e) => e.envoyeLe), lundis, m),
      envoisJour: reussis.filter((e) => new Date(e.envoyeLe) >= new Date(m.getFullYear(), m.getMonth(), m.getDate())).length,
      envoisSemaine: parSemaines(reussis.map((e) => e.envoyeLe), [lundis[lundis.length - 1]], m)[0],
      dernierEnvoi: reussis.reduce<string | null>((x, e) => (!x || e.envoyeLe > x ? e.envoyeLe : x), null),
      erreurs: erreursParCause(d.envois, 0).slice(0, 4),
      sautes: d.envois.filter((e) => e.statut === "saute").length,
      corps: parCorps(d.fiches, d.objectifs, contacts, cl.premier, st?.lignes ?? []),
      zones: parZone(d.fiches, contacts, cl.premier),
      secteurs: parSecteur(actifs),
      aTraiter: d.dossiers.filter((x) => !x.traiteLe).sort((a, b) => a.creeLe.localeCompare(b.creeLe)).map((x) => {
        const f = x.sousTraitantId ? fichesParId.get(x.sousTraitantId) : undefined
        return { id: x.id, le: x.creeLe, nom: x.raisonSociale || (f ? nomFiche(f) : "Sans nom"), metier: f?.metier ?? "—", zone: f ? zoneRangee(f.zone) : "—", ouvert: Boolean(x.vuLe), note: !f ? "sans fiche rattachée" : f.contratStatut === "signe_artisan" ? "contrat déjà signé par l'artisan" : "" }
      }),
      contratsEnAttente: d.fiches.filter((f) => f.contratStatut === "signe_artisan").map((f) => {
        const compte = st?.lignes.find((x) => x.email && x.email === (f.email || "").toLowerCase())
        return { id: f.id ?? nomFiche(f), nom: nomFiche(f), envoye: f.contratLe ?? null, stc: compte ? (compte.compteActif ? (compte.total ? `compte STC ouvert, ${compte.total} mission${compte.total > 1 ? "s" : ""}` : "compte STC ouvert, aucune mission") : "compte STC fermé") : "pas de compte STC" }
      }),
      rappels: d.fiches.filter((f) => f.rappelLe && new Date(f.rappelLe) <= new Date(m.getFullYear(), m.getMonth(), m.getDate() + 1)).sort((a, b) => (a.rappelLe ?? "").localeCompare(b.rappelLe ?? "")),
      objectifHebdo: d.objectifs.filter((o) => o.actif).reduce((t, o) => t + o.objectifHebdo, 0),
    }
  }, [d])

  if (!d || !c) {
    return (
      <div className="@container w-full">
        <TeteEcran titre="Dashboard" sous="Sous-traitants" />
        <div className="p-4">{erreur ? <BandeauAlerte role="alerte" action={<Bouton taille="sm" onClick={recharger}>Réessayer</Bouton>}>{erreur}</BandeauAlerte> : <Chargement texte="Lecture du recrutement…" />}</div>
      </div>
    )
  }

  const { m, st, actifs } = c
  const pil = d.pilotage
  const enMarche = Boolean(pil?.actif)
  const arret = pil?.arreteLe ? new Date(pil.arreteLe) : null
  const joursArret = arret ? joursDepuis(pil!.arreteLe!, m) : null
  const sequence = d.sequences.find((s) => s.id === (pil?.sequenceId || d.sequences.find((x) => x.actif)?.id))?.nom ?? "aucune"
  const corpsEpuises = c.corps.filter((x) => x.objectif > 0 && x.reste <= 3)
  const nov = st?.mouvements[st.mouvements.length - 1] ?? null, oct = st?.mouvements[st.mouvements.length - 2] ?? null
  const missions30 = actifs.reduce((t, x) => t + x.missions30, 0), missions30Avant = st ? st.lignes.reduce((t, x) => t + x.missions30Avant, 0) : 0
  const montant30 = actifs.reduce((t, x) => t + x.montant30, 0)
  const liste = st ? st.lignes.filter((x) => vue === "tous" || (vue === "actifs" ? estActif(x) : x.statut !== "inactif")) : []
  const moisAv = moisCourt(moisIso(new Date(m.getFullYear(), m.getMonth() - 1, 1)))
  const moisC = moisCourt(moisIso(m))
  const MARCHES: { libelle: string; n: number; sur?: number; avant?: number; mois?: number; note: string; ton?: string; vide?: boolean }[] = [
    { libelle: "Artisans dans la base", n: c.base, note: `${fr(c.aContacter)} jamais contactés` },
    { libelle: "Contactés", n: c.contactes, sur: c.base, avant: c.auJour.contactes.avant, mois: c.auJour.contactes.mois, note: "au moins un e-mail ou SMS bien parti" },
    { libelle: "Ont cliqué", n: c.cliqueurs, sur: c.contactes, avant: c.auJour.cliqueurs.avant, mois: c.auJour.cliqueurs.mois, note: `hors robots (${c.robotsSeuls} artisans n'avaient que des clics de robot)` },
    { libelle: "Dossier déposé", n: c.dossiers, sur: c.cliqueurs, avant: c.auJour.dossiers.avant, mois: c.auJour.dossiers.mois, note: `${c.dossiersFiches} rattachés à une fiche, ${c.dossiers - c.dossiersFiches} sans fiche · ${c.dossiersTraites} marqués traités` },
    { libelle: "Qualifié", n: d.qualifies, sur: c.dossiers, vide: d.qualifies === 0, note: d.qualifies ? "fiches de qualification remplies" : "le questionnaire de qualification n'a jamais été rempli" },
    { libelle: "Contrat envoyé", n: c.contratsEnvoyes, sur: c.dossiers, avant: c.auJour.contrats.avant, mois: c.auJour.contrats.mois, note: "taux sur les dossiers déposés" },
    { libelle: "Contrat signé des deux côtés", n: c.contratsComplets, sur: c.contratsEnvoyes, ton: c.contratsComplets ? undefined : "text-alerte", note: `${c.contratsSignesArtisan} signés par l'artisan, la signature STC manque` },
    { libelle: "Formation faite", n: d.formations, vide: d.formations === 0, note: d.formations ? "formations terminées" : "aucune formation terminée" },
    { libelle: "Compte ouvert chez STC", n: c.comptesMachine, note: st ? "relié par l'e-mail d'une fiche ou d'un dossier" : "en attente des chiffres de STC Bâtiment" },
    { libelle: "Actif chez STC", n: c.actifsMachine.length, sur: c.comptesMachine, ton: "text-ok", note: c.actifsMachine.length ? c.actifsMachine.map((x) => `${x.nom} (${x.missions30} missions sur 30 j)`).join(", ") : "aucun" },
  ]

  return (
    <div className="@container w-full">
      <TeteEcran titre="Dashboard" sous="Sous-traitants · qui travaille chez STC Bâtiment, puis le recrutement : de la base à l'artisan actif"
        droite={<><Direct texte={seance(m)} />{onDemarrer ? <Bouton variante="plein" icone={<Play />} onClick={onDemarrer}>Démarrer la session</Bouton> : null}</>} />

      <div className="space-y-2 bg-fond-2 p-3">
        {erreur ? <BandeauAlerte role="attention">Dernière mise à jour impossible : {erreur}</BandeauAlerte> : null}
        {/* ═══ L'ALERTE : la machine est arrêtée ═══ */}
        {!enMarche ? (
          <div role="alert" className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-6 border-[0.5px] border-alerte/40 bg-alerte/10 px-4 py-2.5">
            <span className="flex items-center gap-2 text-[14px] font-semibold text-alerte"><span className="h-2 w-2 rounded-full bg-alerte" />Machine arrêtée{arret ? ` depuis le ${arret.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} à ${arret.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
            {joursArret !== null ? <span className="chiffres text-colonne text-encre"><b className="font-semibold">{joursArret} jours</b> sans un envoi{pil?.actifDepuis && arret ? ` · elle avait tourné ${Math.round((arret.getTime() - new Date(pil.actifDepuis).getTime()) / 86_400_000)} jours (depuis le ${jj(pil.actifDepuis)})` : ""}</span> : null}
            <span className="chiffres text-colonne text-encre"><b className="font-semibold">{c.aContacter}</b> artisans jamais contactés ({c.aContacterAvecMail} avec e-mail) · <b className="font-semibold">{c.enSequence}</b> en séquence</span>
            {corpsEpuises.length ? <span className="chiffres text-colonne text-alerte">base épuisée pour {corpsEpuises.map((x) => x.libelle).join(", ")}</span> : null}
          </div>
        ) : null}

        {/* ═══ LE BANDEAU DE COTES ═══ */}
        <BandeauCotes>
          <Tuile periode="mois" libelle="Actifs chez STC" valeur={st ? actifs.length : "—"} cote={st && oct ? <Cote n={actifs.length} avant={oct.actifs} unite="nb" /> : undefined} accent={st ? "ok" : undefined}
            repere={st && nov ? <><span className="text-ok">+{nov.nouveaux.length} nouv. · +{nov.revenus.length} rev.</span> · <span className="text-alerte">−{nov.sortis.length} sorti{nov.sortis.length > 1 ? "s" : ""}</span>{oct ? ` · fin ${moisAv} ${oct.actifs}` : ""}</> : "en attente de STC Bâtiment"}
            courbe={st ? <MiniCourbe valeurs={st.mouvements.map((x) => x.actifs)} ton="ok" /> : null} title={`STC Bâtiment. ${REGLE_ST} Courbe : actifs en fin de mois.`} />
          <Tuile periode="30 j" libelle="Missions STC" valeur={st ? missions30 : "—"} cote={st ? <Cote n={missions30} avant={missions30Avant} /> : undefined}
            repere={st ? <>vs {missions30Avant} les 30 j d'avant · {euros(montant30)}</> : "en attente de STC Bâtiment"} title="Missions envoyées aux artisans dans STC Bâtiment (hors brouillons, retirées, refusées). Barres : une par sous-traitant actif."
            courbe={st ? <MiniCourbe barres valeurs={actifs.map((x) => x.missions30)} /> : null} />
          <Tuile periode="STC" libelle="Issus machine" valeur={st ? <>{c.actifsMachine.length}<span className="text-[14px] font-normal text-encre-2"> / {actifs.length}</span></> : "—"}
            repere={st ? <>{c.actifsMachine.map((x) => x.nom).join(", ") || "aucun"} · {c.comptesMachine} comptes ouverts</> : "en attente de STC Bâtiment"} title="Actifs dont l'e-mail est celui d'une fiche ou d'un dossier de la machine de recrutement Baticom"
            courbe={st ? <Jauge realise={c.actifsMachine.length} objectif={Math.max(1, actifs.length)} ton="bg-ok" h={6} /> : null} />
          <Tuile periode="base" libelle="Base artisans" valeur={fr(c.base)} repere={<>{c.aContacter} jamais contactés · {c.enSequence} en séquence</>}
            courbe={<Jauge realise={c.base - c.aContacter} objectif={Math.max(1, c.base)} ton="bg-info" h={6} />} title={`Jauge : ${fr(c.base - c.aContacter)} déjà passés dans la machine sur ${fr(c.base)}`} />
          <Tuile periode="année" libelle="Contactés" valeur={fr(c.contactes)} cote={<Cote n={c.auJour.contactes.mois} avant={c.auJour.contactes.avant} />}
            repere={<>{moisC} {c.auJour.contactes.mois} · {moisAv} (1→{m.getDate()}) {c.auJour.contactes.avant}</>} accent={c.auJour.contactes.mois ? undefined : "alerte"}
            courbe={<MiniCourbe barres valeurs={c.mois.contactes.n} enCours />} title="Premier envoi bien parti. Barres : par mois. La cote : ce mois contre le mois d'avant au même jour." />
          <Tuile periode="année" libelle="Ont cliqué" valeur={c.cliqueurs} cote={<Cote n={c.auJour.cliqueurs.mois} avant={c.auJour.cliqueurs.avant} />}
            repere={<>{moisC} {c.auJour.cliqueurs.mois} · {moisAv} {c.auJour.cliqueurs.avant} · hors robots</>}
            courbe={<MiniCourbe barres valeurs={c.mois.cliqueurs.n} enCours />} title={`Artisans ayant ouvert un lien de candidature ou le barème. Écartés : les liens ouverts en rafale par les robots des messageries (${c.rafale.clics} clics chez ${c.rafale.artisans} artisans).`} />
          <Tuile periode="année" libelle="Dossiers déposés" valeur={c.dossiers} cote={<Cote n={c.auJour.dossiers.mois} avant={c.auJour.dossiers.avant} />}
            repere={<>{moisC} {c.auJour.dossiers.mois} · <span className={c.aTraiter.length ? "text-alerte" : ""}>{c.aTraiter.length} à traiter</span></>}
            courbe={<MiniCourbe barres valeurs={c.mois.dossiers.n} enCours />} title="Dossiers déposés sur le site. Barres : par mois." />
          <Tuile periode="année" libelle="Qualifiés" valeur={d.qualifies} ton={d.qualifies ? "text-encre" : "text-encre-2"} repere={<>{d.qualifies ? "fiches de qualification" : "questionnaire jamais rempli"} · {c.dossiersTraites} dossiers marqués traités</>} />
          <Tuile periode="année" libelle="Contrats partis" valeur={c.contratsEnvoyes} repere={<>{moisC} {c.auJour.contrats.mois} · {moisAv} {c.auJour.contrats.avant}</>}
            courbe={<MiniCourbe barres valeurs={c.mois.contrats.n} enCours />} />
          <Tuile periode="année" libelle="Contrats signés" valeur={c.contratsComplets} ton={c.contratsComplets ? "text-encre" : "text-alerte"} accent={c.contratsSignesArtisan ? "alerte" : undefined}
            repere={<>{c.contratsSignesArtisan} signés par l'artisan, attendent STC</>}
            courbe={<Jauge realise={c.contratsComplets} objectif={Math.max(1, c.contratsEnvoyes)} attendu={c.contratsSignesArtisan} ton="bg-alerte" h={6} />} />
          <Tuile periode="année" libelle="Formation faite" valeur={d.formations} ton={d.formations ? "text-encre" : "text-encre-2"} repere={d.formations ? "formations terminées" : "aucune formation terminée"} />
          <Tuile periode="jour" libelle="Machine" valeur={enMarche ? "En marche" : "Arrêtée"} ton={enMarche ? "text-ok" : "text-alerte"} accent={enMarche ? "ok" : "alerte"} repere={<>{c.envoisJour} envoi{c.envoisJour > 1 ? "s" : ""} aujourd'hui{c.dernierEnvoi ? ` · dernier le ${jj(c.dernierEnvoi)}` : ""}</>}
            courbe={<MiniCourbe barres ton={enMarche ? "info" : "alerte"} valeurs={c.semEnvois} />} title="Barres : envois réussis par semaine, 12 semaines" />
        </BandeauCotes>

        <div className="grid grid-flow-row-dense grid-cols-1 gap-2 @min-[760px]:grid-cols-2 @min-[1100px]:grid-cols-3 @min-[1500px]:grid-cols-4">
          {/* ═══ LES SOUS-TRAITANTS QUI TRAVAILLENT CHEZ STC BÂTIMENT ═══ */}
          <Panneau className="@min-[760px]:col-span-2 @min-[1100px]:col-span-3 @min-[1500px]:row-span-2" titre="Sous-traitants actifs chez STC Bâtiment" compte={st ? actifs.length : undefined}
            droite={st ? <span><b className="chiffres font-semibold text-encre">{missions30}</b> missions et <b className="chiffres font-semibold text-encre">{euros(montant30)}</b> de missions sur 30 j</span> : undefined}
            outils={st ? <Unites valeur={vue} onChange={setVue} options={[{ id: "actifs", label: "Actifs", title: "Au moins une mission sur 30 jours, compte ouvert" }, { id: "suivis", label: "+ sortis, sans mission", title: "Actifs, sortis ce mois, comptes fermés récemment, comptes ouverts jamais missionnés" }, { id: "tous", label: "Tous", title: `Les ${st.comptes} comptes de STC Bâtiment (hors compte d'essai)` }]} /> : undefined}>
            {st ? <>
              <ResumeSt mouvements={st.mouvements} actifs={actifs.length} maintenant={m} comptes={{ ouverts: st.ouverts, total: st.comptes }} />
              <ListeSousTraitants lignes={liste} maintenant={m} origine={(l) => c.origine(l.email)} detaille />
              <p className="mt-2 text-colonne text-encre-2">{REGLE_ST} STC Bâtiment n'a pas de notion d'activité : sa case « actif » ne dit que si le compte est ouvert ({st.ouverts} comptes ouverts sur {st.comptes}). Le compte d'essai « Adan » (and@gmail.com) est écarté. Survol d'une ligne : la raison du statut.</p>
            </> : <AttenteStc />}
          </Panneau>

          <div className="grid min-w-0 gap-2 @min-[760px]:col-span-2 @min-[760px]:grid-cols-2 @min-[1100px]:col-span-3 @min-[1500px]:col-span-1 @min-[1500px]:row-span-2 @min-[1500px]:grid-cols-1 @min-[1500px]:grid-rows-[auto_1fr]">
            {st ? <SoldeSousTraitants mouvements={st.mouvements} maintenant={m} /> : <Panneau titre="Solde des sous-traitants actifs"><AttenteStc /></Panneau>}
            {/* Le lien avec le recrutement */}
            <section className="flex min-w-0 flex-1 flex-col rounded-6 bg-encre px-4 pb-4 pt-3.5 text-white">
              <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.08em] text-[#C7C7CC]"><span>Ce que le recrutement a donné</span><span>lien par l'e-mail</span></div>
              {st ? <>
                <div className="mt-2 text-[30px] font-medium tabular-nums leading-9 tracking-[-0.02em]">{c.actifsMachine.length}<span className="text-[14px] font-normal text-[#C7C7CC]"> actifs sur {actifs.length} viennent de la machine</span></div>
                <div className="mt-1 text-[12px] text-[#C7C7CC]">{c.actifsMachine.map((x) => `${x.nom} : ${x.missions30} missions, ${euros(x.montant30)} sur 30 j`).join(" · ") || "Aucun pour l'instant."}</div>
                <ul className="mt-3 space-y-1 border-t border-white/15 pt-2 text-[12px]">
                  {c.duRecrutement.map((x) => (
                    <li key={x.nom} className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-white">{x.nom}{c.origine(x.email) === "hors base" ? <span className="text-[#8E8E93]"> (site, hors base)</span> : null}</span>
                      <span className={`shrink-0 ${x.missions30 ? "text-white" : "text-[#8E8E93]"}`}>{x.missions30 ? `${x.missions30} missions / 30 j` : !x.compteActif ? "compte fermé" : x.total ? "pas de mission sur 30 j" : "compte ouvert, jamais missionné"}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-3 text-[11px] text-[#8E8E93]">{c.duRecrutement.length} comptes STC portent l'e-mail d'un artisan du recrutement.</div>
              </> : <div className="mt-3 text-[13px] text-[#C7C7CC]">En attente des chiffres de STC Bâtiment.</div>}
            </section>
          </div>

          {/* ═══ L'ENTONNOIR ═══ */}
          <Panneau className="@min-[760px]:col-span-2 @min-[1500px]:col-span-3" titre="Entonnoir du recrutement" compte={`${fr(c.base)} → ${c.actifsMachine.length}`} droite={`taux : part de l'étape d'avant · ${moisAv} et ${moisC} au même jour`}>
            <Grille
              colonnes={[{ titre: "Étape" }, { titre: "", largeur: "14%" }, { titre: "Total", largeur: "56px", droite: true }, { titre: "Taux", largeur: "64px", droite: true, title: "Part de l'étape d'avant" }, { titre: `${moisAv} 1→${m.getDate()}`, largeur: "76px", droite: true }, { titre: `${moisC} 1→${m.getDate()}`, largeur: "76px", droite: true }, { titre: "Ce qu'il faut savoir", largeur: "34%" }]}
              lignes={MARCHES.map((x) => ({ cle: x.libelle, title: x.note, cellules: [
                <span className="font-medium">{x.libelle}</span>,
                <Barre v={x.n} max={Math.max(1, c.base)} ton={x.ton === "text-ok" ? "bg-ok" : x.n === 0 ? "bg-alerte" : "bg-info"} />,
                <b className={`font-semibold ${x.n === 0 ? "text-alerte" : x.ton ?? ""}`}>{fr(x.n)}</b>,
                x.sur !== undefined ? <span className="text-encre-2">{pct(x.n, x.sur)}</span> : <span className="text-encre-3">—</span>,
                x.avant !== undefined ? <span className="text-encre-2">{fr(x.avant)}</span> : <span className="text-encre-3">—</span>,
                x.mois !== undefined ? <span className={x.mois === 0 ? "font-medium text-alerte" : "text-encre"}>{fr(x.mois)}</span> : <span className="text-encre-3">—</span>,
                <span className={`text-colonne ${x.vide ? "text-alerte" : "text-encre-2"}`}>{x.note}</span>,
              ] }))} />
          </Panneau>

          {/* ═══ LA MACHINE (lecture seule : les commandes sont sur l'écran Machine) ═══ */}
          <Panneau titre="La machine" droite={<span className={`inline-flex items-center gap-1.5 rounded-3 px-2 py-0.5 font-medium ${enMarche ? "bg-ok/10 text-ok" : "bg-alerte/10 text-alerte"}`}><span className={`h-1.5 w-1.5 rounded-full ${enMarche ? "bg-ok" : "bg-alerte"}`} />{enMarche ? "en marche" : "arrêtée"}</span>}>
            <div className="py-2">
              <div className={`text-[15px] font-semibold ${enMarche ? "text-ok" : "text-alerte"}`}>{enMarche ? `En marche${pil?.actifDepuis ? ` depuis le ${new Date(pil.actifDepuis).toLocaleDateString("fr-FR")}` : ""}` : `Arrêtée${arret ? ` depuis le ${arret.toLocaleDateString("fr-FR")} · ${joursArret} j` : ""}`}</div>
              <div className="text-colonne text-encre-2">{pil?.adresseEnvoi || "adresse d'envoi non réglée"}</div>
            </div>
            <Ligne libelle="Séquence">{sequence}</Ligne>
            <Ligne libelle="En séquence">{c.enSequence} artisan{c.enSequence > 1 ? "s" : ""}</Ligne>
            <Ligne libelle="Jamais contactés">{c.aContacter} <span className="text-encre-2">({c.aContacterAvecMail} avec e-mail)</span></Ligne>
            <Ligne libelle="Envois aujourd'hui">{c.envoisJour} <span className="text-encre-2">/ {pil?.plafondJour ?? "—"} e-mails + {pil?.plafondSmsJour ?? "—"} SMS</span></Ligne>
            <Ligne libelle="Envois cette semaine">{c.envoisSemaine}{c.dernierEnvoi ? <span className="text-encre-2"> · dernier le {jj(c.dernierEnvoi)}</span> : null}</Ligne>
            <Ligne libelle="Passages aujourd'hui">{d.passagesAujourdhui}</Ligne>
            <Ligne libelle="Désinscriptions"><b className="font-semibold">{c.desinscrits.length}</b> <span className="text-encre-2">· {c.desinscrits.filter((f) => f.desinscritCanal === "lien").length} lien, {c.desinscrits.filter((f) => f.desinscritCanal === "plainte").length} plaintes</span></Ligne>
            {c.erreurs.length ? (
              <div className="border-t-[0.5px] border-trait pt-1.5">
                <div className="text-[12.5px] text-encre-2">Envois ratés, depuis le début</div>
                {c.erreurs.map((e) => (
                  <div key={e.cause} className="mt-1 grid grid-cols-[1fr_48px] items-center gap-2 text-colonne">
                    <span className="truncate text-encre" title={e.cause}>{e.cause}</span><span className="chiffres text-right font-medium text-alerte">{fr(e.n)}</span>
                    <span className="col-span-2"><Barre v={e.n} max={c.erreurs[0].n} ton="bg-alerte" h={4} /></span>
                  </div>
                ))}
                {c.sautes ? <p className="mt-1.5 text-colonne text-encre-2">Les {fr(c.sautes)} étapes sautées (par exemple « fiche sans e-mail ») ne sont pas des erreurs.</p> : null}
              </div>
            ) : null}
          </Panneau>

          {/* ═══ PAR CORPS DE MÉTIER ═══ */}
          <Panneau className="@min-[760px]:col-span-2" titre="Par corps de métier" droite="besoin : l'objectif par semaine réglé dans la machine · un artisan multi-corps compte dans chacun">
            <Grille
              colonnes={[{ titre: "Corps" }, { titre: "Obj./sem.", largeur: "80px", droite: true }, { titre: "Base", largeur: "52px", droite: true }, { titre: "À contacter", largeur: "96px", droite: true }, { titre: "Contactés", largeur: "84px", droite: true }, { titre: "Cliqué", largeur: "60px", droite: true }, { titre: "Dossiers", largeur: "76px", droite: true }, { titre: "Actifs STC", largeur: "74px", droite: true, title: "Sous-traitants actifs dont la spécialité (texte libre dans STC) cite ce corps" }]}
              lignes={c.corps.map((x) => {
                const epuise = x.objectif > 0 && x.reste <= 3
                return { cle: x.corps, cellules: [
                  <span className="font-medium">{x.libelle}</span>,
                  x.objectif ? <b className="font-semibold">{x.objectif}</b> : <span className="text-encre-3">—</span>,
                  fr(x.base),
                  <span className={epuise ? "font-semibold text-alerte" : ""} title={epuise ? "Plus personne à contacter pour ce corps : il faut réimporter" : undefined}>{fr(x.reste)}{epuise ? " · épuisé" : ""}</span>,
                  <span className="text-encre-2">{fr(x.contactes)}</span>, <span className="text-encre-2">{fr(x.cliques)}</span>, <b className="font-semibold">{x.deposes}</b>,
                  st ? <span className={x.actifsStc ? "text-encre" : "text-alerte"}>{x.actifsStc}</span> : <span className="text-encre-3">—</span>,
                ] }
              })} />
          </Panneau>

          {/* ═══ PAR ZONE ═══ */}
          <Panneau className="@min-[760px]:col-span-2 @min-[1100px]:col-span-1 @min-[1500px]:col-span-2" titre="Par zone" droite="pas de besoin par zone en base">
            <div className="grid gap-x-6 @min-[760px]:@max-[1100px]:grid-cols-[3fr_2fr] @min-[1500px]:grid-cols-[3fr_2fr]">
              <div>
                <div className="pt-2 text-colonne text-encre-2">Base du recrutement (Baticom)</div>
                <Grille colonnes={[{ titre: "Zone" }, { titre: "Base", largeur: "52px", droite: true }, { titre: "À contacter", largeur: "88px", droite: true }, { titre: "Dossiers", largeur: "70px", droite: true }]}
                  lignes={c.zones.map((z) => ({ cle: z.zone, ton: z.base < 5 ? "text-encre-2" : "", title: `${z.contactes} contactés, ${z.cliques} ont cliqué`, cellules: [<span className="font-medium">{z.zone}</span>, fr(z.base), fr(z.reste), <b className="font-semibold">{z.deposes}</b>] }))} />
              </div>
              <div>
                <div className="pt-2 text-colonne text-encre-2">Actifs chez STC, par secteur (ne recoupe pas les zones Baticom)</div>
                {st ? <Grille colonnes={[{ titre: "Secteur" }, { titre: "Actifs", largeur: "52px", droite: true }]}
                  lignes={c.secteurs.map((x) => ({ cle: x.secteur, title: x.noms, ton: x.secteur === "Pas de secteur" ? "text-encre-2" : "", cellules: [<span className="font-medium" title={x.noms}>{x.secteur}</span>, <b className="font-semibold">{x.actifs}</b>] }))} /> : <AttenteStc />}
              </div>
            </div>
          </Panneau>

          {/* ═══ LA CADENCE ═══ */}
          <Panneau className="@min-[760px]:col-span-2" titre="Dossiers déposés par semaine" compte={c.semDossiers.reduce((t, x) => t + x, 0)} droite={c.objectifHebdo ? `12 sem. · objectif ${c.objectifHebdo} / sem. (réglé dans la machine)` : "12 sem."}>
            <div className="pt-4"><Colonnes h={120} valeurs={c.semDossiers} etiquettes={c.lundis.map((l, i) => (i % 2 && i !== c.lundis.length - 1 ? "" : jj(l.toISOString())))} enCours={c.lundis.length - 1} ligne={c.objectifHebdo || undefined} ligneLibelle={c.objectifHebdo ? `obj. ${c.objectifHebdo}` : undefined}
              titre={(i) => `Semaine du ${c.lundis[i].toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} : ${c.semDossiers[i]} dossier${c.semDossiers[i] > 1 ? "s" : ""}, ${c.semEnvois[i]} envois${i === c.lundis.length - 1 ? " (en cours)" : ""}`} /></div>
            <div className="mt-2 border-t-[0.5px] border-trait pt-2">
              <div className="mb-1 flex items-center justify-between text-colonne text-encre-2"><span>Envois réussis de la machine, mêmes semaines</span><span className="chiffres">{fr(c.semEnvois.reduce((t, x) => t + x, 0))}</span></div>
              <MiniCourbe barres valeurs={c.semEnvois} h={34} />
            </div>
          </Panneau>

          {/* ═══ LES LISTES DE SUIVI ═══ */}
          <Panneau className="@min-[760px]:col-span-2 @min-[1100px]:col-span-3 @min-[1500px]:col-span-2" titre="Dossiers déposés à traiter" compte={c.aTraiter.length} droite="pas encore marqués traités · le plus ancien d'abord">
            {c.aTraiter.length ? (
              <Grille colonnes={[{ titre: "Déposé", largeur: "64px" }, { titre: "Artisan" }, { titre: "Métier", largeur: "22%" }, { titre: "Zone", largeur: "18%" }, { titre: "Attend", largeur: "64px", droite: true }, { titre: "Ouvert", largeur: "56px" }]}
                lignes={c.aTraiter.map((x) => ({ cle: x.id, title: x.note || undefined, cellules: [
                  <span className="chiffres text-encre-2">{jj(x.le)}</span>,
                  <span><span className="font-medium">{x.nom}</span>{x.note ? <span className="text-colonne text-encre-2"> · {x.note}</span> : null}</span>,
                  <span className="text-encre-2">{x.metier || "—"}</span>, <span className="text-encre-2">{x.zone}</span>,
                  <span className={joursDepuis(x.le, m) > 30 ? "font-medium text-alerte" : ""}>{joursDepuis(x.le, m)} j</span>,
                  x.ouvert ? <span className="text-encre-2">oui</span> : <span className="font-medium text-alerte">non</span>,
                ] }))} />
            ) : <p className="py-4 text-colonne text-encre-2">Aucun dossier en attente.</p>}
          </Panneau>

          <div className="grid min-w-0 content-start gap-2 @min-[760px]:col-span-2 @min-[760px]:grid-cols-2 @min-[1100px]:col-span-1 @min-[1100px]:grid-cols-1 @min-[1500px]:col-span-4 @min-[1500px]:grid-cols-2">
            <Panneau titre="Contrats non signés par STC" compte={c.contratsEnAttente.length} droite="signés par l'artisan">
              {c.contratsEnAttente.length ? <>
                <Grille colonnes={[{ titre: "Artisan" }, { titre: "Envoyé", largeur: "72px" }, { titre: "Attend", largeur: "64px", droite: true }]}
                  lignes={c.contratsEnAttente.map((x) => ({ cle: x.id, title: x.stc, cellules: [<span className="font-medium">{x.nom}</span>, <span className="chiffres text-encre-2">{x.envoye ? jj(x.envoye) : "—"}</span>, x.envoye ? <span className="font-medium text-alerte">{joursDepuis(x.envoye, m)} j</span> : <span className="text-encre-3">—</span>] }))} />
                <ul className="mt-2 space-y-0.5 text-colonne text-encre-2">{c.contratsEnAttente.map((x) => <li key={x.id}>{x.nom} : {st ? x.stc : "en attente des chiffres de STC"}</li>)}</ul>
              </> : <p className="py-4 text-colonne text-encre-2">Aucun contrat en attente de la signature STC.</p>}
            </Panneau>

            <Panneau titre="Artisans à rappeler" compte={c.rappels.length} droite="aujourd'hui et en retard">
              {c.rappels.length ? (
                <Grille colonnes={[{ titre: "Artisan" }, { titre: "Métier", largeur: "30%" }, { titre: "Prévu", largeur: "80px", droite: true }]}
                  lignes={c.rappels.slice(0, 30).map((f) => ({ cle: f.id ?? nomFiche(f), cellules: [<span className="font-medium">{nomFiche(f)}</span>, <span className="text-encre-2">{f.metier || "—"}</span>, <span className={joursDepuis(f.rappelLe!, m) > 0 ? "text-alerte" : ""}>{jj(f.rappelLe!)}</span>] }))} />
              ) : (
                <div className="py-3 text-[12.5px] text-encre-2">
                  <p className="font-medium text-encre">Liste vide.</p>
                  <p className="mt-1">Aucun rappel d'artisan n'est posé. Les artisans qui ont cliqué sans déposer attendent dans <span className="text-encre">Sous-traitants › Leads reçus</span>.</p>
                </div>
              )}
            </Panneau>
          </div>
        </div>
      </div>
    </div>
  )
}
