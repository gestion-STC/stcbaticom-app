// Les contacts de l'agence en cours, et le formulaire « nouveau contact » ouvert pendant l'appel.
import type { Dispatch, SetStateAction } from "react"
import { Pencil, Plus } from "lucide-react"
import { ROLES_CONTACT, libelleRole, nomContact, type Contact, type RoleContact } from "../../../demarchage/modele"
import { Bouton, Champ, Etiquette, Pastille, Selecteur } from "../../../ui"
import { Section } from "./morceaux"
import type { NouveauContact } from "./outils"

export default function BlocContacts({
  contactsActifs,
  formContact,
  setFormContact,
  setContactAModifier,
  nouveauContact,
  setNouveauContact,
  creerLeContact,
}: {
  contactsActifs: Contact[]
  formContact: boolean
  setFormContact: Dispatch<SetStateAction<boolean>>
  setContactAModifier: (k: Contact) => void
  nouveauContact: NouveauContact
  setNouveauContact: (k: NouveauContact) => void
  creerLeContact: () => Promise<void>
}) {
  return (
    <Section
      titre="Contacts"
      droite={
        <Bouton taille="sm" variante="discret" icone={<Plus />} onClick={() => setFormContact((v) => !v)}>contact</Bouton>
      }
    >
      {contactsActifs.length === 0 && !formContact ? (
        <p className="text-legende text-encre-2">Aucun contact connu. Qui décroche ? Ajoute-le pendant l'appel.</p>
      ) : (
        <div className="divide-y divide-fond-4">
          {contactsActifs.map((k) => (
            <div key={k.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 text-legende">
              <button type="button" title="Modifier ce contact" onClick={() => setContactAModifier(k)} className="rounded-3 font-medium text-encre underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signature">{nomContact(k)}</button>
              <span className="text-encre-2">{libelleRole(k.role)}</span>
              {k.principal ? <Pastille role="info">principal</Pastille> : null}
              {k.email ? <span className="truncate text-encre-2">· {k.email}</span> : null}
              <Bouton variante="discret" taille="sm" icone={<Pencil />} className="ml-auto" onClick={() => setContactAModifier(k)}>Modifier</Bouton>
            </div>
          ))}
        </div>
      )}
      {formContact ? (
        <div className="mt-2 rounded-4 border border-trait bg-fond-2 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Etiquette texte="Prénom"><Champ value={nouveauContact.prenom} onChange={(e) => setNouveauContact({ ...nouveauContact, prenom: e.target.value })} autoFocus /></Etiquette>
            <Etiquette texte="Nom"><Champ value={nouveauContact.nom} onChange={(e) => setNouveauContact({ ...nouveauContact, nom: e.target.value })} /></Etiquette>
            <Etiquette texte="Rôle">
              <Selecteur value={nouveauContact.role} onChange={(e) => setNouveauContact({ ...nouveauContact, role: e.target.value as RoleContact })}>
                {ROLES_CONTACT.map((r) => (
                  <option key={r.code} value={r.code}>{r.libelle}</option>
                ))}
              </Selecteur>
            </Etiquette>
            <Etiquette texte="Ligne directe"><Champ value={nouveauContact.ligneDirecte} onChange={(e) => setNouveauContact({ ...nouveauContact, ligneDirecte: e.target.value })} placeholder="01 …" /></Etiquette>
            <Etiquette texte="Mobile"><Champ value={nouveauContact.mobile} onChange={(e) => setNouveauContact({ ...nouveauContact, mobile: e.target.value })} placeholder="06 …" /></Etiquette>
            <Etiquette texte="E-mail"><Champ type="email" value={nouveauContact.email} onChange={(e) => setNouveauContact({ ...nouveauContact, email: e.target.value })} /></Etiquette>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Bouton taille="sm" variante="discret" onClick={() => setFormContact(false)}>Annuler</Bouton>
            <Bouton taille="sm" icone={<Plus />} onClick={() => void creerLeContact()}>Ajouter le contact</Bouton>
          </div>
        </div>
      ) : null}
    </Section>
  )
}
