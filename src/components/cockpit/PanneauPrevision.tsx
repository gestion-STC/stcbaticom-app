// LE PRÉVISIONNEL À 6 MOIS (26/11/2026, proposition 1 validée), en version complète (Campagnes › Dashboard) et
// compacte (Gestionnaires › Dashboard). Le calcul : lib/prevision.ts ; ici, seulement le dessin.
import { Etiquette } from "../demarchage/aujourdhui/courtier"
import { Jauge, Panneau } from "./pieces"
import { VERDICT, euros, fr, k } from "./format"
import { phrasePrevision, titreVerdict, type PrevisionCockpit } from "../../lib/prevision"
import type { Trajectoire } from "../../lib/croissance"

const dec = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 2 })
const moisAnnee = (d: Date) => d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })

export function PastilleVerdict({ t }: { t: Trajectoire }) {
  const v = VERDICT[t]
  return <span className={`inline-flex items-center gap-1.5 rounded-3 px-1.5 py-0.5 text-colonne font-medium ${v.fond} ${v.ton}`}><span className={`h-1.5 w-1.5 rounded-full ${v.point}`} />{v.texte}</span>
}

/** Les jalons mois par mois : CA mensuel prévu (barre) contre la trajectoire nécessaire (trait noir). */
function Jalons({ P }: { P: PrevisionCockpit }) {
  const max = Math.max(P.reglage.objectifMensuel, ...P.jalons.map((j) => j.ca))
  const h = (v: number) => `${(v / max) * 100}%`
  return (
    <div className="min-w-0">
      <div className="relative flex items-end gap-2" style={{ height: 132 }}>
        <div className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-encre" style={{ bottom: h(P.reglage.objectifMensuel) }}>
          <span className="absolute -top-[15px] left-0 bg-fond pr-1 text-[10px] text-encre">objectif {k(P.reglage.objectifMensuel)}€ / mois</span>
        </div>
        {P.jalons.map((j, i) => (
          <div key={i} className="relative flex h-full min-w-0 flex-1 flex-col justify-end" title={`${j.date.toLocaleDateString("fr-FR")} : ${euros(j.ca)} / mois prévus à ce rythme, ${euros(j.caCible)} sur la trajectoire de l'objectif · agences actives ${j.actives} prévues, ${j.activesCible} sur la trajectoire`}>
            <div className="relative mx-auto w-full max-w-[52px]" style={{ height: h(j.ca) }}><div className="absolute inset-0 rounded-t-[3px] bg-info" /></div>
            <div className="absolute inset-x-0 mx-auto h-[2px] w-full max-w-[60px] bg-encre" style={{ bottom: h(j.caCible) }} />
          </div>
        ))}
      </div>
      <div className="flex gap-2 border-t-[0.5px] border-trait pt-1">
        {P.jalons.map((j, i) => (
          <div key={i} className="min-w-0 flex-1 text-center">
            <div className="truncate text-[10px] text-encre">{j.date.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "")}. <span className="text-encre-3">{j.date.getDate()}</span></div>
            <div className={`chiffres truncate text-[11px] font-semibold ${j.ca < j.caCible ? "text-alerte" : "text-ok"}`}>{k(j.ca)}€</div>
            <div className="chiffres truncate text-[10px] text-encre-2" title="Agences actives prévues / sur la trajectoire"><b className={j.actives < j.activesCible ? "text-alerte" : "text-ok"}>{j.actives}</b> / {j.activesCible} ag.</div>
            <div className="chiffres truncate text-[10px] text-encre-3">cible {k(j.caCible)}</div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-encre-2">
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-[2px] bg-info" />CA mensuel prévu à ce rythme</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-[2px] w-3 bg-encre" />trajectoire nécessaire</span>
        <span>agences : prévues / nécessaires</span>
      </div>
    </div>
  )
}

function Leviers({ P, dense = false }: { P: PrevisionCockpit; dense?: boolean }) {
  return (
    <table className="w-full table-fixed border-collapse text-left">
      <colgroup><col /><col style={{ width: 64 }} /><col style={{ width: 64 }} /><col style={{ width: dense ? 96 : 104 }} /></colgroup>
      <thead><tr className="h-7">{["Par semaine", "Il faut", "On fait", "Verdict"].map((t, i) => <th key={t} className={`px-1.5 font-normal first:pl-0 last:pr-0 ${i && i < 3 ? "text-right" : ""}`}><Etiquette>{t}</Etiquette></th>)}</tr></thead>
      <tbody>
        {P.leviers.map((l) => (
          <tr key={l.libelle} className="h-[34px] border-t-[0.5px] border-trait text-[12.5px]" title={l.base}>
            <td className="truncate pr-1.5"><span className="block truncate font-medium">{l.libelle}</span><span className="block truncate text-[10px] leading-3 text-encre-2">{l.base}</span></td>
            <td className="chiffres px-1.5 text-right font-semibold">{l.decimales ? dec(l.ilFaut) : fr(l.ilFaut)}</td>
            <td className={`chiffres px-1.5 text-right font-semibold ${VERDICT[l.trajectoire].ton}`}>{l.decimales ? dec(l.onFait) : l.onFait.toLocaleString("fr-FR")}</td>
            <td className="pl-1.5 text-right"><PastilleVerdict t={l.trajectoire} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** La version complète : verdict, jalons, l'échéance, les leviers, la phrase. */
export function PrevisionComplete({ P, className = "" }: { P: PrevisionCockpit; className?: string }) {
  const p = P.prevu, V = VERDICT[P.global]
  return (
    <Panneau className={className} titre="Prévisionnel à 6 mois · à notre cadence" droite={`d'aujourd'hui au ${P.echeance.toLocaleDateString("fr-FR")} · objectif ${euros(P.reglage.objectifMensuel)} / mois · calcul du logiciel (Croissance)`} corps="p-0">
      <div className="grid grid-cols-1 @min-[900px]:grid-cols-2 @min-[1500px]:grid-cols-[260px_minmax(0,1.2fr)_250px_minmax(0,1.2fr)]">
        {/* Le verdict, en grand */}
        <div className={`flex flex-col justify-between gap-3 px-4 py-3 ${V.fond}`}>
          <div>
            <Etiquette className={V.ton}>Verdict</Etiquette>
            <div className={`mt-1 text-[24px] font-semibold leading-8 tracking-[-0.02em] ${V.ton}`}>{titreVerdict(P)}</div>
            <div className="mt-1.5 text-colonne text-encre-2">
              Cadence : <b className="chiffres font-semibold text-encre">{dec(P.cadence)}</b> nouveau client / semaine, il en faut <b className="chiffres font-semibold text-encre">{dec(P.clientsSemaine)}</b> ({P.clientsSemaine > 0 ? Math.round((P.cadence / P.clientsSemaine) * 100) : 100} %).
            </div>
          </div>
          <div className="text-colonne text-encre-2" title="Premiers OS par semaine, 4 dernières semaines closes">
            4 sem. closes : {P.nouveaux.slice(-5, -1).map((n, i) => <b key={i} className="chiffres mx-0.5 font-semibold text-encre">{n}</b>)} premiers OS · seuils : ≥ 100 % dans les clous, ≥ 70 % juste, en dessous en retard
          </div>
        </div>
        {/* Les jalons */}
        <div className="min-w-0 border-trait px-4 pb-2 pt-5 @min-[900px]:border-l-[0.5px]">
          <Jalons P={P} />
        </div>
        {/* À l'échéance */}
        <div className="min-w-0 border-t-[0.5px] border-trait px-4 py-3 @min-[1500px]:border-l-[0.5px] @min-[1500px]:border-t-0">
          <Etiquette className="text-encre">À l'échéance · {P.echeance.toLocaleDateString("fr-FR")}</Etiquette>
          <div className="mt-1.5 flex items-baseline gap-2"><span className="chiffres text-[22px] font-semibold leading-7 text-encre">{euros(p.caPrevu)}</span><span className="text-colonne text-encre-2">/ mois prévus</span></div>
          <div className="mt-1"><Jauge realise={p.caPrevu} objectif={P.reglage.objectifMensuel} ton={p.pctObjectif >= 100 ? "bg-ok" : "bg-alerte"} h={6} /></div>
          <dl className="mt-1.5 space-y-1 text-[12.5px]">
            <div className="flex justify-between gap-2"><dt className="text-encre-2">part de l'objectif</dt><dd className={`chiffres font-semibold ${p.pctObjectif >= 100 ? "text-ok" : "text-alerte"}`}>{p.pctObjectif} %</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-encre-2">il manquerait</dt><dd className="chiffres font-semibold">{euros(p.manque)} / mois</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-encre-2" title="Agences actives prévues / nécessaires">agences actives</dt><dd className="chiffres whitespace-nowrap"><b className={`font-semibold ${p.clientsPrevus >= P.plan.clientsNecessaires ? "text-ok" : "text-alerte"}`}>{p.clientsPrevus}</b> / {P.plan.clientsNecessaires} nécessaires</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-encre-2">objectif atteint</dt><dd className="chiffres font-semibold">{P.atteint ? `${moisAnnee(P.atteint)}` : "jamais à ce rythme"}</dd></div>
          </dl>
          <div className="mt-1 text-[10px] text-encre-3">aujourd'hui {euros(P.plan.caEstime)} / mois (3 mois clos) · {euros(P.plan.caParClient)} par agence active · {P.clientsActuels} actives</div>
        </div>
        {/* Les leviers */}
        <div className="min-w-0 border-t-[0.5px] border-trait px-4 pb-2 pt-1 @min-[900px]:border-l-[0.5px] @min-[1500px]:border-t-0">
          <Leviers P={P} />
        </div>
      </div>
      <p className="border-t-[0.5px] border-trait bg-fond-2 px-4 py-2 text-legende text-encre">{phrasePrevision(P)}</p>
    </Panneau>
  )
}

/** La version compacte : une bande « Trajectoire » sous les cotes de la téléprospection. */
export function PrevisionCompacte({ P }: { P: PrevisionCockpit }) {
  const p = P.prevu, V = VERDICT[P.global]
  return (
    <section className="flex min-w-0 flex-wrap items-stretch overflow-hidden rounded-6 border-[0.5px] border-trait bg-fond">
      <div className={`flex min-w-[210px] flex-col justify-center px-4 py-2 ${V.fond}`}>
        <Etiquette className={V.ton}>Trajectoire · 6 mois</Etiquette>
        <span className={`text-[20px] font-semibold leading-7 ${V.ton}`}>{titreVerdict(P)}</span>
      </div>
      <div className="flex min-w-[260px] flex-1 flex-col justify-center border-l-[0.5px] border-trait px-4 py-2">
        <span className="text-legende text-encre">{phrasePrevision(P)}</span>
        <span className="mt-0.5 text-colonne text-encre-2">Prévu au {P.echeance.toLocaleDateString("fr-FR")} : <b className="chiffres font-semibold text-encre">{euros(p.caPrevu)}</b> / mois ({p.pctObjectif} %) · {p.clientsPrevus} agences actives sur {P.plan.clientsNecessaires} nécessaires · détail : Campagnes › Dashboard</span>
      </div>
      <div className="grid min-w-0 flex-[1_1_520px] grid-cols-2 border-l-[0.5px] border-trait @min-[1100px]:grid-cols-4">
        {P.leviers.map((l, i) => (
          <div key={l.libelle} title={l.base} className={`min-w-0 px-3 py-2 ${i ? "border-l-[0.5px] border-trait" : ""}`}>
            <Etiquette className="block truncate">{l.libelle.replace(" (premiers OS)", "")} / sem.</Etiquette>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className={`chiffres text-[18px] font-semibold leading-6 ${VERDICT[l.trajectoire].ton}`}>{l.decimales ? dec(l.onFait) : l.onFait.toLocaleString("fr-FR")}</span>
              <span className="chiffres text-colonne text-encre-2">/ {l.decimales ? dec(l.ilFaut) : fr(l.ilFaut)}</span>
            </div>
            <PastilleVerdict t={l.trajectoire} />
          </div>
        ))}
      </div>
    </section>
  )
}
