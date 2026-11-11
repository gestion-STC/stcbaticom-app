// Campagnes › Avis : les avis récoltés, à valider, à réutiliser ou à rappeler.
// Un avis n'est jamais modifié. Un refus de publication est motivé (article L. 111-7-2 du Code de la consommation).
import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, Phone, X } from "lucide-react"
import { Bandeau, Bouton, Champ, Chargement, EnTetePage, Onglets, Pastille, Vide } from "../../ui"
import { NOM_PUBLIC, chargerAvis, noterRappel, publierAvis, refuserAvis, type Avis } from "../../lib/avisDb"
import { NOTE_RAPPEL_DEPART, aRappeler } from "../../prospection/avis"
import { ecrireParametre, lireParametre } from "../../lib/parametresDb"

type Vue = "a_valider" | "publie" | "refuse" | "rappeler"
const date = (iso: string) => new Date(iso).toLocaleDateString("fr-FR")

export default function BibliothequeAvis() {
  const [avis, setAvis] = useState<Avis[] | null>(null)
  const [erreur, setErreur] = useState("")
  const [vue, setVue] = useState<Vue>("a_valider")
  const [refus, setRefus] = useState<{ id: string; motif: string } | null>(null)
  const charger = useCallback(() => { chargerAvis().then((l) => { setAvis(l); setErreur("") }).catch((e) => setErreur(e instanceof Error ? e.message : String(e))) }, [])
  useEffect(() => { const t = setTimeout(charger, 0); return () => clearTimeout(t) }, [charger])
  const agir = (f: Promise<void>) => { f.then(() => { setRefus(null); charger() }).catch((e) => setErreur(e instanceof Error ? e.message : String(e))) }
  // La note qui déclenche un rappel : réglable (Mahdi, 11/11/2026).
  const [seuil, setSeuil] = useState(NOTE_RAPPEL_DEPART)
  useEffect(() => { lireParametre("avis_note_rappel").then((x) => { const n = Number(x); if (x && n >= 1 && n <= 5) setSeuil(n) }).catch(() => undefined) }, [])
  const majSeuil = (n: number) => { setSeuil(n); void ecrireParametre("avis_note_rappel", String(n)) }
  const compte = (v: Vue) => (avis ?? []).filter((a) => (v === "rappeler" ? aRappeler(a.note, seuil) && !a.rappeleLe : a.statut === v)).length
  const visibles = useMemo(() => (avis ?? []).filter((a) => (vue === "rappeler" ? aRappeler(a.note, seuil) && !a.rappeleLe : a.statut === vue)), [avis, vue, seuil])
  const n = (a: Avis[] | null) => (a ? { moyenne: a.length ? Math.round((a.reduce((s, x) => s + x.note, 0) / a.length) * 10) / 10 : null, total: a.length } : null)
  const stats = n(avis)
  return (
    <div className="page">
      <EnTetePage titre="Avis" sousTitre={stats?.moyenne != null ? `${stats.total} avis · note moyenne ${stats.moyenne.toLocaleString("fr-FR")} / 5` : "Les avis récoltés par les campagnes, à valider avant de les réutiliser."} />
      {erreur ? <Bandeau role="alerte" className="mb-4">{erreur}</Bandeau> : null}
      <Onglets<Vue> valeur={vue} onChange={setVue} className="mb-4" options={[{ id: "a_valider", label: "À valider", badge: compte("a_valider") || undefined }, { id: "publie", label: "Réutilisables" }, { id: "refuse", label: "Refusés" }, { id: "rappeler", label: "À rappeler", badge: compte("rappeler") || undefined }]} />
      {vue === "rappeler" ? <div className="mb-4 flex flex-wrap items-center gap-2 text-legende">Rappeler les notes de <select className="h-8 rounded-4 border-[0.5px] border-trait bg-fond px-2" aria-label="Note maximale à rappeler" value={seuil} onChange={(e) => majSeuil(Number(e.target.value))}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select> sur 5 ou moins</div> : null}
      {!avis && !erreur ? <Chargement /> : null}
      {avis && !visibles.length ? <Vide titre="Rien ici" texte="Les avis arrivent ici quand une campagne d'avis est lancée." /> : null}
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
                {vue === "rappeler" ? <Bouton taille="sm" icone={<Phone />} onClick={() => agir(noterRappel(a.id))}>Marquer comme rappelé</Bouton> : null}
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
