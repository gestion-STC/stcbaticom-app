// CAMPAGNES › DASHBOARD : LA CROISSANCE (Mahdi, 11/11/2026) : « suivre la prospection, le démarchage, le recrutement
// sous-traitant, pour voir à quelle cadence on avance ; plus tard, connecté au logiciel, le suivi de notre croissance ».
// Même dessin que les autres dashboards (style courtier). Pour les administrateurs. Calculs : lib/croissance.ts.
import { useEffect, useMemo, useState } from "react"
import { Bandeau as BandeauAlerte, Chargement } from "../../ui"
import { Bandeau, Bloc, Chapitre, Courbe, Entonnoir, Table, Variation } from "../demarchage/aujourdhui/courtier"
import { fr } from "../demarchage/aujourdhui/outils"
import { entonnoirDemarchage, entonnoirRecrutement, lundisRecents, moisCompare, parSemaine, semainesRestantes } from "../../lib/croissance"
import { chargerCroissance, type DonneesCroissance } from "../../lib/croissanceDb"

const CANAUX: { id: string; nom: string }[] = [{ id: "mail", nom: "Mails" }, { id: "sms", nom: "SMS" }, { id: "linkedin", nom: "LinkedIn" }, { id: "newsletter", nom: "Newsletters" }]
const STATUT: Record<string, string> = { active: "en cours", pause: "en pause", brouillon: "brouillon", terminee: "terminée" }
const BASE: Record<string, string> = { agences: "Gestionnaires", apporteurs: "Apporteurs", artisans: "Artisans", locataires: "Locataires", clients_gestionnaires: "Clients", sous_traitants_actifs: "Sous-traitants actifs" }

export default function Croissance() {
  const maintenant = useMemo(() => new Date(), [])
  const lundis = useMemo(() => lundisRecents(maintenant, 12), [maintenant])
  const [d, setD] = useState<DonneesCroissance | null>(null)
  const [erreur, setErreur] = useState("")
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

  const debutSemaines = lundis[0].toLocaleDateString("fr-FR", { day: "numeric", month: "long" })
  return (
    <div className="@container w-full">
      <div className="flex h-14 items-center border-b-[0.5px] border-trait px-10"><h1 className="text-sous-titre font-semibold text-encre">Dashboard</h1></div>
      <div className="px-10 pb-16">
        {erreur ? <div className="pt-6"><BandeauAlerte role="alerte">{erreur}</BandeauAlerte></div> : null}
        {!c && !erreur ? <div className="pt-6"><Chargement texte="Lecture de la croissance…" /></div> : null}
        {c ? <>
          {/* ═══ LE MOIS ═══ */}
          <Chapitre id="mois" titre="Croissance" sous="Où en est le démarchage des gestionnaires et le recrutement des artisans, ce mois-ci comparé au mois dernier.">
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
