// CAMPAGNES › DASHBOARD : LA CROISSANCE (Mahdi, 11/11/2026) : « suivre la prospection, le démarchage, le recrutement
// sous-traitant, pour voir à quelle cadence on avance ; plus tard, connecté au logiciel, le suivi de notre croissance ».
// Même dessin que les autres dashboards (style courtier). Pour les administrateurs. Calculs : lib/croissance.ts.
import { useEffect, useMemo, useState, type FormEvent } from "react"
import { Bandeau as BandeauAlerte, Bouton, Champ, Chargement } from "../../ui"
import { ecrireParametre, lireParametre } from "../../lib/parametresDb"
import { Bandeau, Bloc, Chapitre, Courbe, Entonnoir, Etiquette, Table, Variation } from "../demarchage/aujourdhui/courtier"
import { fr } from "../demarchage/aujourdhui/outils"
import { COCKPIT_DEPART, entonnoirDemarchage, entonnoirRecrutement, lundisRecents, moisCompare, parSemaine, lireReelStc, planCroissance, semainesRestantes, type ReglageCockpit, type Trajectoire } from "../../lib/croissance"
import { chargerCroissance, type DonneesCroissance } from "../../lib/croissanceDb"

const CANAUX: { id: string; nom: string }[] = [{ id: "mail", nom: "Mails" }, { id: "sms", nom: "SMS" }, { id: "linkedin", nom: "LinkedIn" }, { id: "newsletter", nom: "Newsletters" }]
const STATUT: Record<string, string> = { active: "en cours", pause: "en pause", brouillon: "brouillon", terminee: "terminée" }
const TRAJ: Record<Trajectoire, { texte: string; ton: string }> = {
  bonne: { texte: "Sur la bonne trajectoire", ton: "text-ok" },
  juste: { texte: "Un peu juste", ton: "text-attention" },
  retard: { texte: "En retard", ton: "text-alerte" },
  inconnue: { texte: "Pas encore de données", ton: "text-encre-2" },
}
const euros = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`
const moisLong = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString("fr-FR", { month: "long" })
const periode = (mois: string[]) => mois.length > 1 ? `${moisLong(mois[0])} à ${moisLong(mois[mois.length - 1])}` : moisLong(mois[0] ?? "")
const versSaisie = (r: ReglageCockpit) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)])) as Record<keyof ReglageCockpit, string>
const seuils = (r: ReglageCockpit) => ({ factureMin: r.factureMin, osMin: r.osMin, chutePct: r.chutePct })
const moyenne4 = (v: number[]) => v.slice(-5, -1).reduce((a, b) => a + b, 0) / 4
const BASE: Record<string, string> = { agences: "Gestionnaires", apporteurs: "Apporteurs", artisans: "Artisans", locataires: "Locataires", clients_gestionnaires: "Clients", sous_traitants_actifs: "Sous-traitants actifs" }

export default function Croissance() {
  const maintenant = useMemo(() => new Date(), [])
  const lundis = useMemo(() => lundisRecents(maintenant, 12), [maintenant])
  const [d, setD] = useState<DonneesCroissance | null>(null)
  const [erreur, setErreur] = useState("")
  const [reglage, setReglage] = useState<ReglageCockpit>(COCKPIT_DEPART)
  const [saisie, setSaisie] = useState<Record<keyof ReglageCockpit, string>>(() => versSaisie(COCKPIT_DEPART))
  const [enregistre, setEnregistre] = useState("")
  // Les vrais chiffres de STC Bâtiment (bruts, par agence), déposés par la synchro horaire ; les règles s'appliquent ici.
  const [brut, setBrut] = useState<string | null>(null)
  useEffect(() => { lireParametre("chiffres_stc").then(setBrut).catch(() => undefined) }, [])
  const reel = useMemo(() => lireReelStc(brut, seuils(reglage)), [brut, reglage])
  useEffect(() => {
    lireParametre("cockpit_croissance").then((x) => {
      try { const r = { ...COCKPIT_DEPART, ...JSON.parse(x || "{}") } as ReglageCockpit; setReglage(r); setSaisie(versSaisie(r)) } catch { /* réglage par défaut */ }
    }).catch(() => undefined)
  }, [])
  useEffect(() => {
    let vivant = true
    const depuis = new Date(Math.min(lundis[0].getTime(), new Date(maintenant.getFullYear(), maintenant.getMonth() - 1, 1).getTime()))
    chargerCroissance(depuis).then((x) => { if (vivant) setD(x) }).catch((e) => { if (vivant) setErreur(e instanceof Error ? e.message : String(e)) })
    return () => { vivant = false }
  }, [lundis, maintenant])

  const c = useMemo(() => {
    if (!d) return null
    const clients = d.agences.map((a) => a.premier_os_le), contrats = d.artisans.map((a) => a.contrat_signe_le), leads = d.leads.map((l) => l.cree_le)
    const series = [
      { nom: "Leads (gestionnaires)", v: parSemaine(leads, lundis) },
      { nom: "RDV pris", v: parSemaine(d.rdv, lundis) },
      { nom: "Nouveaux clients (premier OS)", v: parSemaine(clients, lundis) },
      { nom: "Dossiers d'artisans déposés", v: parSemaine(d.dossiers, lundis) },
      { nom: "Contrats d'artisans signés", v: parSemaine(contrats, lundis) },
    ]
    const parCanal = CANAUX.map((k) => {
      const ids = new Set(d.envois.filter((e) => e.canal === k.id).map((e) => e.envoi_id))
      return { ...k, envois: ids.size, clics: d.reponses.filter((r) => r.type === "clic" && r.envoi_id && ids.has(r.envoi_id)).length, reponses: d.reponses.filter((r) => r.type === "reponse" && r.envoi_id && ids.has(r.envoi_id)).length }
    }).filter((k) => k.envois > 0 || k.id === "mail")
    const parCampagne = d.campagnes.filter((k) => k.statut !== "brouillon").map((k) => ({
      ...k,
      envois: d.envois.filter((e) => e.campagne_id === k.id).length,
      reponses: d.reponses.filter((r) => r.campagne_id === k.id && r.type === "reponse").length,
      leads: d.inscriptions.filter((i) => i.campagne_id === k.id && i.statut === "lead").length,
    })).sort((a, b) => b.envois - a.envois)
    const jamaisAgences = d.agences.filter((a) => !(a.tentatives ?? 0) && a.etape === "a_prospecter" && !a.premier_os_le).length
    const jamaisArtisans = d.artisans.filter((a) => !(a.nb_envois_ok ?? 0) && !(a.nb_appels ?? 0) && a.statut === "a_contacter").length
    const agencesParSemaine = Math.round(new Set(d.appels.map((a) => a.agence_id)).size / 4)
    return {
      clients: moisCompare(clients, maintenant), contrats: moisCompare(contrats, maintenant), leads: moisCompare(leads, maintenant), rdv: moisCompare(d.rdv, maintenant), dossiers: moisCompare(d.dossiers, maintenant),
      series, parCanal, parCampagne, jamaisAgences, jamaisArtisans, agencesParSemaine,
      demarchage: entonnoirDemarchage(d.agences), recrutement: entonnoirRecrutement(d.artisans),
    }
  }, [d, lundis, maintenant])

  // Le cockpit : de l'objectif de chiffre d'affaires aux objectifs de la semaine, comparés au rythme actuel.
  const plan = useMemo(() => {
    if (!c) return null
    const [, contactees, , , , clients] = c.demarchage, [, contactes, , , contrats] = c.recrutement
    return planCroissance(reglage, {
      clientsActuels: reel ? reel.agencesActives : clients.valeur, artisansActifs: contrats.valeur,
      tauxClient: contactees.valeur ? clients.valeur / contactees.valeur : null, tauxArtisan: contactes.valeur ? contrats.valeur / contactes.valeur : null,
      clientsParSemaine: moyenne4(c.series[2].v), artisansParSemaine: moyenne4(c.series[4].v), agencesAppeleesParSemaine: c.agencesParSemaine,
    }, reel)
  }, [c, reglage, reel])
  const nombre = (x: string) => Math.max(0, Number(x.replace(/\s/g, "").replace(",", ".")) || 0)
  const enregistrer = async (e: FormEvent) => {
    e.preventDefault()
    const r: ReglageCockpit = { objectifMensuel: nombre(saisie.objectifMensuel), moisPourYArriver: Math.max(1, nombre(saisie.moisPourYArriver)), caParClient: nombre(saisie.caParClient), caParArtisan: nombre(saisie.caParArtisan), factureMin: nombre(saisie.factureMin), osMin: nombre(saisie.osMin), chutePct: Math.min(100, nombre(saisie.chutePct)) }
    const reelR = lireReelStc(brut, seuils(r))
    setReglage(r); setEnregistre("")
    try {
      await ecrireParametre("cockpit_croissance", JSON.stringify(r))
      // L'objectif du mois des gestionnaires (premiers OS) suit le cockpit : tout se met à jour.
      if (c) {
        const p = planCroissance(r, { clientsActuels: reelR ? reelR.agencesActives : c.demarchage[5].valeur, artisansActifs: c.recrutement[4].valeur, tauxClient: c.demarchage[1].valeur ? c.demarchage[5].valeur / c.demarchage[1].valeur : null, tauxArtisan: null, clientsParSemaine: 0, artisansParSemaine: 0, agencesAppeleesParSemaine: 0 }, reelR)
        if (p.premiersOsParMois > 0) await ecrireParametre("objectif_os_mensuel", String(p.premiersOsParMois))
      }
      setEnregistre("Enregistré : l'objectif du mois des gestionnaires est mis à jour.")
    } catch (x) { setErreur(x instanceof Error ? x.message : String(x)) }
  }
  const debutSemaines = lundis[0].toLocaleDateString("fr-FR", { day: "numeric", month: "long" })
  return (
    <div className="@container w-full">
      <div className="flex h-14 items-center border-b-[0.5px] border-trait px-10"><h1 className="text-sous-titre font-semibold text-encre">Dashboard</h1></div>
      <div className="px-10 pb-16">
        {erreur ? <div className="pt-6"><BandeauAlerte role="alerte">{erreur}</BandeauAlerte></div> : null}
        {!c && !erreur ? <div className="pt-6"><Chargement texte="Lecture de la croissance…" /></div> : null}
        {c ? <>
          {/* ═══ LE COCKPIT ═══ */}
          {plan ? (
            <Chapitre id="cockpit" titre="Le cockpit" sous="Ton objectif de chiffre d'affaires, ce qu'il demande chaque semaine, et si on est sur la bonne trajectoire."
              droite={<span className={`text-sous-titre font-semibold ${TRAJ[plan.global].ton}`}>{TRAJ[plan.global].texte}</span>}>
              <form onSubmit={enregistrer} className="flex flex-wrap items-end gap-4">
                {([["objectifMensuel", "Objectif de chiffre d'affaires", "€ par mois"], ["moisPourYArriver", "Pour y arriver d'ici", "mois"], ["caParClient", "Chiffre d'affaires moyen d'une agence cliente", "€ par mois"], ["caParArtisan", "Chiffre d'affaires moyen d'un sous-traitant actif", "€ par mois"]] as [keyof ReglageCockpit, string, string][]).filter(([cle]) => !(reel && cle === "caParClient")).map(([cle, titre, unite]) => (
                  <label key={cle} className="flex min-w-[170px] flex-1 flex-col gap-1">
                    <Etiquette>{titre}</Etiquette>
                    <span className="flex items-center gap-2"><Champ inputMode="numeric" value={saisie[cle]} onChange={(e) => setSaisie((x) => ({ ...x, [cle]: e.target.value }))} aria-label={titre} /><span className="shrink-0 text-colonne text-encre-2">{unite}</span></span>
                  </label>
                ))}
                {reel ? (
                  <div className="flex min-w-[170px] flex-1 flex-col gap-1" title={`Moyenne du facturé des mois où une agence tourne (au moins ${euros(reglage.factureMin)} dans le mois), de ${periode(reel.mois)} : ${reel.moisActifs} mois, toutes agences confondues`}>
                    <Etiquette>Ce que rapporte une agence active</Etiquette>
                    <span className="flex h-9 items-center gap-2"><b className="chiffres text-corps font-semibold text-encre">{euros(reel.caParAgence)}</b><span className="text-colonne text-encre-2">par mois · réel</span></span>
                  </div>
                ) : null}
                <Bouton variante="plein" type="submit">Enregistrer</Bouton>
                {reel ? (
                  <div className="flex w-full flex-wrap items-end gap-4 border-t-[0.5px] border-trait pt-4">
                    <span className="self-center text-colonne font-medium text-encre">Une agence est active si, sur les 30 derniers jours :</span>
                    {([["factureMin", "Facturé au moins", "€"], ["osMin", "OS envoyés au moins", "OS"], ["chutePct", "Et au moins, des OS du mois d'avant", "%"]] as [keyof ReglageCockpit, string, string][]).map(([cle, titre, unite]) => (
                      <label key={cle} className="flex w-[190px] flex-col gap-1">
                        <Etiquette>{titre}</Etiquette>
                        <span className="flex items-center gap-2"><Champ inputMode="numeric" value={saisie[cle]} onChange={(e) => setSaisie((x) => ({ ...x, [cle]: e.target.value }))} aria-label={titre} /><span className="shrink-0 text-colonne text-encre-2">{unite}</span></span>
                      </label>
                    ))}
                  </div>
                ) : null}
              </form>
              {enregistre ? <p className="-mt-6 text-colonne text-ok">{enregistre}</p> : <p className="-mt-6 text-colonne text-encre-2">{reel
                ? `Vrais chiffres de STC Bâtiment (facturé HT, avoirs déduits, brouillons exclus). Ce que rapporte une agence active = moyenne des mois où elle tourne (au moins ${euros(reglage.factureMin)} facturés dans le mois), de ${periode(reel.mois)}, même pour celles qui ne sont plus actives. La règle « en chute » ne juge que les agences qui avaient envoyé au moins 4 OS le mois d'avant. Mis à jour le ${reel.calculeLe.toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}. Le chiffre d'affaires moyen d'un sous-traitant reste à régler.`
                : "Les chiffres d'affaires moyens sont à régler en attendant les vrais chiffres de STC Bâtiment (la passerelle n'a encore rien déposé)."}</p>}
              <Bandeau cases={[
                { libelle: "Agences clientes nécessaires", valeur: fr(plan.clientsNecessaires), variation: <span className="chiffres text-colonne text-encre-2">{reel ? <>vous en avez {fr(reel.agencesActives)} actives sur le logiciel</> : <>vous en avez {fr(c.demarchage[5].valeur)}</>}</span>, title: reel ? `Objectif moins la part des particuliers (${euros(reel.caParticuliersMensuel)} par mois), divisé par le chiffre d'affaires d'une agence active` : undefined },
                { libelle: "Sous-traitants actifs nécessaires", valeur: fr(plan.artisansNecessaires), variation: <span className="chiffres text-colonne text-encre-2">vous en avez {fr(c.recrutement[4].valeur)}</span> },
                { libelle: reel ? "Chiffre d'affaires réel" : "Chiffre d'affaires estimé", valeur: euros(plan.caEstime), ton: plan.caEstime >= reglage.objectifMensuel ? "text-ok" : "text-encre", variation: <span className="chiffres text-colonne text-encre-2">{reglage.objectifMensuel ? Math.round((plan.caEstime / reglage.objectifMensuel) * 100) : 0} % de l'objectif</span>, title: reel ? `Facturé HT par mois, agences et particuliers, moyenne des 3 derniers mois complets (${periode(reel.mois.slice(-3))})` : "Agences clientes × chiffre d'affaires moyen d'une agence" },
                { libelle: "Premiers OS à viser", valeur: fr(plan.premiersOsParMois), variation: <span className="chiffres text-colonne text-encre-2">par mois</span>, title: "Devient l'objectif du mois des gestionnaires à l'enregistrement" },
              ]} />
              <Bloc titre="Ce qu'il faut chaque semaine" droite={`pour ${euros(reglage.objectifMensuel)} par mois d'ici ${fr(reglage.moisPourYArriver)} mois · comparé aux 4 dernières semaines`}>
                <Table colonnes={[{ titre: "Levier" }, { titre: "Il faut", largeur: "110px", droite: true }, { titre: "Vous faites", largeur: "110px", droite: true }, { titre: "", largeur: "100px" }, { titre: "Trajectoire", largeur: "190px" }]}
                  lignes={plan.leviers.map((l) => ({ cle: l.libelle, cellules: [l.libelle, <b className="font-semibold">{l.ilFaut > 0 && l.ilFaut < 0.1 ? "moins de 0,1" : l.ilFaut.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}</b>, l.onFait === null ? "—" : l.onFait.toLocaleString("fr-FR", { maximumFractionDigits: 1 }), <span className="text-encre-2">{l.unite}</span>, <span className={`font-medium ${TRAJ[l.trajectoire].ton}`}>{TRAJ[l.trajectoire].texte}</span>] }))} />
              </Bloc>
              {reel ? (
                <Bloc titre="Les agences sur le logiciel" droite={`${fr(reel.agencesActives)} actives sur ${fr(reel.agences.length)} · 30 derniers jours, et les mois de ${periode(reel.mois)}`}>
                  <Table colonnes={[{ titre: "Agence" }, { titre: "OS (30 j)", largeur: "90px", droite: true }, { titre: "Facturé (30 j)", largeur: "120px", droite: true }, { titre: "Mois où elle tourne", largeur: "150px", droite: true }, { titre: "Quand elle tourne", largeur: "140px", droite: true }, { titre: "Statut", largeur: "300px" }]}
                    lignes={[...reel.agences].sort((a, b) => Number(b.active) - Number(a.active) || b.facture_30 - a.facture_30).map((a) => ({ cle: a.nom, cellules: [
                      a.nom, fr(a.os_30), euros(a.facture_30), `${a.moisActifs} sur ${reel.mois.length}`,
                      a.moyenneQuandElleTourne === null ? "—" : `${euros(a.moyenneQuandElleTourne)} / mois`,
                      a.active ? <span className="font-medium text-ok">Active</span> : <span className="text-encre-2">{a.raison}</span>,
                    ] }))} />
                </Bloc>
              ) : null}
            </Chapitre>
          ) : null}

          {/* ═══ LE MOIS ═══ */}
          <Chapitre id="mois" titre="Le mois" sous="Où en est le démarchage des gestionnaires et le recrutement des artisans, ce mois-ci comparé au mois dernier.">
            <Bandeau cases={[
              { libelle: "Nouveaux clients", valeur: fr(c.clients.mois), ton: "text-ok", variation: <Variation unite="nb" n={c.clients.mois} avant={c.clients.avant} />, title: "Agences qui ont envoyé leur premier ordre de service" },
              { libelle: "RDV pris", valeur: fr(c.rdv.mois), variation: <Variation unite="nb" n={c.rdv.mois} avant={c.rdv.avant} /> },
              { libelle: "Leads gestionnaires", valeur: fr(c.leads.mois), ton: "text-signature", variation: <Variation n={c.leads.mois} avant={c.leads.avant} /> },
              { libelle: "Dossiers d'artisans", valeur: fr(c.dossiers.mois), variation: <Variation unite="nb" n={c.dossiers.mois} avant={c.dossiers.avant} /> },
              { libelle: "Artisans signés", valeur: fr(c.contrats.mois), ton: "text-ok", variation: <Variation unite="nb" n={c.contrats.mois} avant={c.contrats.avant} />, title: "Contrats de sous-traitance signés" },
            ]} />
          </Chapitre>

          {/* ═══ LA CADENCE ═══ */}
          <Chapitre id="cadence" titre="La cadence" sous={`Semaine par semaine, depuis le ${debutSemaines} : on voit si on accélère.`}>
            <Bloc titre="Semaine par semaine" droite="12 semaines · la semaine en cours comprise">
              <Table colonnes={[{ titre: "Indicateur" }, { titre: "Tendance", largeur: "112px" }, { titre: "Cette semaine", largeur: "104px", droite: true }, { titre: "Sem. dernière", largeur: "104px", droite: true }, { titre: "Évolution", largeur: "96px", droite: true }, { titre: "12 semaines", largeur: "100px", droite: true }]}
                lignes={c.series.map((s) => ({ cle: s.nom, cellules: [s.nom, <Courbe valeurs={s.v} />, <b className="font-semibold">{fr(s.v[11])}</b>, <span className="text-encre-2">{fr(s.v[10])}</span>, <Variation unite="nb" n={s.v[11]} avant={s.v[10]} />, fr(s.v.reduce((a, b) => a + b, 0))] }))} />
            </Bloc>
          </Chapitre>

          {/* ═══ LES ENTONNOIRS ═══ */}
          <Chapitre id="entonnoirs" titre="Les entonnoirs" sous="Toute la base, de la première prise de contact jusqu'au client, avec le taux de passage à chaque marche.">
            <div className="grid gap-x-10 gap-y-10 @min-[1100px]:grid-cols-2">
              <Bloc titre="Démarchage des gestionnaires" droite="taux : depuis la marche d'avant"><Entonnoir marches={c.demarchage} /></Bloc>
              <Bloc titre="Recrutement des artisans" droite="taux : depuis la marche d'avant"><Entonnoir marches={c.recrutement} /></Bloc>
            </div>
          </Chapitre>

          {/* ═══ LES CANAUX ET LES CAMPAGNES ═══ */}
          <Chapitre id="canaux" titre="Les canaux et les campagnes" sous="Ce que chaque canal et chaque campagne rapporte, sur les 12 semaines.">
            <div className="grid gap-x-10 gap-y-10 @min-[1100px]:grid-cols-[2fr_3fr]">
              <Bloc titre="Par canal">
                <Table colonnes={[{ titre: "Canal" }, { titre: "Envois", largeur: "80px", droite: true }, { titre: "Clics", largeur: "70px", droite: true }, { titre: "Réponses", largeur: "84px", droite: true }]}
                  lignes={c.parCanal.map((k) => ({ cle: k.id, cellules: [k.nom, fr(k.envois), fr(k.clics), <b className="font-semibold">{fr(k.reponses)}</b>] }))} />
              </Bloc>
              <Bloc titre="Par campagne" compte={c.parCampagne.length}>
                <Table vide="Aucune campagne lancée pour l'instant."
                  colonnes={[{ titre: "Campagne" }, { titre: "Base", largeur: "110px" }, { titre: "Statut", largeur: "84px" }, { titre: "Envois", largeur: "72px", droite: true }, { titre: "Réponses", largeur: "84px", droite: true }, { titre: "Leads", largeur: "64px", droite: true }]}
                  lignes={c.parCampagne.map((k) => ({ cle: k.id, cellules: [<span className="truncate" title={k.nom}>{k.nom}</span>, <span className="text-encre-2">{BASE[k.base_id] ?? k.base_id}</span>, <span className="text-encre-2">{STATUT[k.statut] ?? k.statut}</span>, fr(k.envois), fr(k.reponses), <b className={`font-semibold ${k.leads ? "text-ok" : ""}`}>{fr(k.leads)}</b>] }))} />
              </Bloc>
            </div>
          </Chapitre>

          {/* ═══ LA RÉSERVE ═══ */}
          <Chapitre id="reserve" titre="La réserve" sous="Ce qu'il reste à prospecter, et combien de temps ça tient au rythme actuel.">
            <Bandeau cases={[
              { libelle: "Agences jamais contactées", valeur: fr(c.jamaisAgences) },
              { libelle: "Agences appelées par semaine", valeur: fr(c.agencesParSemaine), variation: <span className="chiffres text-colonne text-encre-2">moyenne sur 4 semaines</span> },
              { libelle: "À ce rythme", valeur: semainesRestantes(c.jamaisAgences, c.agencesParSemaine) !== null ? `${fr(semainesRestantes(c.jamaisAgences, c.agencesParSemaine)!)} sem.` : "—", title: "Le temps pour avoir appelé toutes les agences jamais contactées" },
              { libelle: "Artisans jamais contactés", valeur: fr(c.jamaisArtisans) },
            ]} />
            <Bloc titre="Bientôt : la croissance réelle" droite="quand Baticom rejoindra le logiciel STC Bâtiment">
              <p className="py-4 text-legende text-encre-2">Les ordres de service reçus et le chiffre d'affaires des clients signés viendront s'ajouter ici. La passerelle des clients signés tourne déjà : c'est elle qui alimente « Nouveaux clients ».</p>
            </Bloc>
          </Chapitre>
        </> : null}
      </div>
    </div>
  )
}
