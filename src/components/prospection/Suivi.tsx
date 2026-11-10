// ── LE SUIVI D'UNE CAMPAGNE : toutes les données, et l'analyse (07/11/2026) ──
// Mahdi : « il faut tous les indicateurs de la campagne, toutes les données, sinon ce sera compliqué de suivre
// et d'avoir de bonnes analyses ». L'entonnoir, puis 8 vues : ensemble (analyse + d'où viennent les clics),
// étapes, A/B, audience (par champ de la base), dans le temps, journal des envois, contacts, appels.
import { useMemo, useState } from "react"
import { Copy, Pause, Pencil, Play, Sparkles } from "lucide-react"
import { Bandeau, Bouton, Pastille, Selecteur } from "../../ui"
import { Bloc, Etiquette, Table } from "../demarchage/aujourdhui/courtier"
import { useDepot } from "../../prospection/depot"
import { constats, indicateurs, type Constat } from "../../prospection/indicateurs"
import { LIBELLE_ETAPE } from "../../prospection/modele"
import { Barre, NomBase, Onglets, Titre } from "./morceaux"
import { dateHeure, euros, fr, jourCourt, pct, useVue } from "./outils"
import MesureAvis from "./moteur/MesureAvis"
import { estBaseAvis } from "../../prospection/avis"

type Vue = "ensemble" | "etapes" | "ab" | "audience" | "temps" | "envois" | "contacts" | "appels"
const PT: Record<Constat["ton"], string> = { ok: "bg-ok", attention: "bg-attention", alerte: "bg-alerte" }
const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]

export default function Suivi({ id, modifier, aller }: { id: string; modifier: () => void; aller: (e: "session" | "leads") => void }) {
  const v = useVue()
  const depot = useDepot()
  const [vue, setVue] = useState<Vue>("ensemble")
  const [champ, setChamp] = useState("")
  const [filtreEnvoi, setFiltreEnvoi] = useState("")
  const c = v.etat.campagnes.find((x) => x.id === id)
  const base = c ? v.base(c.baseId) : undefined
  const ind = useMemo(() => (c && base ? indicateurs(c, base, v.etat.contacts, v.etat.inscriptions, v.etat.envois, v.evenements, v.etat.leads, v.etat.appels) : null), [c, base, v])
  if (!c || !base || !ind || !v.idsBases.has(c.baseId)) return <p className="text-legende text-encre-2">Campagne introuvable, ou hors de tes bases.</p>
  const analyse = constats(ind)
  const marches = [
    ["Éligibles", ind.audience.eligibles, null], ["Entrés", ind.audience.entres, ind.audience.eligibles], ["Touchés", ind.engagement.touches, ind.audience.entres],
    ["Ont ouvert", ind.engagement.ouvreurs, ind.engagement.touches], ["Ont cliqué", ind.engagement.cliqueurs, ind.engagement.touches], ["Leads", ind.conversion.leads, ind.engagement.touches], ["Gagnés", ind.conversion.gagnes, ind.conversion.leads],
  ] as const
  const maxPc = Math.max(1, ...ind.parEtape.map((e) => e.premiersClics))
  const seg = ind.parSegment.find((s) => s.champ === (champ || base.champs[0]?.cle)) ?? ind.parSegment[0]
  const envois = v.etat.envois.filter((e) => e.campagneId === c.id && (!filtreEnvoi || e.statut === filtreEnvoi)).slice(-80).reverse()
  const inscs = v.etat.inscriptions.filter((i) => i.campagneId === c.id).slice(-80).reverse()
  const nomEtape = (eid: string) => { const k = c.etapes.findIndex((e) => e.id === eid); return k >= 0 ? `${k + 1} · ${LIBELLE_ETAPE[c.etapes[k].type]}` : "—" }
  const maxJour = Math.max(1, ...ind.parJour.map((j) => j.envoyes + j.erreurs))
  const maxH = Math.max(1, ...ind.ouverturesParHeure)
  const maxJs = Math.max(1, ...ind.clicsParJourSemaine)

  const arret = (c.config as { arret?: { rebonds: number; envois: number } } | null | undefined)?.arret
  const entete = <Titre titre={c.nom} sous={<><NomBase base={base} /> · {c.objectif} · <Pastille role={c.statut === "active" ? "fait" : c.statut === "pause" ? "attente" : "inerte"}>{c.statut === "active" ? "Active" : c.statut === "pause" ? "En pause" : c.statut === "brouillon" ? "Brouillon" : "Terminée"}</Pastille>{c.lanceeLe ? ` · lancée le ${dateHeure(c.lanceeLe)}` : ""} · {c.rythme.parJour} entrées max par jour{c.modeTest ? <> · <b className="font-medium text-attention">mode test : tout part vers {c.testEmail || "l'adresse de test"}</b></> : null}</>}
        droite={<>
          <Bouton icone={<Pencil />} onClick={modifier}>Modifier</Bouton>
          <Bouton icone={<Copy />} onClick={() => depot.dupliquerCampagne(c.id)}>Dupliquer</Bouton>
          {c.statut === "active" ? <Bouton icone={<Pause />} onClick={() => depot.changerStatut(c.id, "pause")}>Mettre en pause</Bouton> : <Bouton variante="plein" icone={<Play />} onClick={() => depot.changerStatut(c.id, "active")}>{c.statut === "brouillon" ? "Lancer" : "Reprendre"}</Bouton>}
        </>} />
  if (estBaseAvis(c.baseId)) return <div className="space-y-6">{entete}<MesureAvis campagneId={c.id} inscriptions={v.etat.inscriptions} envois={v.etat.envois} /></div>
  return (
    <div className="space-y-6">
      {entete}
      {c.statut === "pause" && arret ? <Bandeau role="alerte">Mise en pause automatiquement : {arret.rebonds} rebonds sur {arret.envois} envois. Nettoie ou vérifie le fichier avant de relancer.</Bandeau> : null}

      {/* L'entonnoir, marche par marche, avec le taux de passage */}
      <div className="grid grid-cols-7 border-y-[0.5px] border-trait">
        {marches.map(([l, n, sur], i) => (
          <div key={l} className={`min-w-0 px-3 py-3 ${i ? "border-l-[0.5px] border-trait" : ""}`}>
            <Etiquette className="block truncate">{l}</Etiquette>
            <p className={`chiffres mt-1 text-[22px] font-semibold leading-7 ${l === "Leads" || l === "Gagnés" ? "text-ok" : "text-encre"}`}>{fr(n)}</p>
            <p className="chiffres truncate text-colonne text-encre-2">{sur == null ? base.unite : `${pct(sur ? n / sur : null)} de « ${marches[i - 1][0].toLowerCase()} »`}</p>
            <div className="mt-2"><Barre v={n} max={Math.max(1, ind.audience.eligibles)} ton={l === "Leads" || l === "Gagnés" ? "bg-ok" : "bg-encre/70"} /></div>
          </div>
        ))}
      </div>
      {/* Les autres chiffres clés, en une ligne */}
      <dl className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-colonne @min-[1100px]:grid-cols-4">
        {([
          ["Envois partis", fr(ind.envois.envoyes)], ["En erreur", `${fr(ind.envois.erreurs)} · ${pct(ind.delivrabilite.tauxErreur)}`], ["Sautés (pas d'adresse)", fr(ind.envois.sautes)], ["Délivrés", `${fr(ind.delivrabilite.delivres)} · ${pct(ind.delivrabilite.tauxDelivrance)}`],
          ["Rebonds", fr(ind.delivrabilite.rebonds)], ["Ouvertures (total)", fr(ind.engagement.ouvertures)], ["Clic / ouvreur", pct(ind.engagement.tauxClicSurOuvert)], ["Réponses", `${fr(ind.engagement.repondants)} · ${pct(ind.engagement.tauxReponse)}`],
          ["Désinscrits", `${fr(ind.engagement.desinscriptions)} · ${pct(ind.engagement.tauxDesinscription)}`], ["Lead / touché", pct(ind.conversion.tauxLead)], ["Délai médian jusqu'au lead", ind.conversion.delaiMedianLeadJ == null ? "—" : `${ind.conversion.delaiMedianLeadJ.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} j`], ["Leads traités", `${fr(ind.conversion.leadsTraites)} / ${fr(ind.conversion.leads)}`],
          ["Appels · joints", `${fr(ind.conversion.appels)} · ${fr(ind.conversion.joints)}`], ["Gagnés / touchés", pct(ind.conversion.tauxGagne)], ["SMS · coût", `${fr(ind.couts.sms)} · ${euros(ind.couts.coutSms)}`], ["Coût par lead", euros(ind.couts.coutParLead)],
        ] as const).map(([l, val]) => <div key={l} className="flex justify-between gap-3 border-b-[0.5px] border-fond-4 py-1"><dt className="text-encre-2">{l}</dt><dd className="chiffres text-encre">{val}</dd></div>)}
      </dl>

      <Onglets<Vue> valeur={vue} onChange={setVue} options={[["ensemble", "Vue d'ensemble"], ["etapes", "Étapes"], ["ab", "Tests A/B", ind.parVariante.length || undefined], ["audience", "Audience"], ["temps", "Dans le temps"], ["envois", "Journal des envois", ind.envois.total], ["contacts", "Contacts", ind.audience.entres], ["appels", "Appels", ind.conversion.appels]]} />

      {vue === "ensemble" ? (
        <div className="grid gap-10 @min-[1200px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <Bloc titre="L'analyse" droite={<span className="flex items-center gap-1.5 text-colonne text-encre-2"><Sparkles size={12} className="text-signature" />relue à chaque passage de la machine</span>}>
            {analyse.length ? (
              <ol className="mt-2 divide-y-[0.5px] divide-trait">{analyse.map((r, i) => (
                <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 py-3">
                  <span className="flex gap-3"><span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${PT[r.ton]}`} /><span><b className="text-legende font-medium">{r.titre}</b><span className="block text-colonne text-encre-2">{r.preuve}</span></span></span>
                  <Bouton taille="sm" onClick={r.action.includes("session") ? () => aller("session") : r.action.includes("version") || r.action.includes("Si…") ? modifier : undefined}>{r.action}</Bouton>
                </li>))}</ol>
            ) : <p className="py-4 text-legende text-encre-2">Pas encore assez de données : lance la campagne et laisse-la tourner quelques jours.</p>}
            <p className="mt-3 text-colonne text-encre-3">En production, l'IA lit ces mêmes indicateurs et le texte de chaque message, et écrit ses propres constats.</p>
          </Bloc>
          <div className="space-y-8">
            <Bloc titre="D'où viennent les clics" droite={<span className="text-colonne text-encre-2">1er clic de chaque contact</span>}>
              <ul className="mt-3 space-y-2.5">{ind.parEtape.filter((e) => e.envoyes + e.sautes > 0).map((e) => (
                <li key={e.etapeId} className="grid grid-cols-[110px_minmax(0,1fr)_110px] items-center gap-3 text-colonne"><span>{e.rang + 1} · {e.libelle}</span><Barre v={e.premiersClics} max={maxPc} ton={e.leads ? "bg-ok" : "bg-encre/60"} /><span className="chiffres text-right text-encre-2">{e.premiersClics} clics · {e.leads} leads</span></li>
              ))}</ul>
            </Bloc>
            <Bloc titre="Le jour du clic"><div className="mt-3 flex h-24 items-end gap-2">{ind.clicsParJourSemaine.map((n, i) => <div key={i} className="flex flex-1 flex-col items-center gap-1"><span className="chiffres text-[10px] text-encre-2">{n}</span><span className="w-full rounded-t-[3px] bg-encre/70" style={{ height: `${(n / maxJs) * 60}px` }} /><span className="text-[10px] text-encre-2">{JOURS[i]}</span></div>)}</div></Bloc>
            <Bloc titre="L'heure d'ouverture"><div className="mt-3 flex h-20 items-end gap-[2px]">{ind.ouverturesParHeure.map((n, h) => <div key={h} title={`${h} h : ${n}`} className="flex flex-1 flex-col items-center gap-1"><span className="w-full rounded-t-[2px] bg-encre/60" style={{ height: `${(n / maxH) * 56}px` }} /><span className="text-[9px] text-encre-3">{h % 3 === 0 ? h : ""}</span></div>)}</div></Bloc>
          </div>
        </div>
      ) : vue === "etapes" ? (
        <Table colonnes={[{ titre: "#", largeur: "36px" }, { titre: "Étape" }, { titre: "Partis", largeur: "70px", droite: true }, { titre: "Erreurs", largeur: "70px", droite: true }, { titre: "Sautés", largeur: "70px", droite: true }, { titre: "Délivrés", largeur: "76px", droite: true }, { titre: "Ouvreurs", largeur: "80px", droite: true }, { titre: "Taux ouv.", largeur: "80px", droite: true }, { titre: "Cliqueurs", largeur: "80px", droite: true }, { titre: "Taux clic", largeur: "76px", droite: true }, { titre: "Réponses", largeur: "80px", droite: true }, { titre: "1ers clics", largeur: "80px", droite: true }, { titre: "Leads", largeur: "60px", droite: true }, { titre: "Gagnés", largeur: "66px", droite: true }]}
          lignes={ind.parEtape.map((e) => { const et = c.etapes[e.rang]; return { cle: e.etapeId, cellules: [
            <span className="chiffres text-encre-2">{e.rang + 1}</span>,
            <span className="block truncate py-1.5"><b className="font-medium">{e.libelle}</b><span className="block truncate text-colonne text-encre-2">{"variantes" in et ? et.variantes.map((x) => x.objet || x.corps.slice(0, 50)).join(" | ") : et.type === "attendre" ? `${et.jours} jours` : et.type === "si" ? "condition" : et.type === "appel" ? et.consigne : ""}</span></span>,
            ...("variantes" in et ? [fr(e.envoyes), <span className={e.erreurs > e.envoyes * 0.2 && e.erreurs ? "text-alerte" : ""}>{fr(e.erreurs)}</span>, fr(e.sautes), fr(e.delivres), fr(e.ouvreurs), pct(e.envoyes ? e.ouvreurs / e.envoyes : null), fr(e.cliqueurs), pct(e.envoyes ? e.cliqueurs / e.envoyes : null), fr(e.repondants), fr(e.premiersClics), <b className={`font-medium ${e.leads ? "text-ok" : ""}`}>{fr(e.leads)}</b>, fr(e.gagnes)]
              : et.type === "appel" ? [<span className="text-colonne text-encre-2">{fr(v.etat.taches.filter((t) => t.etapeId === et.id).length)} à appeler</span>, "", "", "", "", "", "", "", "", "", "", ""] : ["", "", "", "", "", "", "", "", "", "", "", ""]),
          ] } })} />
      ) : vue === "ab" ? (
        ind.parVariante.length ? (
          <Table colonnes={[{ titre: "Étape", largeur: "110px" }, { titre: "Variante" }, { titre: "Envois", largeur: "80px", droite: true }, { titre: "Ouvreurs", largeur: "84px", droite: true }, { titre: "Taux ouv.", largeur: "84px", droite: true }, { titre: "Cliqueurs", largeur: "84px", droite: true }, { titre: "Taux clic", largeur: "84px", droite: true }, { titre: "Réponses", largeur: "84px", droite: true }]}
            lignes={ind.parVariante.map((x) => ({ cle: x.varianteId, cellules: [nomEtape(x.etapeId), <span className="block truncate py-1.5"><b className="font-medium">{x.nom}</b><span className="block truncate text-colonne text-encre-2">{x.objet}</span></span>, fr(x.envoyes), fr(x.ouvreurs), pct(x.tauxOuverture), fr(x.cliqueurs), <b className="font-medium">{pct(x.tauxClic)}</b>, fr(x.repondants)] }))} />
        ) : <p className="text-legende text-encre-2">Aucune étape n'a deux variantes. Dans « Modifier », ajoute une variante B à un mail : la moitié des contacts reçoit A, l'autre B, toujours la même pour un même contact.</p>
      ) : vue === "audience" ? (
        <div className="space-y-4">
          <div className="w-64"><Selecteur value={seg?.champ ?? ""} onChange={(e) => setChamp(e.target.value)} aria-label="Ventiler par">{ind.parSegment.map((s) => <option key={s.champ} value={s.champ}>Par {s.libelle.toLowerCase()}</option>)}</Selecteur></div>
          <Table colonnes={[{ titre: seg?.libelle ?? "" }, { titre: "Entrés", largeur: "80px", droite: true }, { titre: "Touchés", largeur: "80px", droite: true }, { titre: "Cliqueurs", largeur: "84px", droite: true }, { titre: "Taux clic", largeur: "84px", droite: true }, { titre: "Leads", largeur: "70px", droite: true }, { titre: "Lead / touché", largeur: "100px", droite: true }, { titre: "Gagnés", largeur: "70px", droite: true }]}
            vide="Personne n'est encore entré."
            lignes={(seg?.lignes ?? []).map((l) => ({ cle: l.valeur, cellules: [<b className="font-medium">{l.valeur}</b>, fr(l.entres), fr(l.touches), fr(l.cliqueurs), pct(l.touches ? l.cliqueurs / l.touches : null), <span className={l.leads ? "text-ok" : ""}>{fr(l.leads)}</span>, pct(l.touches ? l.leads / l.touches : null), fr(l.gagnes)] }))} />
        </div>
      ) : vue === "temps" ? (
        <div className="space-y-6">
          <div className="flex h-36 items-end gap-1 border-b-[0.5px] border-trait">{ind.parJour.map((j) => (
            <div key={j.jour} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${jourCourt(j.jour)} : ${j.envoyes} partis, ${j.erreurs} erreurs, ${j.cliqueurs} cliqueurs, ${j.leads} leads`}>
              <div className="flex h-28 w-full items-end gap-[1px]"><span className="flex-1 rounded-t-[2px] bg-encre/70" style={{ height: `${(j.envoyes / maxJour) * 100}%` }} /><span className="flex-1 rounded-t-[2px] bg-alerte/70" style={{ height: `${(j.erreurs / maxJour) * 100}%` }} /><span className="flex-1 rounded-t-[2px] bg-ok/80" style={{ height: `${(j.cliqueurs / maxJour) * 100}%` }} /></div>
            </div>))}</div>
          <p className="flex gap-4 text-colonne text-encre-2"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-encre/70" />partis</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-alerte/70" />erreurs</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-ok/80" />cliqueurs</span></p>
          <Table colonnes={[{ titre: "Jour" }, { titre: "Entrés", largeur: "80px", droite: true }, { titre: "Partis", largeur: "80px", droite: true }, { titre: "Erreurs", largeur: "80px", droite: true }, { titre: "Ouvreurs", largeur: "84px", droite: true }, { titre: "Cliqueurs", largeur: "84px", droite: true }, { titre: "Leads", largeur: "70px", droite: true }]} vide="Rien encore."
            lignes={[...ind.parJour].reverse().map((j) => ({ cle: j.jour, cellules: [jourCourt(j.jour), fr(j.entres), fr(j.envoyes), fr(j.erreurs), fr(j.ouvreurs), fr(j.cliqueurs), <span className={j.leads ? "text-ok" : ""}>{fr(j.leads)}</span>] }))} />
        </div>
      ) : vue === "envois" ? (
        <div className="space-y-3">
          <div className="w-48"><Selecteur value={filtreEnvoi} onChange={(e) => setFiltreEnvoi(e.target.value)} aria-label="Statut"><option value="">Tous les envois</option><option value="envoye">Partis</option><option value="erreur">En erreur</option><option value="saute">Sautés</option></Selecteur></div>
          <Table colonnes={[{ titre: "Quand", largeur: "110px" }, { titre: "Contact" }, { titre: "Étape", largeur: "130px" }, { titre: "Variante", largeur: "140px" }, { titre: "Statut", largeur: "100px" }, { titre: "Suite", largeur: "26%" }]} vide="Aucun envoi."
            lignes={envois.map((e) => { const k = v.contact(e.contactId); const evs = v.evenements.filter((x) => x.envoiId === e.id).map((x) => x.type); const et = c.etapes.find((x) => x.id === e.etapeId); return { cle: e.id, cellules: [
              <span className="chiffres text-encre-2">{dateHeure(e.le)}</span>, <span className="truncate">{k?.nom}</span>, nomEtape(e.etapeId), <span className="truncate text-encre-2">{et && "variantes" in et ? et.variantes.find((x) => x.id === e.varianteId)?.nom ?? "—" : "—"}</span>,
              <Pastille role={e.statut === "envoye" ? "fait" : e.statut === "erreur" ? "probleme" : "inerte"}>{e.statut === "envoye" ? "Parti" : e.statut === "erreur" ? "Erreur" : "Sauté"}</Pastille>,
              <span className="truncate text-colonne text-encre-2">{e.cause || [...new Set(evs)].map((x) => ({ delivre: "délivré", ouvert: "ouvert", clic: "cliqué", reponse: "a répondu", desinscription: "désinscrit", rebond: "rebond" })[x]).join(" · ") || "—"}</span>,
            ] } })} />
          <p className="text-colonne text-encre-3">Les 80 derniers.</p>
        </div>
      ) : vue === "contacts" ? (
        <Table colonnes={[{ titre: "Contact" }, { titre: "Entré", largeur: "110px" }, { titre: "Où il en est", largeur: "170px" }, { titre: "Prochaine touche", largeur: "130px" }, { titre: "Statut", largeur: "120px" }, { titre: "Signaux", largeur: "22%" }]} vide="Personne n'est encore entré."
          lignes={inscs.map((i) => { const k = v.contact(i.contactId); const evs = v.evenements.filter((x) => x.campagneId === c.id && x.contactId === i.contactId); return { cle: i.id, cellules: [
            <span className="block truncate py-1.5"><b className="font-medium">{k?.nom}</b><span className="block truncate text-colonne text-encre-2">{base.champs.map((ch) => k?.champs[ch.cle]).filter(Boolean).join(" · ")}</span></span>,
            <span className="chiffres text-encre-2">{dateHeure(i.entreeLe)}</span>, i.statut === "en_cours" ? `étape ${i.etapeIndex + 1} · ${LIBELLE_ETAPE[c.etapes[i.etapeIndex]?.type ?? "fin"]}` : "—",
            <span className="chiffres text-encre-2">{i.statut === "en_cours" ? dateHeure(i.prochaineLe) : "—"}</span>,
            <Pastille role={i.statut === "lead" ? "fait" : i.statut === "en_cours" ? "actif" : i.statut === "desinscrit" || i.statut === "rebond" ? "probleme" : "inerte"}>{({ en_cours: "En séquence", lead: "Devenu lead", terminee: "Séquence finie", desinscrit: "Désinscrit", rebond: "Rebond" })[i.statut]}</Pastille>,
            <span className="text-colonne text-encre-2">{`${evs.filter((x) => x.type === "ouvert").length} ouv. · ${evs.filter((x) => x.type === "clic").length} clics${evs.some((x) => x.type === "reponse") ? " · a répondu" : ""}`}</span>,
          ] } })} />
      ) : (
        ind.parCommercial.length ? (
          <Table colonnes={[{ titre: "Commercial" }, { titre: "Appels", largeur: "90px", droite: true }, { titre: "Joints", largeur: "90px", droite: true }, { titre: "Taux joint", largeur: "100px", droite: true }, { titre: "Issues", largeur: "40%" }]}
            lignes={ind.parCommercial.map((x) => ({ cle: x.compteId, cellules: [<b className="font-medium">{v.etat.comptes.find((k) => k.id === x.compteId)?.nom}</b>, fr(x.appels), fr(x.joints), pct(x.appels ? x.joints / x.appels : null), <span className="text-colonne text-encre-2">{Object.entries(x.issues).map(([k, n]) => `${base.issues.find((y) => y.code === k)?.libelle ?? k} ${n}`).join(" · ") || "—"}</span>] }))} />
        ) : <p className="text-legende text-encre-2">Aucun appel encore. Les leads et les étapes « Appel » arrivent dans la <button type="button" className="underline" onClick={() => aller("session")}>session de call</button>.</p>
      )}
    </div>
  )
}
