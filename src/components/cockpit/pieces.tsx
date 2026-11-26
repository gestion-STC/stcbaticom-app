// LE COCKPIT (proposition 1 validée par le gérant le 26/11/2026) : les pièces d'un écran de pilotage dense, façon salle de marché,
// dessinées avec les seuls jetons du logiciel (encre, trait, fond-2/3, info, ok, alerte, signature).
// Une tuile de cote (chiffre + variation colorée + mini-courbe), un panneau de liste de suivi, une mini-courbe
// fluide, une rangée d'onglets serrés, une barre horizontale, une « heatline ».
import type { ReactNode } from "react"
import { Etiquette } from "../demarchage/aujourdhui/courtier"
import { fr, moisCourt } from "./format"


/** La cote : ▲ +12 % en vert, ▼ −84 % en rouge, « = » en gris ; `nb` pour un écart en nombre, `pts` en points. */
export function Cote({ n, avant, unite = "%", inverse = false }: { n: number; avant: number; unite?: "%" | "pts" | "nb"; inverse?: boolean }) {
  const d = unite === "nb" ? n - avant : unite === "pts" ? n - avant : avant === 0 ? null : ((n - avant) / avant) * 100
  if (d === null) return <span className="chiffres text-colonne text-encre-2">{n > 0 ? "nouveau" : "="}</span>
  const r = unite === "pts" ? Math.round(d * 10) / 10 : Math.round(d)
  if (r === 0) return <span className="chiffres text-colonne text-encre-2">=</span>
  const bon = inverse ? r < 0 : r > 0
  const txt = unite === "nb" ? fr(Math.abs(r)) : unite === "pts" ? `${Math.abs(r).toLocaleString("fr-FR")} pts` : `${Math.abs(r)} %`
  return <span className={`chiffres whitespace-nowrap text-colonne font-medium ${bon ? "text-ok" : "text-alerte"}`}>{r > 0 ? "▲ +" : "▼ −"}{txt}</span>
}

/** Une mini-courbe qui prend toute la largeur de sa case. `objectif` : un trait pointillé. `marque` : un point (le dernier par défaut). */
export function MiniCourbe({ valeurs, h = 28, objectif, ton = "info", barres = false, enCours = false }: { valeurs: number[]; h?: number; objectif?: number; ton?: "info" | "ok" | "alerte" | "encre"; barres?: boolean; enCours?: boolean }) {
  const L = 100
  const max = Math.max(1, objectif ?? 0, ...valeurs)
  const y = (v: number) => h - 2 - (v / max) * (h - 5)
  const trait = { info: "stroke-info", ok: "stroke-ok", alerte: "stroke-alerte", encre: "stroke-encre" }[ton]
  const plein = { info: "fill-info", ok: "fill-ok", alerte: "fill-alerte", encre: "fill-encre" }[ton]
  const voile = { info: "fill-info/10", ok: "fill-ok/10", alerte: "fill-alerte/10", encre: "fill-encre/5" }[ton]
  if (barres) {
    const w = L / valeurs.length
    return (
      <svg viewBox={`0 0 ${L} ${h}`} preserveAspectRatio="none" className="block w-full" style={{ height: h }} aria-hidden="true">
        {valeurs.map((v, i) => <rect key={i} x={i * w + w * 0.14} width={w * 0.72} y={y(v)} height={Math.max(v ? 1.5 : 0, h - 2 - y(v))} className={`${plein} ${enCours && i === valeurs.length - 1 ? "opacity-35" : ""}`} />)}
        {objectif !== undefined ? <line x1={0} x2={L} y1={y(objectif)} y2={y(objectif)} className="stroke-encre" strokeDasharray="2 2" strokeWidth={1} vectorEffect="non-scaling-stroke" /> : null}
        <line x1={0} x2={L} y1={h - 1.5} y2={h - 1.5} className="stroke-trait" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      </svg>
    )
  }
  if (valeurs.length < 2) return <div style={{ height: h }} />
  const pts = valeurs.map((v, i) => [(i / (valeurs.length - 1)) * (L - 3) + 1.5, y(v)] as const)
  const d = pts.map(([x, yy], i) => `${i ? "L" : "M"}${x.toFixed(2)},${yy.toFixed(2)}`).join(" ")
  const [xd, yd] = pts[pts.length - 1]
  return (
    <div className="relative w-full" style={{ height: h }} aria-hidden="true">
      <svg viewBox={`0 0 ${L} ${h}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <path d={`${d} L${xd.toFixed(2)},${h - 1} L1.5,${h - 1} Z`} className={voile} />
        {objectif !== undefined ? <line x1={0} x2={L} y1={y(objectif)} y2={y(objectif)} className="stroke-encre-3" strokeDasharray="3 3" strokeWidth={1} vectorEffect="non-scaling-stroke" /> : null}
        <path d={d} fill="none" className={trait} strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className={`absolute h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full ${plein.replace("fill-", "bg-")} ring-2 ring-fond`} style={{ left: `${xd}%`, top: yd }} />
    </div>
  )
}

/** Une tuile du bandeau de cotes : la période en tête, le libellé, le chiffre, la cote, le repère, la mini-courbe. */
export function Tuile({ periode, libelle, valeur, ton = "text-encre", cote, repere, courbe, title, accent, className = "" }: {
  periode: string; libelle: string; valeur: ReactNode; ton?: string; cote?: ReactNode; repere?: ReactNode; courbe?: ReactNode; title?: string; accent?: "alerte" | "ok"; className?: string
}) {
  return (
    <div title={title} className={`relative flex min-w-0 flex-col bg-fond px-3 pb-2 pt-2.5 ${className} ${accent === "alerte" ? "shadow-[inset_0_2px_0_var(--color-alerte)]" : accent === "ok" ? "shadow-[inset_0_2px_0_var(--color-ok)]" : ""}`}>
      <span className="text-[9.5px] leading-3 text-encre-3">{periode}</span>
      <Etiquette className="block truncate">{libelle}</Etiquette>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className={`chiffres truncate text-[21px] font-semibold leading-7 tracking-[-0.01em] ${ton}`}>{valeur}</span>
        {cote}
      </div>
      <div className="chiffres line-clamp-2 min-h-8 text-colonne text-encre-2">{repere}</div>
      <div className="mt-auto pt-1.5">{courbe}</div>
    </div>
  )
}

/** Le bandeau : les tuiles collées, séparées par des filets d'un pixel (la grille fait les filets). */
export function BandeauCotes({ children, treize = false }: { children: ReactNode; treize?: boolean }) {
  // 12 tuiles : 12 de front sur grand écran, sinon 6, 4, 3 ou 2 par rangée (jamais de case vide).
  // 13 tuiles (la direction, avec les sous-traitants) : 13 de front sur grand écran ; plus étroit, la dernière tuile
  // prend toute la dernière rangée (sa classe le dit), pour ne jamais laisser de case vide.
  return (
    <div className={`grid grid-cols-2 gap-px overflow-hidden rounded-6 border-[0.5px] border-trait bg-trait @min-[640px]:grid-cols-3 @min-[880px]:grid-cols-4 @min-[1100px]:grid-cols-6 ${treize ? "@min-[1560px]:grid-cols-13" : "@min-[1560px]:grid-cols-12"}`}>
      {children}
    </div>
  )
}

/** Un panneau de liste de suivi : barre de titre serrée (petites capitales, compteur, mention, actions), corps. */
export function Panneau({ titre, compte, droite, outils, children, className = "", corps = "px-3 pb-2" }: {
  titre: ReactNode; compte?: ReactNode; droite?: ReactNode; outils?: ReactNode; children: ReactNode; className?: string; corps?: string
}) {
  return (
    <section className={`flex min-w-0 flex-col overflow-hidden rounded-6 border-[0.5px] border-trait bg-fond ${className}`}>
      <header className="flex min-h-9 shrink-0 items-center justify-between gap-3 border-b-[0.5px] border-trait bg-fond-2 px-3">
        <span className="flex min-w-0 items-baseline gap-2"><Etiquette className="truncate text-encre">{titre}</Etiquette>{compte !== undefined ? <span className="chiffres text-colonne text-encre-2">{compte}</span> : null}</span>
        <span className="flex min-w-0 items-center gap-3 text-colonne text-encre-2"><span className="truncate">{droite}</span>{outils}</span>
      </header>
      <div className={`min-h-0 flex-1 ${corps}`}>{children}</div>
    </section>
  )
}

/** Des onglets serrés, façon sélecteur d'unité de temps (1J 1S 1M…). */
export function Unites<T extends string>({ valeur, options, onChange }: { valeur: T; options: { id: T; label: string; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <span role="tablist" className="inline-flex shrink-0 overflow-hidden rounded-3 border-[0.5px] border-trait-fort bg-fond">
      {options.map((o, i) => (
        <button key={o.id} type="button" role="tab" aria-selected={o.id === valeur} title={o.title} onClick={() => onChange(o.id)}
          className={`h-6 px-2 text-[11px] font-medium transition-colors ${i ? "border-l-[0.5px] border-trait-fort" : ""} ${o.id === valeur ? "bg-encre text-fond" : "text-encre-2 hover:bg-fond-3 hover:text-encre"}`}>
          {o.label}
        </button>
      ))}
    </span>
  )
}

/** Une barre horizontale fine, à l'échelle d'un max. */
export function Barre({ v, max, ton = "bg-info", h = 6 }: { v: number; max: number; ton?: string; h?: number }) {
  return (
    <span className="block w-full rounded-full bg-fond-3" style={{ height: h }}>
      <span className={`block rounded-full ${ton}`} style={{ height: h, width: v > 0 ? `max(${h}px, ${Math.min(100, (v / Math.max(1, max)) * 100)}%)` : 0 }} />
    </span>
  )
}

/** Une jauge « bullet » compacte : réalisé, repère « attendu à date » (bleu), objectif (trait noir au bout). */
export function Jauge({ realise, objectif, attendu, ton = "bg-encre", h = 8 }: { realise: number; objectif: number; attendu?: number; ton?: string; h?: number }) {
  const m = Math.max(1, objectif, realise)
  const p = (x: number) => `${Math.min(100, (x / m) * 100)}%`
  return (
    <div className="relative w-full" style={{ height: h + 6 }} role="img" aria-label={`${realise} sur ${objectif}${attendu !== undefined ? `, ${attendu} attendus à cette date` : ""}`}>
      <div className="absolute inset-x-0 rounded-full bg-fond-3" style={{ top: 3, height: h }} />
      <div className={`absolute left-0 rounded-full ${ton}`} style={{ top: 3, height: h, width: realise > 0 ? `max(${h}px, ${p(realise)})` : 0 }} />
      {attendu !== undefined ? <div className="absolute w-[2px] -translate-x-1/2 bg-info" style={{ left: p(attendu), top: 0, height: h + 6 }} title={`Attendu à cette date : ${attendu}`} /> : null}
      <div className="absolute w-[2px] -translate-x-full bg-encre" style={{ left: p(objectif), top: 0, height: h + 6 }} title={`Objectif : ${objectif}`} />
    </div>
  )
}

/** Un tableau dense (rangées de 30 px), en-têtes collants : la liste de suivi. */
export function Grille({ colonnes, lignes, pied }: {
  colonnes: { titre: ReactNode; largeur?: string; droite?: boolean; title?: string }[]
  lignes: { cle: string; cellules: ReactNode[]; ton?: string; title?: string; onClick?: () => void; actif?: boolean }[]
  pied?: ReactNode[]
}) {
  return (
    <table className="w-full table-fixed border-collapse text-left">
      <colgroup>{colonnes.map((c, i) => <col key={i} style={c.largeur ? { width: c.largeur } : undefined} />)}</colgroup>
      {colonnes.every((c) => !c.titre) ? null : <thead className="sticky top-0 z-10 bg-fond">
        <tr className="h-7">{colonnes.map((c, i) => <th key={i} title={c.title} className={`truncate whitespace-nowrap px-1.5 font-normal first:pl-0 last:pr-0 ${c.droite ? "text-right" : ""}`}><Etiquette>{c.titre}</Etiquette></th>)}</tr>
      </thead>}
      <tbody>
        {lignes.map((l) => (
          <tr key={l.cle} title={l.title} onClick={l.onClick} className={`h-[30px] border-t-[0.5px] border-trait text-[12.5px] ${l.onClick ? "cursor-pointer" : ""} ${l.actif ? "bg-fond-4" : "hover:bg-fond-2"} ${l.ton ?? ""}`}>
            {l.cellules.map((cell, j) => <td key={j} className={`truncate px-1.5 first:pl-0 last:pr-0 ${colonnes[j]?.droite ? "chiffres text-right" : ""}`}>{cell}</td>)}
          </tr>
        ))}
      </tbody>
      {pied ? (
        <tfoot><tr className="h-[30px] border-t border-encre/70 text-[12.5px] font-semibold">{pied.map((c, j) => <td key={j} className={`truncate px-1.5 first:pl-0 last:pr-0 ${colonnes[j]?.droite ? "chiffres text-right" : ""}`}>{c}</td>)}</tr></tfoot>
      ) : null}
    </table>
  )
}

/** Des colonnes verticales compactes avec étiquettes (semaine, cadence, CA par mois). */
export function Colonnes({ valeurs, etiquettes, h = 96, enCours, format = fr, second, ligne, ligneLibelle, titre }: {
  valeurs: (number | null)[]; etiquettes: string[]; h?: number; enCours?: number; format?: (n: number) => string; second?: (number | null)[]; ligne?: number; ligneLibelle?: string; titre?: (i: number) => string
}) {
  const max = Math.max(1, ligne ?? 0, ...valeurs.map((v) => v ?? 0))
  const pc = (v: number) => `${(v / max) * 100}%`
  return (
    <div>
      <div className="relative flex items-end gap-1" style={{ height: h }}>
        {ligne !== undefined ? (
          <div className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-encre" style={{ bottom: pc(ligne) }}>
            {ligneLibelle ? <span className="absolute -top-[15px] right-0 bg-fond pl-1 text-[10px] text-encre">{ligneLibelle}</span> : null}
          </div>
        ) : null}
        {valeurs.map((v, i) => (
          <div key={i} className="group flex h-full min-w-0 flex-1 flex-col justify-end" title={titre ? titre(i) : `${etiquettes[i]} : ${v === null ? "à venir" : format(v)}`}>
            {v !== null ? <span className="chiffres mb-0.5 truncate text-center text-[10px] text-encre-2">{format(v)}</span> : null}
            <div className="relative mx-auto w-full max-w-[56px] group-hover:opacity-80" style={{ height: v ? pc(v) : 0, minHeight: v ? 2 : 0 }}>
              <div className={`absolute inset-0 rounded-t-[3px] ${i === enCours ? "bg-info/30" : "bg-info"}`} />
              {second && second[i] ? <div className="absolute inset-x-0 bottom-0 rounded-t-[3px] bg-encre" style={{ height: `${((second[i] ?? 0) / (v || 1)) * 100}%`, minHeight: 2 }} /> : null}
            </div>
          </div>
        ))}
      </div>
      <div className="flex h-5 items-center gap-1 border-t-[0.5px] border-trait">
        {etiquettes.map((e, i) => <span key={i} className={`chiffres min-w-0 flex-1 truncate text-center text-[10px] ${i === enCours ? "text-encre" : "text-encre-2"}`}>{e}</span>)}
      </div>
    </div>
  )
}

/** Une légende de série, une ligne. */
export function Legende({ items }: { items: { puce: string; texte: string }[] }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-colonne text-encre-2">
      {items.map((x) => <span key={x.texte} className="inline-flex items-center gap-1"><span className={`inline-block h-2 w-2 rounded-[2px] ${x.puce}`} />{x.texte}</span>)}
    </span>
  )
}

/** Le bandeau de tête de l'écran : titre, horloge de séance, raccourcis. */
export function TeteEcran({ titre, sous, droite }: { titre: string; sous: ReactNode; droite?: ReactNode }) {
  return (
    <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b-[0.5px] border-trait bg-fond px-4 py-2">
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 className="text-sous-titre font-semibold text-encre">{titre}</h1>
        <span className="truncate text-colonne text-encre-2">{sous}</span>
      </div>
      <div className="flex items-center gap-3">{droite}</div>
    </div>
  )
}

/** Depuis quand les chiffres de STC Bâtiment datent (lot 8, D103) : en alerte au-delà de 2 heures. */
export const FraicheurStc = ({ texte, vieux }: { texte: string; vieux: boolean }) => (
  <span role={vieux ? "alert" : undefined} title={vieux ? "La passerelle de STC Bâtiment n'a rien déposé depuis plus de 2 heures : les chiffres STC ne sont plus à jour." : "Dernier relevé de STC Bâtiment (mis à jour chaque heure)."}
    className={`inline-flex items-center gap-1.5 rounded-3 px-2 py-0.5 text-colonne ${vieux ? "bg-alerte/10 font-medium text-alerte" : "bg-fond-3 text-encre-2"}`}>
    <span className={`h-1.5 w-1.5 rounded-full ${vieux ? "bg-alerte" : "bg-encre-3"}`} />{vieux ? `${texte} · pas à jour` : texte}
  </span>
)

/** Le point « séance en cours ». */
export const Direct = ({ texte }: { texte: string }) => (
  <span className="inline-flex items-center gap-1.5 rounded-3 bg-fond-3 px-2 py-0.5 text-colonne text-encre"><span className="h-1.5 w-1.5 rounded-full bg-ok" />{texte}</span>
)

/** Les mouvements d'agences (ou de sous-traitants) actives : nouvelles + revenues au-dessus de l'axe, décrochées en dessous, le total en tête. */
export function Mouvements({ mois, hauteur = 150, sousTraitants = false }: { mois: { mois: string; actives: number; nouvelles: string[]; revenues: string[]; decrochees: string[] }[]; hauteur?: number; sousTraitants?: boolean }) {
  const haut = Math.max(1, ...mois.map((m) => m.nouvelles.length + m.revenues.length))
  const bas = Math.max(1, ...mois.map((m) => m.decrochees.length))
  const unite = (hauteur - 30) / (haut + bas)
  const segment = (n: number, cls: string, arrondi: string) => n ? <div className={`w-full ${cls} ${arrondi}`} style={{ height: n * unite - 2 }} /> : null
  return (
    <div>
      <div className="flex gap-2" style={{ height: hauteur }}>
        {mois.map((m) => {
          const titre = sousTraitants
            ? [`${moisCourt(m.mois)} : ${m.actives} actif${m.actives > 1 ? "s" : ""} en fin de mois`, m.nouvelles.length ? `nouveaux : ${m.nouvelles.join(", ")}` : "", m.revenues.length ? `revenus : ${m.revenues.join(", ")}` : "", m.decrochees.length ? `sortis : ${m.decrochees.join(", ")}` : ""].filter(Boolean).join("\n")
            : [`${moisCourt(m.mois)} : ${m.actives} active${m.actives > 1 ? "s" : ""} en fin de mois`, m.nouvelles.length ? `nouvelles : ${m.nouvelles.join(", ")}` : "", m.revenues.length ? `revenues : ${m.revenues.join(", ")}` : "", m.decrochees.length ? `décrochées : ${m.decrochees.join(", ")}` : ""].filter(Boolean).join("\n")
          return (
            <div key={m.mois} className="flex min-w-0 flex-1 flex-col items-center" title={titre}>
              <span className="chiffres h-[22px] text-legende font-semibold text-encre">{m.actives}</span>
              <div className="flex w-full max-w-[44px] flex-col justify-end gap-[2px]" style={{ height: haut * unite }}>
                {segment(m.revenues.length, "bg-info/40", m.nouvelles.length ? "" : "rounded-t-[4px]")}
                {segment(m.nouvelles.length, "bg-info", "rounded-b-none")}
              </div>
              <div className="w-full border-t border-encre" />
              <div className="flex w-full max-w-[44px] flex-col gap-[2px] pt-[2px]" style={{ height: bas * unite }}>
                {segment(m.decrochees.length, "bg-alerte", "rounded-b-[4px]")}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex h-6 items-center gap-2 border-t-[0.5px] border-trait">
        {mois.map((m) => <span key={m.mois} className="min-w-0 flex-1 truncate text-center text-colonne text-encre-2">{moisCourt(m.mois)}</span>)}
      </div>
    </div>
  )
}


/** « En attente des chiffres de STC Bâtiment » : la passerelle n'a pas encore déposé ce qu'il faut (jamais des zéros). */
export const AttenteStc = ({ quoi = "des chiffres de STC Bâtiment", className = "" }: { quoi?: string; className?: string }) => (
  <div className={`flex min-h-16 items-center justify-center gap-2 px-3 py-4 text-center text-colonne text-encre-2 ${className}`}>
    <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-encre-3" />En attente {quoi} (la passerelle se met à jour chaque heure).
  </div>
)
