// ════════════════════════════════════════════════════════════════════════════
// NOUVELLE AGENCE — un dialogue, sept champs, et la chasse aux doublons.
//
// Dès qu'un nom ou un standard est tapé (400 ms après la dernière frappe), on
// demande à la base si la même agence existe déjà : on la montre, avec
// « Ouvrir celle-ci », mais on laisse créer quand même (deux agences d'une même
// enseigne peuvent partager un nom dans deux secteurs).
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState, type ChangeEvent } from "react"
import { ExternalLink } from "lucide-react"
import { TYPES_AGENCE, type Agence, type Secteur, type TypeAgence, enseigneDe, libelleEtape, pastilleEtape, secteurDepuis } from "../../demarchage/modele"
import { chargerSecteurs, chercherDoublons, creerAgence } from "../../demarchage/db"
import { messageErreur, peutChercherDoublons, secteursParZone } from "../../demarchage/agencesOutils"
import { Bandeau, Bouton, Champ, Dialogue, Etiquette, Pastille, Selecteur } from "../../ui"

type Formulaire = { nom: string; telephone: string; secteur: string; type: TypeAgence; enseigne: string; adresse: string; email: string }

export default function NouvelleAgence({ onFermer, onCree }: { onFermer: () => void; onCree: (id: string) => void }) {
  const [f, setF] = useState<Formulaire>({ nom: "", telephone: "", secteur: "", type: "agence", enseigne: "", adresse: "", email: "" })
  const [enseigneTapee, setEnseigneTapee] = useState(false) // l'enseigne se devine depuis le nom tant qu'on ne l'a pas écrite soi-même
  const [secteurs, setSecteurs] = useState<Secteur[]>([])
  const [doublons, setDoublons] = useState<Agence[]>([])
  const [erreur, setErreur] = useState("")
  const [occupe, setOccupe] = useState(false)
  const set = (k: keyof Formulaire) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }))

  useEffect(() => {
    const t = setTimeout(() => { chargerSecteurs().then(setSecteurs).catch(() => setSecteurs([])) }, 0)
    return () => clearTimeout(t)
  }, [])

  // La chasse aux doublons, 400 ms après la dernière frappe sur le nom, le standard ou le secteur.
  useEffect(() => {
    if (!peutChercherDoublons(f.nom, f.telephone)) { const t = setTimeout(() => setDoublons([]), 0); return () => clearTimeout(t) }
    let annule = false
    const t = setTimeout(() => {
      chercherDoublons(f.nom, f.secteur || null, f.telephone).then((l) => { if (!annule) setDoublons(l) }).catch(() => { if (!annule) setDoublons([]) })
    }, 400)
    return () => { annule = true; clearTimeout(t) }
  }, [f.nom, f.telephone, f.secteur])

  const changerNom = (e: ChangeEvent<HTMLInputElement>) => {
    const nom = e.target.value
    setF((p) => ({ ...p, nom, enseigne: enseigneTapee ? p.enseigne : enseigneDe(nom) }))
  }
  // Un code postal tapé dans l'adresse remplit le secteur s'il est connu et encore vide.
  const changerAdresse = (e: ChangeEvent<HTMLInputElement>) => {
    const adresse = e.target.value
    setF((p) => {
      const cp = secteurDepuis(adresse)
      const secteur = !p.secteur && cp && secteurs.some((s) => s.code === cp) ? cp : p.secteur
      return { ...p, adresse, secteur }
    })
  }

  const creer = async () => {
    if (!f.nom.trim()) { setErreur("Le nom de l'agence est obligatoire."); return }
    setOccupe(true); setErreur("")
    try {
      const id = await creerAgence({ nom: f.nom, telephone: f.telephone.trim(), secteur: f.secteur, type: f.type, enseigne: f.enseigne.trim(), adresse: f.adresse.trim(), email: f.email.trim().toLowerCase() })
      onCree(id)
    } catch (e) {
      setErreur(messageErreur(e))
      setOccupe(false)
    }
  }

  return (
    <Dialogue
      titre="Nouvelle agence"
      description="Un standard = une agence. Les personnes s'ajoutent ensuite, dans la fiche, comme contacts."
      onFermer={onFermer}
      pied={
        <>
          <Bouton onClick={onFermer} disabled={occupe}>Annuler</Bouton>
          <Bouton variante="plein" chargement={occupe} onClick={creer}>Créer</Bouton>
        </>
      }
    >
      {erreur ? <Bandeau role="alerte" className="mb-4">{erreur}</Bandeau> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Etiquette texte="Nom de l'agence" className="sm:col-span-2"><Champ value={f.nom} onChange={changerNom} autoFocus placeholder="Century 21 Lutèce" /></Etiquette>
        <Etiquette texte="Standard"><Champ type="tel" value={f.telephone} onChange={set("telephone")} placeholder="01 43 00 00 00" /></Etiquette>
        <Etiquette texte="Enseigne" aide="Devinée depuis le nom ; vide pour un indépendant.">
          <Champ value={f.enseigne} onChange={(e) => { setEnseigneTapee(true); set("enseigne")(e) }} placeholder="Orpi, Foncia…" />
        </Etiquette>
        <Etiquette texte="Secteur">
          <Selecteur value={f.secteur} onChange={set("secteur")}>
            <option value="">— sans secteur —</option>
            {secteursParZone(secteurs).map((z) => (
              <optgroup key={z.zone} label={z.zone}>
                {z.secteurs.map((s) => <option key={s.code} value={s.code}>{s.libelle}</option>)}
              </optgroup>
            ))}
          </Selecteur>
        </Etiquette>
        <Etiquette texte="Type">
          <Selecteur value={f.type} onChange={set("type")}>
            {TYPES_AGENCE.map((t) => <option key={t.code} value={t.code}>{t.libelle}</option>)}
          </Selecteur>
        </Etiquette>
        <Etiquette texte="Adresse" className="sm:col-span-2"><Champ value={f.adresse} onChange={changerAdresse} placeholder="12 rue Mouffetard, 75005 Paris" /></Etiquette>
        <Etiquette texte="E-mail générique" className="sm:col-span-2"><Champ type="email" value={f.email} onChange={set("email")} placeholder="contact@agence.fr" /></Etiquette>
      </div>

      {doublons.length > 0 ? (
        <div className="mt-4 rounded-4 border border-attention/20 bg-attention-fond p-3">
          <p className="mb-2 text-legende font-medium text-attention">{doublons.length > 1 ? "Ces agences existent déjà :" : "Cette agence existe peut-être déjà :"}</p>
          <ul className="divide-y divide-attention/10">
            {doublons.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-1.5 text-legende">
                <div className="min-w-0">
                  <div className="truncate font-medium text-encre">{a.nom}</div>
                  <div className="flex flex-wrap items-center gap-2 text-colonne text-encre-2">
                    {a.secteurLibelle ? <span>{a.secteurLibelle}</span> : null}
                    {a.telephone ? <span className="chiffres">{a.telephone}</span> : null}
                    <Pastille role={pastilleEtape(a.etape)}>{libelleEtape(a.etape)}</Pastille>
                  </div>
                </div>
                <Bouton taille="sm" icone={<ExternalLink />} onClick={() => onCree(a.id)}>Ouvrir celle-ci</Bouton>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-colonne text-encre-2">Tu peux quand même créer la nouvelle fiche ; les doublons se fusionnent ensuite depuis la fiche.</p>
        </div>
      ) : null}
    </Dialogue>
  )
}
