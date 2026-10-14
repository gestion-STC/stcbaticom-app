// ════════════════════════════════════════════════════════════════════════════
// LE DESTINATAIRE D'UN E-MAIL DE DÉMARCHAGE (14/10/2026).
//
// Remplace l'ancien « Prospect » (table abandonnée à la refonte du 09/10) : un
// e-mail part toujours vers une AGENCE, et éventuellement l'un de ses contacts.
// Les variables des modèles ({{entreprise}}, {{contact}}…) se remplissent d'ici.
// ════════════════════════════════════════════════════════════════════════════
import { nomContact, type Agence, type Contact } from "../demarchage/modele"

export type Destinataire = {
  agenceId: string
  entreprise: string
  contact: string
  telephone: string
  email: string
  arrondissement: string
}

// Le contact choisi d'abord (sa ligne, son adresse), sinon l'agence.
export function destinataireDepuis(agence: Pick<Agence, "id" | "nom" | "telephone" | "email" | "secteurLibelle">, contact: Contact | null): Destinataire {
  return {
    agenceId: agence.id,
    entreprise: agence.nom,
    contact: contact ? nomContact(contact) : "",
    telephone: contact?.ligneDirecte || contact?.mobile || agence.telephone,
    email: contact?.email || agence.email,
    arrondissement: agence.secteurLibelle,
  }
}
