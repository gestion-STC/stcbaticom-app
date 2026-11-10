// La personnalisation par l'IA d'un mail (Mahdi, 10/11/2026) : facultative, réglée mail par mail, et relue avant de partir.
import { useState } from "react"
import { RefreshCw, Sparkles } from "lucide-react"
import { Bandeau, Bouton, Champ, Chargement, Dialogue, Interrupteur, Selecteur, Zone } from "../../../ui"
import { Etiquette } from "../../demarchage/aujourdhui/courtier"
import { ChoixFichiers } from "./ChoixFichiers"
import { ceQuiMarcheAuTelephone, enregistrerTextesIA, essayerIA, type Appris, type LigneIA } from "../../../lib/campagnesIa"
import { BALISE_IA, CHAMPS_IA, avecAppels, familleIA, reglageIADepart, type ModeIA, type ReglageIA } from "../../../prospection/ia"

const MODES: { id: ModeIA; label: string; aide: string }[] = [
  { id: "accroche", label: "Une accroche", aide: `Une phrase écrite pour chaque fiche, placée où tu mets ${BALISE_IA}. Le reste du mail est le tien.` },
  { id: "paragraphe", label: "Un paragraphe", aide: `Deux ou trois phrases écrites pour chaque fiche, à l'endroit de ${BALISE_IA}.` },
  { id: "mail", label: "Tout le mail", aide: "L'IA écrit le mail entier en suivant ta consigne. Ton texte lui sert de modèle." },
]
const pilule = (on: boolean) => `h-7 rounded-full px-3 text-colonne ${on ? "bg-action text-white" : "border-[0.5px] border-trait text-encre hover:bg-fond-2"}`
const euros = (x: number) => `${(x * 0.95).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} €`

type Props = { reglage?: ReglageIA; onChange: (r: ReglageIA) => void; baseId: string; campagne: { id: string; nom: string }; creatifId: string; variante: { id: string; objet: string; corps: string }; inserer: () => void }

export default function PersonnalisationIA({ reglage, onChange, baseId, campagne, creatifId, variante, inserer }: Props) {
  const r = reglage ?? reglageIADepart(baseId)
  const maj = (p: Partial<ReglageIA>) => onChange({ ...r, ...p })
  const [ouvert, setOuvert] = useState(false)
  const [lignes, setLignes] = useState<LigneIA[] | null>(null)
  const [cout, setCout] = useState(0)
  const [erreur, setErreur] = useState("")
  const [occupe, setOccupe] = useState("")
  const champs = CHAMPS_IA[familleIA(baseId)]
  const [appris, setAppris] = useState<Appris | null>(null)
  const [voirAppris, setVoirAppris] = useState(false)
  const [erreurAppris, setErreurAppris] = useState("")
  const lireAppris = async (refaire: boolean) => {
    setOccupe(refaire ? "apprendre" : "appris"); setErreurAppris("")
    try { setAppris(await ceQuiMarcheAuTelephone(refaire)); setVoirAppris(true) } catch (e) { setErreurAppris(e instanceof Error ? e.message : String(e)) } finally { setOccupe("") }
  }
  const aide = MODES.find((m) => m.id === r.mode)?.aide
  const parametres = { baseId, campagneNom: campagne.nom || "Campagne", objet: variante.objet, corps: variante.corps, ia: r }
  const voir = async () => {
    setOuvert(true); setLignes(null); setErreur("")
    try { const x = await essayerIA({ ...parametres, nombre: 10 }); setLignes(x.lignes); setCout(x.cout) } catch (e) { setErreur(e instanceof Error ? e.message : String(e)) }
  }
  const regenerer = async (l: LigneIA) => {
    setOccupe(l.contactRef); setErreur("")
    try { const x = await essayerIA({ ...parametres, contactRef: l.contactRef }); const n = x.lignes[0]; if (n) setLignes((a) => (a ?? []).map((y) => (y.contactRef === l.contactRef ? n : y))); setCout((c) => c + x.cout) } catch (e) { setErreur(e instanceof Error ? e.message : String(e)) } finally { setOccupe("") }
  }
  const valider = async () => {
    setOccupe("valider"); setErreur("")
    try { await enregistrerTextesIA(campagne.id, creatifId, variante.id, lignes ?? []); setOuvert(false) } catch (e) { setErreur(e instanceof Error ? e.message : String(e)) } finally { setOccupe("") }
  }
  const nb = (lignes ?? []).filter((l) => !l.pauvre).length
  return (
    <div className="rounded-4 border-[0.5px] border-trait p-3">
      <div className="flex items-center gap-2"><Sparkles size={14} className="shrink-0 text-encre-2" /><span className="min-w-0 flex-1"><b className="block text-legende font-medium">Personnaliser avec l'IA</b><span className="block text-colonne text-encre-2">{r.actif ? "Chaque contact reçoit un texte écrit à partir de sa fiche." : "Désactivé : ce mail part tel que tu l'as écrit."}</span></span><Interrupteur allume={r.actif} onChange={(v) => maj({ actif: v })} libelle="Personnaliser avec l'IA" /></div>
      {r.actif ? <div className="mt-4 space-y-4">
        <div className="space-y-1.5"><Etiquette>Ce que l'IA écrit</Etiquette><div className="flex flex-wrap gap-1.5">{MODES.map((m) => <button key={m.id} type="button" aria-pressed={r.mode === m.id} className={pilule(r.mode === m.id)} onClick={() => maj({ mode: m.id })}>{m.label}</button>)}</div><p className="text-colonne text-encre-2">{aide}</p>{r.mode !== "mail" && !variante.corps.includes(BALISE_IA) ? <Bouton taille="sm" onClick={inserer}>Insérer {BALISE_IA} après la salutation</Bouton> : null}</div>
        <div className="space-y-1.5"><Etiquette>Ce qu'elle a le droit d'utiliser</Etiquette><div className="flex flex-wrap gap-1.5">{champs.map((c) => <button key={c.cle} type="button" aria-pressed={r.champs.includes(c.cle)} className={pilule(r.champs.includes(c.cle))} onClick={() => maj({ champs: r.champs.includes(c.cle) ? r.champs.filter((x) => x !== c.cle) : [...r.champs, c.cle] })}>{c.libelle}</button>)}</div></div>
        {familleIA(baseId) === "agence" ? <div className="space-y-2 rounded-3 bg-fond-2 p-3">
          <div className="flex items-start gap-3"><span className="min-w-0 flex-1"><b className="block text-legende font-medium">S'appuyer sur ce qui marche au téléphone</b><span className="block text-colonne text-encre-2">L'IA lit une fiche tirée des appels analysés : les accroches et les arguments qui ont intéressé les gestionnaires, les objections fréquentes. Elle ne cite jamais un appel.</span></span><Interrupteur libelle="S'appuyer sur ce qui marche au téléphone" allume={avecAppels(baseId, r)} onChange={(v) => maj({ appels: v })} /></div>
          <div className="flex flex-wrap gap-2"><Bouton taille="sm" variante="discret" chargement={occupe === "appris"} onClick={() => (voirAppris ? setVoirAppris(false) : void lireAppris(false))}>{voirAppris ? "Masquer la fiche" : "Voir ce qu'elle a retenu"}</Bouton><Bouton taille="sm" variante="discret" icone={<RefreshCw />} chargement={occupe === "apprendre"} onClick={() => void lireAppris(true)}>Mettre à jour depuis les appels</Bouton></div>
          {erreurAppris ? <Bandeau role="alerte">{erreurAppris}</Bandeau> : null}
          {voirAppris ? appris ? <div className="space-y-1"><p className="text-colonne text-encre-2">Tirée de {appris.nb} appels intéressés, le {new Date(appris.le).toLocaleDateString("fr-FR")}.</p><p className="whitespace-pre-line text-colonne text-encre">{appris.texte}</p></div> : <p className="text-colonne text-encre-2">Pas encore de fiche : touche « Mettre à jour depuis les appels ».</p> : null}
        </div> : null}
        <label className="block space-y-1.5"><Etiquette>Le contexte de la campagne</Etiquette><Zone rows={4} value={r.contexte} onChange={(e) => maj({ contexte: e.target.value })} /></label>
        <label className="block space-y-1.5"><Etiquette>Ta consigne</Etiquette><Zone rows={3} value={r.consigne} onChange={(e) => maj({ consigne: e.target.value })} /></label>
        <label className="block space-y-1.5"><Etiquette>Ce qu'elle ne doit jamais faire</Etiquette><Champ value={r.interdit} onChange={(e) => maj({ interdit: e.target.value })} /></label>
        <div className="space-y-3">
          <label className="block min-w-0 space-y-1.5"><Etiquette>Sur qui</Etiquette><Selecteur value={r.qui} onChange={(e) => maj({ qui: e.target.value as ReglageIA["qui"] })}><option value="tous">Tous les contacts</option><option value="moitie">La moitié (avec ou sans IA, pour comparer)</option><option value="fichiers">Seulement certains fichiers</option></Selecteur></label>
          {r.qui === "fichiers" ? <ChoixFichiers baseId={baseId} valeurs={r.fichiers} onChange={(l) => maj({ fichiers: l })} /> : null}
          <label className="block min-w-0 space-y-1.5"><Etiquette>Si la fiche est trop pauvre</Etiquette><Selecteur value={r.pauvre} onChange={(e) => maj({ pauvre: e.target.value as ReglageIA["pauvre"] })}><option value="texte">Envoyer mon texte, sans accroche</option><option value="attente">Mettre le contact de côté</option></Selecteur></label>
          <label className="block min-w-0 space-y-1.5"><Etiquette>Relecture avant l'envoi</Etiquette><Selecteur value={r.relecture} onChange={(e) => maj({ relecture: e.target.value as ReglageIA["relecture"] })}><option value="dix">10 exemples</option><option value="tous">Chaque mail</option><option value="aucune">Aucune</option></Selecteur></label>
        </div>
        <Bouton icone={<Sparkles />} onClick={() => void voir()}>Voir sur de vraies fiches</Bouton>
      </div> : null}
      {ouvert ? <Dialogue titre="Ce que recevraient ces contacts" description="Tu peux régénérer ou réécrire chaque texte. Rien ne part tant que la campagne n'est pas lancée." largeur="max-w-3xl" onFermer={() => setOuvert(false)} pied={<><Bouton onClick={() => setOuvert(false)}>Modifier la consigne</Bouton><Bouton variante="plein" disabled={!nb} chargement={occupe === "valider"} onClick={() => void valider()}>Valider ces textes</Bouton></>}>
        {erreur ? <Bandeau role="alerte" className="mb-3">{erreur}</Bandeau> : null}
        {!lignes && !erreur ? <Chargement texte="L'IA écrit pour de vraies fiches…" /> : null}
        {lignes ? <><ul className="divide-y-[0.5px] divide-trait">{lignes.map((l, i) => <li key={l.contactRef} className="grid gap-2 py-3 sm:grid-cols-[170px_minmax(0,1fr)_auto]">
          <div className="min-w-0"><p className="truncate text-legende font-medium">{l.nom}</p><p className="truncate text-colonne text-encre-2">{l.detail}</p></div>
          {l.pauvre ? <p className="self-center text-colonne text-encre-2">{r.pauvre === "texte" ? "Fiche trop pauvre : ton texte part sans accroche." : "Fiche trop pauvre : ce contact est mis de côté."}</p> : <Zone rows={2} aria-label={`Texte pour ${l.nom}`} value={l.texte} onChange={(e) => setLignes((x) => (x ?? []).map((y, j) => (j === i ? { ...y, texte: e.target.value, modifie: true } : y)))} />}
          <Bouton taille="icone" variante="discret" icone={<RefreshCw />} aria-label={`Régénérer pour ${l.nom}`} disabled={l.pauvre} chargement={occupe === l.contactRef} onClick={() => void regenerer(l)} />
        </li>)}</ul><p className="mt-3 text-colonne text-encre-2">Coût de cet essai : {euros(cout)}{nb ? `, soit environ ${euros(cout / nb)} par mail` : ""}.</p></> : null}
      </Dialogue> : null}
    </div>
  )
}
