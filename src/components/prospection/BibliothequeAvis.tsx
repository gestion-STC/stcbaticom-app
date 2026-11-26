// Campagnes › Avis : les avis récoltés, à valider ou à réutiliser, et les passages vers Google.
// Un avis n'est jamais modifié. Un refus de publication est motivé (article L. 111-7-2 du Code de la consommation).
// Lot 3 (27/11/2026, décision 9) : depuis le 17/11, le lien d'avis mène directement à Google, plus aucun avis ni note
// n'arrive ici. L'onglet « À rappeler » (notes basses) ne pouvait plus rien recevoir : il est retiré, et la page affiche
// les passages vers Google par campagne.
import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, X } from "lucide-react"
import { Bandeau, Bouton, Champ, Chargement, EnTetePage, Onglets, Pastille, Vide } from "../../ui"
import { NOM_PUBLIC, chargerAvis, chargerPassagesGoogle, publierAvis, refuserAvis, type Avis, type PassagesGoogle } from "../../lib/avisDb"

type Vue = "a_valider" | "publie" | "refuse"
const date = (iso: string) => new Date(iso).toLocaleDateString("fr-FR")

export default function BibliothequeAvis() {
  const [avis, setAvis] = useState<Avis[] | null>(null)
  const [erreur, setErreur] = useState("")
  const [vue, setVue] = useState<Vue>("a_valider")
  const [refus, setRefus] = useState<{ id: string; motif: string } | null>(null)
  const charger = useCallback(() => { chargerAvis().then((l) => { setAvis(l); setErreur("") }).catch((e) => setErreur(e instanceof Error ? e.message : String(e))) }, [])
  useEffect(() => { const t = setTimeout(charger, 0); return () => clearTimeout(t) }, [charger])
  const agir = (f: Promise<void>) => { f.then(() => { setRefus(null); charger() }).catch((e) => setErreur(e instanceof Error ? e.message : String(e))) }
  const [google, setGoogle] = useState<PassagesGoogle[] | null>(null)
  useEffect(() => { chargerPassagesGoogle().then(setGoogle).catch((e) => setErreur(e instanceof Error ? e.message : String(e))) }, [])
  const compte = (v: Vue) => (avis ?? []).filter((a) => a.statut === v).length
  const visibles = useMemo(() => (avis ?? []).filter((a) => a.statut === vue), [avis, vue])
  const n = (a: Avis[] | null) => (a ? { moyenne: a.length ? Math.round((a.reduce((s, x) => s + x.note, 0) / a.length) * 10) / 10 : null, total: a.length } : null)
  const stats = n(avis)
  return (
    <div className="page">
      <EnTetePage titre="Avis" sousTitre="Depuis le 17/11, le lien d'avis mène directement à Google : les avis y sont déposés. Ici, les passages vers Google et les avis notés avant cette date." />
      {erreur ? <Bandeau role="alerte" className="mb-4">{erreur}</Bandeau> : null}
      <section className="mb-6">
        <h2 className="mb-2 text-legende font-medium text-encre">Passages vers Google</h2>
        {google === null ? <Chargement /> : !google.length ? <p className="text-colonne text-encre-2">Personne n'est encore passé par le lien d'avis.</p> : (
          <ul className="divide-y-[0.5px] divide-trait">{google.map((g) => <li key={g.campagneId} className="flex items-center gap-2 py-2 text-legende"><span>{g.nom}</span><span className="text-colonne text-encre-2">dernier le {date(g.dernier)}</span><span className="chiffres ml-auto font-medium text-encre">{g.personnes.toLocaleString("fr-FR")} personne{g.personnes > 1 ? "s" : ""}</span></li>)}</ul>
        )}
        <p className="mt-2 text-colonne text-encre-2">Une personne compte une fois par campagne, qu'elle ait laissé un avis ou non : Google ne nous le dit pas.</p>
      </section>
      <h2 className="mb-2 text-legende font-medium text-encre">Avis notés ici (avant le 17/11){stats?.moyenne != null ? ` · ${stats.total} avis, note moyenne ${stats.moyenne.toLocaleString("fr-FR")} / 5` : ""}</h2>
      <Onglets<Vue> valeur={vue} onChange={setVue} className="mb-4" options={[{ id: "a_valider", label: "À valider", badge: compte("a_valider") || undefined }, { id: "publie", label: "Réutilisables" }, { id: "refuse", label: "Refusés" }]} />
      {!avis && !erreur ? <Chargement /> : null}
      {avis && !visibles.length ? <Vide titre="Rien ici" texte="Les nouveaux avis sont déposés directement sur Google." /> : null}
      <ul className="divide-y-[0.5px] divide-trait">
        {visibles.map((a) => (
          <li key={a.id} className="py-3.5">
            <div className="flex flex-wrap items-center gap-2 text-colonne text-encre-2">
              <b className="chiffres text-legende font-semibold text-encre">{a.note} / 5</b>
              <span>{NOM_PUBLIC[a.public] ?? a.public}</span><span>·</span><span>{date(a.creeLe)}</span>
              {a.autorise ? <Pastille role="actif">Réutilisation autorisée</Pastille> : <Pastille role="attente">Réutilisation non autorisée</Pastille>}
            </div>
            <p className="mt-1.5 whitespace-pre-line text-corps text-encre">{a.commentaire || "(sans commentaire)"}</p>
            <p className="mt-1 text-colonne text-encre-2">{a.nomAffiche || "Sans nom"}{a.motifRefus ? ` · Refusé : ${a.motifRefus}` : ""}</p>
            {refus?.id === a.id ? (
              <div className="mt-2 flex flex-wrap items-center gap-2"><span className="w-80"><Champ value={refus.motif} autoFocus placeholder="Motif du refus" aria-label="Motif du refus" onChange={(e) => setRefus({ id: a.id, motif: e.target.value })} /></span><Bouton taille="sm" variante="plein" disabled={!refus.motif.trim()} onClick={() => agir(refuserAvis(a.id, refus.motif.trim()))}>Confirmer le refus</Bouton><Bouton taille="sm" variante="discret" onClick={() => setRefus(null)}>Annuler</Bouton></div>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {a.statut !== "publie" ? <Bouton taille="sm" variante="plein" icone={<Check />} disabled={!a.autorise} title={a.autorise ? undefined : "La personne n'a pas autorisé la réutilisation"} onClick={() => agir(publierAvis(a.id))}>Valider</Bouton> : null}
                {a.statut !== "refuse" ? <Bouton taille="sm" variante="discret" icone={<X />} onClick={() => setRefus({ id: a.id, motif: "" })}>Refuser</Bouton> : null}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
