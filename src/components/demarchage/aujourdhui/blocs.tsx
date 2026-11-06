// ── LES BLOCS DE LA PAGE AUJOURD'HUI (vues « L'équipe en direct » et « Tableau de bord », 06/11/2026) ──
// Chaque bloc reçoit ses chiffres tout prêts (calculs : src/demarchage/tableauOutils.ts) et
// se dessine sur la grille commune (./grille.tsx).
import type { FormEvent } from "react"
import { ArrowUpRight, CalendarCheck, MailOpen, MousePointerClick, Pencil, Phone, Sparkles, Trophy, UserRound, Briefcase, Flame } from "lucide-react"
import type { Lead, StatsCompte } from "../../../demarchage/db"
import { attenteCourte, couleurAttente, minutesDepuis } from "../../../demarchage/leadsOutils"
import { segmentsBase, tauxJoints } from "../../../demarchage/aujourdhuiOutils"
import type { Agence } from "../../../demarchage/modele"
import {
  ETAPES_PARCOURS, delaiLisible, ecart, ilYa, prenomDe, tauxPassage,
  type BilanLeads, type BilanProspection, type LigneHeure, type Parcours, type Victoire,
} from "../../../demarchage/tableauOutils"
import { Bouton, Champ } from "../../../ui"
import { Barres, Chiffre, Compteur, EnTete, Ligne, Mention, PointLead, Rond } from "./grille"

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)

// ── L'objectif du mois (premiers OS), avec le rythme attendu ──
export function BlocObjectif({ recus, objectif, attendu, projection, restants, part, noms, edition, saisie, setSaisie, ouvrirEdition, fermerEdition, enregistrer, occupe }: {
  recus: number; objectif: number; attendu: number; projection: number; restants: number; part: number; noms: string[]
  edition: boolean; saisie: string; setSaisie: (s: string) => void; ouvrirEdition: () => void; fermerEdition: () => void; enregistrer: (e: FormEvent) => void; occupe: boolean
}) {
  const mois = new Date().toLocaleDateString("fr-FR", { month: "long" })
  const avance = recus - attendu
  return (
    <section>
      <EnTete
        titre={<>Objectif de {mois} : {objectif > 0 ? <>{objectif} premiers OS</> : "à fixer"}</>}
        droite={edition ? (
          <form onSubmit={enregistrer} className="flex items-center gap-1.5 pb-1.5">
            <Champ type="number" min={1} step={1} value={saisie} onChange={(e) => setSaisie(e.target.value)} aria-label="Objectif de premiers OS par mois" className="h-7! w-20" autoFocus />
            <Bouton type="submit" taille="sm" chargement={occupe}>OK</Bouton>
            <Bouton taille="sm" variante="discret" onClick={fermerEdition}>Annuler</Bouton>
          </form>
        ) : (
          <span className="flex items-end gap-4 pb-2">
            <span className="chiffres text-legende text-encre-2"><b className="text-h1 font-semibold leading-none text-encre"><Compteur valeur={recus} /></b>{objectif > 0 ? <> / {objectif}</> : null}</span>
            <button type="button" onClick={ouvrirEdition} className="flex items-center gap-1 text-colonne text-encre-2 hover:text-encre" title="Modifier l'objectif du mois"><Pencil size={12} />{objectif > 0 ? "modifier" : "fixer l'objectif"}</button>
          </span>
        )}
      />
      <div className="relative h-[10px] rounded-full bg-fond-3" role="img" aria-label={`${recus} premiers OS reçus sur ${objectif || "?"}`}>
        <div className="h-full rounded-full bg-ok transition-[width] duration-700" style={{ width: `${objectif > 0 ? Math.min(100, (recus / objectif) * 100) : 0}%` }} />
        {objectif > 0 ? <span className="absolute top-1/2 h-[16px] w-[2px] -translate-y-1/2 bg-encre/40" style={{ left: `${part * 100}%` }} title={`Rythme attendu à cette date : ${attendu}`} /> : null}
      </div>
      <Mention className="mt-2 h-5 truncate">
        {objectif > 0
          ? <>{avance >= 0 ? "En avance sur le rythme" : "En retard sur le rythme"} : {attendu} attendu{attendu > 1 ? "s" : ""} à cette date, {recus} reçu{recus > 1 ? "s" : ""}{noms.length ? ` (${noms.slice(0, 4).join(", ")}${noms.length > 4 ? "…" : ""})` : ""} · projection fin de mois : {projection} · {restants} jour{restants > 1 ? "s" : ""} ouvré{restants > 1 ? "s" : ""} restant{restants > 1 ? "s" : ""}</>
          : "Fixe l'objectif du mois pour voir le rythme de l'équipe."}
      </Mention>
    </section>
  )
}

// ── Le podium et le classement compact ──
export function Podium({ stats }: { stats: StatsCompte[] }) {
  const l = stats.filter((x) => x.compteId).slice(0, 3)
  if (!l.length) return <p className="py-8 text-center text-legende text-encre-2">Aucun appel sur cette période.</p>
  const places = [{ x: l[1], h: 56, rang: "2e" }, { x: l[0], h: 84, rang: "1er" }, { x: l[2], h: 40, rang: "3e" }]
  return (
    <div className="grid grid-cols-3 items-end gap-3">
      {places.map(({ x, h, rang }, i) => x ? (
        <div key={x.compteId ?? i} className="flex flex-col items-center">
          <span className="flex h-5 items-center">{rang === "1er" && x.appels > 0 ? <Trophy size={16} className="text-attention" /> : null}</span>
          <span className="mt-1 flex h-10 w-10 items-center justify-center rounded-full bg-fond-4 text-legende font-semibold text-encre">{x.compteNom.split(/\s+/).map((m) => m[0]).slice(0, 2).join("").toUpperCase()}</span>
          <span className="mt-1.5 h-5 text-legende font-medium text-encre">{prenomDe(x.compteNom)}</span>
          <span className="chiffres h-4 text-colonne text-encre-2"><Compteur valeur={x.appels} /> appels · {x.rdv} RDV</span>
          <div className={`mt-2 flex w-full items-start justify-center rounded-t-[6px] pt-1.5 ${rang === "1er" ? "bg-encre" : "bg-fond-4"}`} style={{ height: h }}>
            <span className={`chiffres text-legende font-semibold ${rang === "1er" ? "text-white" : "text-encre-2"}`}>{rang}</span>
          </div>
        </div>
      ) : <div key={i} />)}
    </div>
  )
}
export function ClassementCompact({ stats }: { stats: StatsCompte[] }) {
  const l = stats.filter((x) => x.compteId)
  const max = Math.max(1, ...l.map((x) => x.appels))
  const th = "h-8 font-normal"
  return (
    <table className="w-full table-fixed text-left">
      <colgroup><col /><col className="w-[34%]" /><col className="w-[76px]" /><col className="w-[52px]" /><col className="w-[44px]" /><col className="w-[60px]" /><col className="w-[56px]" /></colgroup>
      <thead><tr className="text-colonne text-encre-2"><th className={th}>Commercial</th><th className={th}>Appels</th><th className={`${th} text-right`}>Joints</th><th className={`${th} text-right`}>Intér.</th><th className={`${th} text-right`}>RDV</th><th className={`${th} text-right`}>Apport.</th><th className={`${th} text-right`}>1ers OS</th></tr></thead>
      <tbody>
        {l.map((x, i) => (
          <tr key={x.compteId ?? x.compteNom} className="h-10 border-t-[0.5px] border-trait text-legende">
            <td className="truncate pr-3 text-encre"><span className="chiffres mr-2 inline-block w-3 text-encre-2">{i + 1}</span>{x.compteNom}</td>
            <td className="pr-4"><div className="flex items-center gap-2"><div className="h-[6px] flex-1 rounded-full bg-fond-3"><div className="h-full rounded-full bg-info" style={{ width: `${(x.appels / max) * 100}%` }} /></div><span className="chiffres w-8 text-right text-encre">{x.appels}</span></div></td>
            <td className="chiffres text-right text-encre">{x.joints} <span className="text-colonne text-encre-2">{tauxJoints(x)} %</span></td>
            <td className="chiffres text-right text-encre">{x.interesses}</td>
            <td className="chiffres text-right text-encre">{x.rdv}</td>
            <td className="chiffres text-right text-encre">{x.apporteurs}</td>
            <td className={`chiffres text-right ${x.premiersOs ? "font-semibold text-ok" : "text-encre"}`}>{x.premiersOs}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Les victoires du jour ──
const ICONE_VICTOIRE = { rdv: CalendarCheck, interesse: Sparkles, apporteur: Briefcase, os: Flame } as const
export function Victoires({ victoires, maintenant, onOuvrirAgence }: { victoires: Victoire[]; maintenant: Date; onOuvrirAgence?: (id: string) => void }) {
  if (!victoires.length) return <p className="py-8 text-center text-legende text-encre-2">Pas encore de victoire aujourd'hui : le premier RDV, c'est pour bientôt.</p>
  return <ul>{victoires.slice(0, 8).map((v) => <Ligne key={v.id} gauche={<Rond Icone={ICONE_VICTOIRE[v.type]} />} titre={<><b className="font-medium">{v.qui}</b> · {v.quoi}</>} sous={v.quandTexte ?? ilYa(v.date, maintenant)} onClick={() => onOuvrirAgence?.(v.agenceId)} />)}</ul>
}

// ── Les leads à traiter ──
export function ListeLeads({ leads, maintenant, onAppeler, limite = 5 }: { leads: { agence: Agence; lead: Lead }[]; maintenant: Date; onAppeler?: (id: string) => void; limite?: number }) {
  if (!leads.length) return <p className="py-8 text-center text-legende text-encre-2">Aucun lead à traiter. Le prochain apparaîtra dès qu'une agence se manifeste.</p>
  return (
    <ul>
      {leads.slice(0, limite).map(({ agence, lead }) => {
        const m = minutesDepuis(lead.creeLe, maintenant)
        return <Ligne key={lead.id} gauche={<PointLead />} titre={agence.nom} sous={lead.signal}
          droite={<><span className={`chiffres w-12 text-right text-colonne ${couleurAttente(m)}`}>{attenteCourte(m)}</span><Bouton taille="sm" icone={<Phone />} onClick={() => onAppeler?.(agence.id)}>Appeler</Bouton></>} />
      })}
    </ul>
  )
}

// ── Le parcours de la semaine ──
export function BlocParcours({ p, avant }: { p: Parcours; avant: Parcours }) {
  const max = Math.max(1, p.appels)
  return (
    <ol>
      {ETAPES_PARCOURS.map(({ cle, libelle }, i) => {
        const n = p[cle], prec = i ? p[ETAPES_PARCOURS[i - 1].cle] : 0
        const t = i ? tauxPassage(n, prec) : null
        const e = ecart(n, avant[cle])
        return (
          <li key={cle} className="grid h-[26px] grid-cols-[136px_minmax(0,1fr)_44px_44px_40px] items-center gap-3" title={`Semaine dernière : ${avant[cle]}`}>
            <span className="truncate text-legende text-encre">{libelle}</span>
            <div className="h-[14px] rounded-[4px] bg-fond-3"><div className="h-full rounded-[4px] bg-info" style={{ width: `${Math.max(n ? 2 : 0, (n / max) * 100)}%` }} /></div>
            <span className="chiffres text-right text-legende text-encre">{n}</span>
            <span className="chiffres text-right text-colonne text-encre-2">{t === null ? "" : `${t} %`}</span>
            <span className={`chiffres text-right text-colonne ${e.startsWith("+") ? "text-ok" : e === "=" ? "text-encre-2" : "text-alerte"}`}>{e}</span>
          </li>
        )
      })}
    </ol>
  )
}

// ── Quand joindre un gestionnaire ──
export function BlocHeures({ heures }: { heures: LigneHeure[] }) {
  const meilleure = heures.length ? heures.reduce((a, b) => (b.taux > a.taux ? b : a)) : null
  return (
    <Barres points={heures.map((x) => ({ cle: `${x.heure}h`, valeur: x.taux }))} enAvant={meilleure ? `${meilleure.heure}h` : null}
      info={(p) => { const l = heures.find((x) => `${x.heure}h` === p.cle); return `${p.cle} : ${p.valeur} % joints sur ${l?.appels ?? 0} appels` }}
      note={meilleure ? <>Meilleure heure : <b className="font-medium text-encre">{meilleure.heure} h</b>, {meilleure.taux} % des appels tombent sur un gestionnaire.</> : null}
      vide="Pas encore assez d'appels pour le dire." />
  )
}

// ── Ma base de prospection ──
export function BaseProspection({ b, rappels, jamaisJointes, reveils, onOuvrirEtape, onSession }: { b: BilanProspection; rappels: number | null; jamaisJointes: number; reveils: number; onOuvrirEtape?: (e: string) => void; onSession?: () => void }) {
  const segments = segmentsBase(b.parEtape)
  const n = (e: string) => b.parEtape[e] ?? 0
  return (
    <div>
      <div className="grid grid-cols-4 gap-x-2 border-b-[0.5px] border-trait pb-2">
        <Chiffre libelle="À prospecter" valeur={n("a_prospecter")} onClick={() => onOuvrirEtape?.("a_prospecter")} />
        <Chiffre libelle="À rappeler aujourd'hui" valeur={rappels ?? "—"} ton={rappels ? "text-alerte" : "text-encre"} onClick={onSession} />
        <Chiffre libelle="Intéressés" valeur={n("interesse")} onClick={() => onOuvrirEtape?.("interesse")} />
        <Chiffre libelle="RDV planifiés" valeur={n("rdv_planifie")} onClick={() => onOuvrirEtape?.("rdv_planifie")} />
        <Chiffre libelle="Clients" valeur={n("client")} ton={n("client") ? "text-ok" : "text-encre"} onClick={() => onOuvrirEtape?.("client")} />
        <Chiffre libelle="Pas intéressés" valeur={n("pas_interesse")} onClick={() => onOuvrirEtape?.("pas_interesse")} />
        <Chiffre libelle="Endormies" valeur={n("endormie")} detail={reveils ? `${reveils} se réveille${reveils > 1 ? "nt" : ""} cette semaine` : undefined} onClick={() => onOuvrirEtape?.("endormie")} />
        <Chiffre libelle="Gestionnaire joint" valeur={n("gestionnaire_joint")} onClick={() => onOuvrirEtape?.("gestionnaire_joint")} />
      </div>
      <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-fond-3" role="img" aria-label={segments.map((x) => `${x.libelle} : ${x.n}`).join(", ")}>
        {segments.filter((x) => x.n > 0).map((x) => <button type="button" key={x.code} style={{ flexGrow: x.n, flexBasis: 0 }} title={`${x.libelle} : ${x.n} (${x.pct} %)`} onClick={() => onOuvrirEtape?.(x.code)} className={`min-w-[3px] border-r-2 border-fond last:border-r-0 hover:brightness-95 ${x.fond}`} />)}
      </div>
      <p className="mt-3 h-5 truncate text-legende text-encre">
        <b className="font-semibold">{b.clients}</b> client{b.clients > 1 ? "s" : ""} signé{b.clients > 1 ? "s" : ""} sur <b className="font-semibold">{b.travaillees}</b> agences travaillées · taux de signature <b className="font-semibold">{b.tauxSignature === null ? "—" : `${String(b.tauxSignature).replace(".", ",")} %`}</b>
      </p>
      <Mention className="h-4 truncate">{b.total} agences dans la base · {jamaisJointes} jamais jointe{jamaisJointes > 1 ? "s" : ""}</Mention>
    </div>
  )
}

// ── Ma base de leads ──
export function BaseLeads({ b }: { b: BilanLeads }) {
  const taux = (t: number | null) => (t === null ? "" : `${String(t).replace(".", ",")} %`)
  return (
    <div>
      <div className="grid grid-cols-4 gap-x-2 border-b-[0.5px] border-trait pb-2">
        <Chiffre libelle="Leads reçus" valeur={b.recus} />
        <Chiffre libelle="À traiter" valeur={b.aTraiter} ton={b.aTraiter ? "text-alerte" : "text-encre"} />
        <Chiffre libelle="Traités" valeur={b.traites} />
        <Chiffre libelle="Retombés" valeur={b.retombes} detail="3 appels sans réponse" />
        <Chiffre libelle="Devenus intéressés" valeur={b.interesses} />
        <Chiffre libelle="Devenus RDV" valeur={b.rdv} detail={taux(b.tauxRdv)} />
        <Chiffre libelle="Devenus clients" valeur={b.clients} ton={b.clients ? "text-ok" : "text-encre"} detail={taux(b.tauxClient)} />
        <Chiffre libelle="Délai de traitement" valeur={delaiLisible(b.delaiMoyenMin)} detail="en moyenne" title="Du signal de l'agence au premier appel abouti" />
      </div>
      <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-fond-3" role="img" aria-label={`${b.clients} clients, ${b.rdv} RDV, ${b.interesses} intéressés sur ${b.recus} leads`}>
        {[{ n: b.clients, c: "bg-ok" }, { n: Math.max(0, b.rdv - b.clients), c: "bg-info" }, { n: b.interesses, c: "bg-info/40" }, { n: b.aTraiter, c: "bg-signature/50" }].filter((x) => x.n > 0).map((x, i) => <span key={i} style={{ flexGrow: x.n, flexBasis: 0 }} className={`min-w-[3px] border-r-2 border-fond last:border-r-0 ${x.c}`} />)}
      </div>
      <p className="mt-3 h-5 truncate text-legende text-encre">
        Sur <b className="font-semibold">{b.recus}</b> lead{b.recus > 1 ? "s" : ""} : <b className="font-semibold">{taux(b.tauxRdv) || "—"}</b> deviennent un RDV, <b className="font-semibold">{taux(b.tauxClient) || "—"}</b> un client
      </p>
      <Mention className="h-4 truncate">Un lead : une agence qui s'est manifestée (compte, page « Créer un compte », réponse à un mail, plaquette ouverte 2 fois)</Mention>
    </div>
  )
}

// ── Ce qui bouge chez les agences ──
const ICONE_SIGNAL = (titre: string) => (/plaquette/i.test(titre) ? MousePointerClick : /mail/i.test(titre) ? MailOpen : /compte/i.test(titre) ? UserRound : ArrowUpRight)
export function CeQuiBouge({ signaux, maintenant, onAppeler }: { signaux: { id: string; date: string; titre: string; agenceId: string; agenceNom: string }[]; maintenant: Date; onAppeler?: (id: string) => void }) {
  if (!signaux.length) return <p className="py-8 text-center text-legende text-encre-2">Rien de nouveau ces 7 derniers jours.</p>
  return <ul>{signaux.slice(0, 5).map((s) => <Ligne key={s.id} gauche={<Rond Icone={ICONE_SIGNAL(s.titre)} />} titre={<><b className="font-medium">{s.agenceNom}</b> · {s.titre}</>} sous={ilYa(s.date, maintenant)} droite={<Bouton taille="sm" variante="discret" icone={<Phone />} onClick={() => onAppeler?.(s.agenceId)}>Appeler</Bouton>} />)}</ul>
}

// ── Les mails des 7 derniers jours ──
export function BlocMails({ m }: { m: { envoyes: number; ouverts: number; recus: number; rebonds: number } | null }) {
  if (!m) return <p className="py-8 text-center text-legende text-encre-2">Lecture des mails…</p>
  const cases: [string, string, string][] = [["Envoyés", String(m.envoyes), "text-encre"], ["Ouvertures", `${m.ouverts}`, "text-encre"], ["Réponses reçues", String(m.recus), m.recus ? "text-ok" : "text-encre"], ["Revenus en erreur", `${m.rebonds}${m.envoyes ? ` · ${pct(m.rebonds, m.envoyes)} %` : ""}`, m.rebonds ? "text-alerte" : "text-encre"]]
  return (
    <div>
      <dl className="grid grid-cols-2">
        {cases.map(([l, v, t], i) => <div key={l} className={`h-14 py-1.5 ${i < 2 ? "border-b-[0.5px] border-trait" : ""} ${i % 2 ? "pl-4" : ""}`}><dt className="text-colonne text-encre-2">{l}</dt><dd className={`chiffres text-sous-titre font-semibold ${t}`}>{v}</dd></div>)}
      </dl>
      <Mention className="mt-3">{m.rebonds ? `${m.rebonds} adresse${m.rebonds > 1 ? "s" : ""} à corriger : un mail qui revient abîme la réputation de l'adresse d'envoi.` : "Aucun mail revenu en erreur : l'adresse d'envoi est en bonne santé."}</Mention>
    </div>
  )
}

// ── Le conseil de la semaine (analyse IA des appels) ──
export function Conseil({ objection, reponse, argument }: { objection: { libelle: string; appels: number; joints: number } | null; reponse: string; argument: { libelle: string; aboutis: number; appels: number } | null }) {
  if (!objection && !argument) return <p className="py-8 text-center text-legende text-encre-2">Pas encore assez d'appels analysés ce mois-ci.</p>
  return (
    <div>
      {objection ? <p className="text-legende text-encre">« {objection.libelle} » revient dans <b className="font-medium">{objection.appels} appel{objection.appels > 1 ? "s" : ""}</b> sur {objection.joints} analysés.{reponse ? <> Ce qui marche : <b className="font-medium">{reponse}</b></> : null}</p> : null}
      {argument ? <Mention className="mt-3">Argument le plus efficace : « {argument.libelle} » ({argument.aboutis} appel{argument.aboutis > 1 ? "s" : ""} abouti{argument.aboutis > 1 ? "s" : ""} sur {argument.appels}).</Mention> : null}
    </div>
  )
}

// ── Les quatre chiffres du tableau de bord ──
export function Quatre({ cases }: { cases: { libelle: string; valeur: number; detail: string; ton: string; onClick?: () => void }[] }) {
  return (
    <div className="grid grid-cols-2 border-y-[0.5px] border-trait @min-[1000px]:grid-cols-4">
      {cases.map((c, i) => (
        <button key={c.libelle} type="button" onClick={c.onClick} className={`h-[112px] px-5 py-4 text-left transition-colors hover:bg-fond-2 ${i % 2 ? "border-l-[0.5px] border-trait" : ""} ${i >= 2 ? "border-t-[0.5px] border-trait @min-[1000px]:border-t-0" : ""} ${i === 2 ? "@min-[1000px]:border-l-[0.5px]" : ""}`}>
          <Mention>{c.libelle}</Mention>
          <p className="mt-1 text-[28px] font-semibold leading-9 text-encre"><Compteur valeur={c.valeur} /></p>
          <p className={`truncate text-colonne ${c.ton}`}>{c.detail}</p>
        </button>
      ))}
    </div>
  )
}

