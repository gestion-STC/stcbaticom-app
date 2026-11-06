// ── LE STYLE COURTIER DE LA PAGE AUJOURD'HUI (maquette validée par Mahdi le 06/11/2026) ──
// Le langage d'une salle de marché, dans le design système du logiciel : un bandeau de cotes,
// des tableaux serrés aux chiffres alignés, les hausses en vert ▲ et les baisses en rouge ▼,
// une petite courbe de tendance, des étiquettes en petites capitales.
import type { ReactNode } from "react"
import { fr } from "./outils"

export const Etiquette = ({ children, className = "" }: { children: ReactNode; className?: string }) => <span className={`text-[10px] font-medium uppercase tracking-[0.08em] text-encre-2 ${className}`}>{children}</span>

/** La variation, comme une cote : ▲ +12 % en vert, ▼ −84 % en rouge, « = » en gris. */
export function Variation({ n, avant, unite = "%" }: { n: number; avant: number; unite?: "%" | "pts" | "nb" }) {
  if (unite === "nb") {
    const d = n - avant
    if (d === 0) return <span className="chiffres text-colonne text-encre-2">=</span>
    return <span className={`chiffres text-colonne font-medium ${d > 0 ? "text-ok" : "text-alerte"}`}>{d > 0 ? "▲ +" : "▼ −"}{fr(Math.abs(d))}</span>
  }
  if (avant === 0) return <span className="chiffres text-colonne text-encre-2">{n > 0 ? "nouveau" : "="}</span>
  const v = unite === "pts" ? n - avant : ((n - avant) / avant) * 100
  if (Math.round(v) === 0) return <span className="chiffres text-colonne text-encre-2">=</span>
  return <span className={`chiffres text-colonne font-medium ${v > 0 ? "text-ok" : "text-alerte"}`}>{v > 0 ? "▲ +" : "▼ −"}{Math.abs(Math.round(v))}{unite === "pts" ? " pts" : " %"}</span>
}

/** Une petite courbe de tendance (jours ouvrés), le dernier point marqué. */
export function Courbe({ valeurs, l = 96, h = 26 }: { valeurs: number[]; l?: number; h?: number }) {
  if (valeurs.length < 2) return null
  const max = Math.max(1, ...valeurs)
  const pts = valeurs.map((v, i) => [(i / (valeurs.length - 1)) * (l - 4) + 2, h - 3 - (v / max) * (h - 6)] as const)
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ")
  const [xd, yd] = pts[pts.length - 1]
  return (
    <svg width={l} height={h} className="block" aria-hidden="true">
      <path d={`${d} L${xd.toFixed(1)},${h - 1} L2,${h - 1} Z`} className="fill-info/10" />
      <path d={d} fill="none" className="stroke-info" strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={xd} cy={yd} r={2.5} className="fill-info stroke-fond" strokeWidth={1} />
    </svg>
  )
}

/** Le bandeau de cotes : une case par chiffre, filets verticaux ; une case peut être cliquable. */
export function Bandeau({ cases }: { cases: { libelle: string; valeur: ReactNode; variation?: ReactNode; ton?: string; onClick?: () => void; title?: string }[] }) {
  return (
    <div className="grid grid-cols-2 border-y-[0.5px] border-trait @min-[900px]:grid-cols-3 @min-[1000px]:grid-flow-col @min-[1000px]:grid-cols-none @min-[1000px]:auto-cols-fr">
      {cases.map((c, i) => {
        const corps = (
          <>
            <Etiquette className="block truncate">{c.libelle}</Etiquette>
            <span className="mt-1 flex items-baseline gap-2">
              <span className={`chiffres text-[22px] font-semibold leading-7 ${c.ton ?? "text-encre"}`}>{c.valeur}</span>
              {c.variation}
            </span>
          </>
        )
        const cls = `min-w-0 border-trait px-4 py-3 text-left ${i ? "border-l-[0.5px]" : ""}`
        return c.onClick
          ? <button key={c.libelle} type="button" title={c.title} onClick={c.onClick} className={`${cls} transition-colors hover:bg-fond-2`}>{corps}</button>
          : <div key={c.libelle} title={c.title} className={cls}>{corps}</div>
      })}
    </div>
  )
}

/** Un bloc : en-tête en petites capitales posé sur un filet sombre, compteur et mention à droite. */
export function Bloc({ titre, compte, droite, children, className = "" }: { titre: string; compte?: ReactNode; droite?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 ${className}`}>
      <div className="flex min-h-9 items-end justify-between gap-3 border-b-[0.5px] border-encre/80 pb-2">
        <span className="flex items-baseline gap-2"><Etiquette className="text-encre">{titre}</Etiquette>{compte !== undefined ? <span className="chiffres text-colonne text-encre-2">{compte}</span> : null}</span>
        <span className="truncate text-colonne text-encre-2">{droite}</span>
      </div>
      {children}
    </section>
  )
}

/** Un tableau serré : en-têtes en petites capitales, rangées de 36 px, chiffres à droite. */
export function Table({ colonnes, lignes, vide }: { colonnes: { titre: string; largeur?: string; droite?: boolean }[]; lignes: { cle: string; cellules: ReactNode[] }[]; vide?: string }) {
  if (!lignes.length && vide) return <p className="py-6 text-legende text-encre-2">{vide}</p>
  return (
    <table className="w-full table-fixed border-collapse text-left">
      <colgroup>{colonnes.map((c, i) => <col key={i} style={c.largeur ? { width: c.largeur } : undefined} />)}</colgroup>
      <thead><tr className="h-8">{colonnes.map((c, i) => <th key={i} className={`truncate whitespace-nowrap px-2 font-normal first:pl-0 last:pr-0 ${c.droite ? "text-right" : ""}`}><Etiquette>{c.titre}</Etiquette></th>)}</tr></thead>
      <tbody>
        {lignes.map((l) => (
          <tr key={l.cle} className="h-9 border-t-[0.5px] border-trait text-legende hover:bg-fond-2">
            {l.cellules.map((cell, j) => <td key={j} className={`truncate px-2 first:pl-0 last:pr-0 ${colonnes[j]?.droite ? "chiffres text-right" : ""}`}>{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Un grand chapitre de la page : son titre en grand, posé sur un filet épais. */
export function Chapitre({ id, titre, sous, droite, children }: { id: string; titre: string; sous: string; droite?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16 pt-14 first-of-type:pt-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b-2 border-encre pb-3">
        <div><h2 className="text-h1 font-semibold text-encre">{titre}</h2><p className="mt-0.5 text-legende text-encre-2">{sous}</p></div>
        {droite}
      </div>
      <div className="space-y-10">{children}</div>
    </section>
  )
}

