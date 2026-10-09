// ════════════════════════════════════════════════════════════════════════════
// UN CONTACT D'AGENCE — ajouter ou modifier (un dialogue au centre).
//
// Une personne = un contact rattaché à l'agence : prénom, nom, rôle, ligne
// directe, mobile, e-mail, « principal » (celui qu'on appelle en premier),
// « parti » (il a quitté l'agence : on le garde, grisé, pour l'historique).
// ════════════════════════════════════════════════════════════════════════════
import { useState, type ChangeEvent } from "react"
import { Trash2 } from "lucide-react"
import { ROLES_CONTACT, type Contact, type RoleContact, nomContact } from "../../demarchage/modele"
import { creerContact, majContact, supprimerContact } from "../../demarchage/db"
import { messageErreur } from "../../demarchage/agencesOutils"
import { Bandeau, Bouton, Case, Champ, Dialogue, Etiquette, Selecteur, Zone } from "../../ui"

type Formulaire = { prenom: string; nom: string; role: RoleContact; ligneDirecte: string; mobile: string; email: string; principal: boolean; parti: boolean; note: string }

export default function ContactFormulaire({ agenceId, contact, onFermer, onEnregistre }: { agenceId: string; contact?: Contact; onFermer: () => void; onEnregistre: () => void }) {
  const [f, setF] = useState<Formulaire>({
    prenom: contact?.prenom ?? "", nom: contact?.nom ?? "", role: contact?.role ?? "gestionnaire", ligneDirecte: contact?.ligneDirecte ?? "", mobile: contact?.mobile ?? "",
    email: contact?.email ?? "", principal: contact?.principal ?? false, parti: contact?.parti ?? false, note: contact?.note ?? "",
  })
  const [erreur, setErreur] = useState("")
  const [occupe, setOccupe] = useState(false)
  const [confirmerSuppression, setConfirmerSuppression] = useState(false)
  const set = (k: keyof Formulaire) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }))
  const modification = !!contact

  const enregistrer = async () => {
    if (!f.prenom.trim() && !f.nom.trim()) { setErreur("Donne au moins un prénom ou un nom."); return }
    if (!f.ligneDirecte.trim() && !f.mobile.trim() && !f.email.trim()) { setErreur("Il faut au moins une ligne directe, un mobile ou un e-mail : sans ça, on ne peut pas joindre cette personne."); return }
    setOccupe(true); setErreur("")
    try {
      if (modification) await majContact(contact.id, agenceId, f)
      else await creerContact(agenceId, f)
      onEnregistre()
    } catch (e) {
      setErreur(messageErreur(e))
      setOccupe(false)
    }
  }
  const supprimer = async () => {
    if (!contact) return
    setOccupe(true); setErreur("")
    try {
      await supprimerContact(contact.id)
      onEnregistre()
    } catch (e) {
      setErreur(messageErreur(e))
      setOccupe(false)
      setConfirmerSuppression(false)
    }
  }

  // La confirmation prend la place du formulaire ; ce qu'on y a tapé reste derrière.
  if (confirmerSuppression && contact) {
    return (
      <Dialogue
        titre="Supprimer ce contact ?"
        description="Ses appels et ses tâches restent dans le fil de l'agence, sans nom. Pour garder la trace d'un départ, préfère « Parti »."
        onFermer={() => setConfirmerSuppression(false)}
        largeur="max-w-md"
        pied={
          <>
            <Bouton onClick={() => setConfirmerSuppression(false)} disabled={occupe}>Annuler</Bouton>
            <Bouton variante="danger" icone={<Trash2 />} chargement={occupe} onClick={supprimer}>Supprimer</Bouton>
          </>
        }
      >
        {erreur ? <Bandeau role="alerte" className="mb-3">{erreur}</Bandeau> : null}
        <p className="text-legende text-encre">{nomContact(contact)}</p>
      </Dialogue>
    )
  }

  return (
    <Dialogue
      titre={modification ? "Modifier le contact" : "Ajouter un contact"}
      description={modification ? nomContact(contact) : "Une personne de l'agence : gestionnaire, responsable, directeur…"}
      onFermer={onFermer}
      pied={
        <>
          {modification ? <Bouton variante="danger" icone={<Trash2 />} disabled={occupe} onClick={() => setConfirmerSuppression(true)} className="mr-auto">Supprimer</Bouton> : null}
          <Bouton onClick={onFermer} disabled={occupe}>Annuler</Bouton>
          <Bouton variante="plein" chargement={occupe} onClick={enregistrer}>{modification ? "Enregistrer" : "Ajouter"}</Bouton>
        </>
      }
    >
      {erreur ? <Bandeau role="alerte" className="mb-4">{erreur}</Bandeau> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Etiquette texte="Prénom"><Champ value={f.prenom} onChange={set("prenom")} autoFocus /></Etiquette>
        <Etiquette texte="Nom"><Champ value={f.nom} onChange={set("nom")} /></Etiquette>
        <Etiquette texte="Rôle" className="sm:col-span-2">
          <Selecteur value={f.role} onChange={set("role")}>
            {ROLES_CONTACT.map((r) => <option key={r.code} value={r.code}>{r.libelle}</option>)}
          </Selecteur>
        </Etiquette>
        <Etiquette texte="Ligne directe"><Champ type="tel" value={f.ligneDirecte} onChange={set("ligneDirecte")} placeholder="01 43 00 00 10" /></Etiquette>
        <Etiquette texte="Mobile"><Champ type="tel" value={f.mobile} onChange={set("mobile")} placeholder="06 12 34 56 78" /></Etiquette>
        <Etiquette texte="E-mail" className="sm:col-span-2"><Champ type="email" value={f.email} onChange={set("email")} /></Etiquette>
        <Etiquette texte="Note" className="sm:col-span-2"><Zone value={f.note} onChange={set("note")} placeholder="Ce qu'il faut savoir avant de l'appeler" /></Etiquette>
        <div className="flex flex-wrap gap-4 sm:col-span-2">
          <Case texte="Contact principal (appelé en premier)" checked={f.principal} onChange={(e) => setF((p) => ({ ...p, principal: e.target.checked }))} />
          {modification ? <Case texte="A quitté l'agence" checked={f.parti} onChange={(e) => setF((p) => ({ ...p, parti: e.target.checked }))} /> : null}
        </div>
      </div>
    </Dialogue>
  )
}
