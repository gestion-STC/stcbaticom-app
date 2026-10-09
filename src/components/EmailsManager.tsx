// ════════════════════════════════════════════════════════════════════════════
// RÉGLAGES › MODÈLES D'E-MAIL — la liste des modèles (nom, objet, corps,
// pièces jointes, ordre), la signature du compte connecté et le nom qui signe
// les envois automatiques. Même logique de données qu'avant (table « emails »,
// paramètre « commercial »), habillage dans la trousse STC (09/10/2026).
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react"
import { Check, Paperclip, Pencil, Plus, Trash2 } from "lucide-react"
import { apercu, type Email } from "../emails"
import { supabaseConfigure } from "../lib/supabase"
import { chargerEmails, creerEmail, majEmail, supprimerEmail } from "../lib/emailsDb"
import { lireParametre, ecrireParametre } from "../lib/parametresDb"
import { useSession } from "../lib/auth"
import { nomAffiche } from "../lib/comptes"
import { signatureStc } from "../lib/signatureStc"
import { Bandeau, Bouton, Carte, Champ, Chargement, Dialogue, Tableau, Td, Th, TitreCarte, Tr, Vide } from "../ui"
import EmailModal from "./EmailModal"

type ModalState = { mode: "create" } | { mode: "edit"; email: Email } | null

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

// Première ligne du corps, coupée court, pour la colonne « Aperçu ».
function premiereLigne(texte: string, max = 90): string {
  const l = apercu(texte).split("\n").find((x) => x.trim()) ?? ""
  return l.length > max ? l.slice(0, max - 1).trimEnd() + "…" : l
}

export default function EmailsManager() {
  const [emails, setEmails] = useState<Email[]>([])
  const [chargement, setChargement] = useState(supabaseConfigure)
  const [erreur, setErreur] = useState<string | null>(supabaseConfigure ? null : "Supabase non configuré.")
  const [modal, setModal] = useState<ModalState>(null)
  // Le modèle dont on demande la suppression (la question se pose dans un dialogue).
  const [aSupprimer, setASupprimer] = useState<Email | null>(null)
  // Signature STC Bâtiment du compte connecté : c'est elle qui part avec chaque
  // e-mail envoyé depuis le logiciel (après un appel, boîte de réception).
  const session = useSession()
  const signatureCompte = signatureStc({ nom: nomAffiche(session) })
  // Les envois AUTOMATIQUES (règles) n'ont pas de compte connecté : ils signent
  // du nom réglé ici (paramètre « commercial »), dans le même format.
  const [nomAuto, setNomAuto] = useState("")
  const [nomAutoCharge, setNomAutoCharge] = useState(false)
  const [nomAutoSauve, setNomAutoSauve] = useState(false)

  useEffect(() => {
    if (!supabaseConfigure) return
    chargerEmails()
      .then(setEmails)
      .catch((e) => setErreur("Impossible de charger les modèles. Avez-vous créé la table « emails » ? Détail : " + message(e)))
      .finally(() => setChargement(false))
    lireParametre("commercial")
      .then((v) => {
        if (v) setNomAuto(v)
      })
      .catch(() => {})
      .finally(() => setNomAutoCharge(true))
  }, [])

  // La mention « Enregistré » s'efface seule après 2 s.
  useEffect(() => {
    if (!nomAutoSauve) return
    const t = setTimeout(() => setNomAutoSauve(false), 2000)
    return () => clearTimeout(t)
  }, [nomAutoSauve])

  async function enregistrerNomAuto() {
    try {
      await ecrireParametre("commercial", nomAuto.trim())
      setNomAutoSauve(true)
    } catch (e) {
      setErreur("Nom non enregistré. Détail : " + message(e))
    }
  }

  async function enregistrer(em: Email) {
    if (modal?.mode === "edit" && modal.email.id) {
      setEmails((arr) => arr.map((x) => (x.id === modal.email.id ? { ...em, id: x.id } : x)))
      await majEmail(modal.email.id, em).catch(console.error)
    } else {
      try {
        const cree = await creerEmail(em)
        setEmails((arr) => [...arr, cree])
      } catch (e) {
        setErreur("Création impossible : " + message(e))
      }
    }
    setModal(null)
  }

  async function supprimer(em: Email) {
    setASupprimer(null)
    setEmails((arr) => arr.filter((x) => x.id !== em.id))
    if (em.id) await supprimerEmail(em.id).catch(console.error)
  }

  const nouveauModele = (
    <Bouton variante="plein" icone={<Plus />} onClick={() => setModal({ mode: "create" })}>
      Nouveau modèle
    </Bouton>
  )

  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-legende text-encre-2">
        Les modèles d'e-mail que l'on envoie depuis une fiche ou après un appel. Chacun part avec la signature STC Bâtiment ; les variables
        ({"{{contact}}"}, {"{{entreprise}}"}…) sont remplacées par les informations de l'agence à l'envoi.
      </p>

      {erreur ? (
        <Bandeau role="alerte" action={<Bouton taille="sm" variante="discret" onClick={() => setErreur(null)}>Fermer</Bouton>}>
          {erreur}
        </Bandeau>
      ) : null}

      {/* Une seule signature dans tout le logiciel : celle de STC Bâtiment
          (Mahdi, 07/10/2026). Pour le compte connecté, elle porte son nom ;
          pour les envois automatiques des règles, le nom réglé plus bas. */}
      <div className="grid gap-5 xl:grid-cols-2">
        <Carte>
          <TitreCarte>Ma signature</TitreCarte>
          <div className="px-5 pb-5">
            <p className="mb-3 text-legende text-encre-2">
              La signature STC Bâtiment, à ton nom. Elle part avec chaque e-mail envoyé depuis le logiciel. Pour changer le nom : onglet Comptes.
            </p>
            <div className="signature-edit rounded-4 border border-trait bg-fond-2 px-4 pb-4 text-corps" dangerouslySetInnerHTML={{ __html: signatureCompte }} />
          </div>
        </Carte>

        <Carte>
          <TitreCarte>Envois automatiques</TitreCarte>
          <div className="px-5 pb-5">
            <p className="mb-3 text-legende text-encre-2">
              Les règles d'envoi n'ont pas de compte connecté : elles signent du nom ci-dessous, même format. Ce nom remplit aussi {"{{commercial}}"}.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Champ
                id="nom-envois-automatiques"
                value={nomAuto}
                onChange={(e) => setNomAuto(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void enregistrerNomAuto() }}
                placeholder="L'équipe STC"
                disabled={!nomAutoCharge}
                className="w-72"
              />
              <Bouton icone={nomAutoSauve ? <Check /> : undefined} disabled={!nomAutoCharge} onClick={enregistrerNomAuto}>
                {nomAutoSauve ? "Enregistré" : "Enregistrer"}
              </Bouton>
            </div>
            <div className="signature-edit mt-3 rounded-4 border border-trait bg-fond-2 px-4 pb-4 text-corps" dangerouslySetInnerHTML={{ __html: signatureStc({ nom: nomAuto }) }} />
          </div>
        </Carte>
      </div>

      <Carte>
        <TitreCarte droite={nouveauModele}>Modèles</TitreCarte>
        {chargement ? (
          <Chargement texte="Lecture des modèles…" />
        ) : emails.length === 0 ? (
          <Vide titre="Aucun modèle" texte="Clique sur « Nouveau modèle » pour composer le premier." />
        ) : (
          <Tableau className="pb-2">
            <thead>
              <tr>
                <Th num className="w-[60px]">Ordre</Th>
                <Th>Nom</Th>
                <Th>Objet</Th>
                <Th>Aperçu</Th>
                <Th num className="w-[110px]">Pièces</Th>
                <Th className="w-[84px]" />
              </tr>
            </thead>
            <tbody>
              {emails.map((em) => (
                <Tr key={em.id ?? em.nom}>
                  <Td num className="text-encre-2">{em.ordre}</Td>
                  <Td className="font-medium text-encre">{em.nom}</Td>
                  <Td className="text-encre">{apercu(em.objet)}</Td>
                  <Td className="max-w-[360px] truncate text-encre-2" title={apercu(em.corps)}>{premiereLigne(em.corps)}</Td>
                  <Td num className={em.pieces.length ? "text-encre" : "text-encre-3"}>
                    {em.pieces.length ? (
                      <span className="inline-flex items-center gap-1"><Paperclip size={14} className="text-encre-2" />{em.pieces.length}</span>
                    ) : "—"}
                  </Td>
                  <Td className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <Bouton taille="icone" variante="discret" className="h-7 w-7" aria-label={`Modifier ${em.nom}`} onClick={() => setModal({ mode: "edit", email: em })}><Pencil /></Bouton>
                      <Bouton taille="icone" variante="discret" className="h-7 w-7 text-encre-2 hover:text-alerte" aria-label={`Supprimer ${em.nom}`} onClick={() => setASupprimer(em)}><Trash2 /></Bouton>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Tableau>
        )}
      </Carte>

      {modal ? (
        <EmailModal
          email={modal.mode === "edit" ? modal.email : null}
          ordreParDefaut={(emails.at(-1)?.ordre ?? 0) + 1}
          signature={signatureCompte}
          onClose={() => setModal(null)}
          onSave={enregistrer}
        />
      ) : null}

      {aSupprimer ? (
        <Dialogue
          titre="Supprimer ce modèle ?"
          description="Il disparaît de la liste des modèles proposés à l'envoi. Les e-mails déjà envoyés ne changent pas."
          onFermer={() => setASupprimer(null)}
          largeur="max-w-md"
          pied={
            <>
              <Bouton onClick={() => setASupprimer(null)}>Annuler</Bouton>
              <Bouton variante="danger" icone={<Trash2 />} onClick={() => supprimer(aSupprimer)}>Supprimer</Bouton>
            </>
          }
        >
          <p className="text-legende text-encre">{aSupprimer.nom}</p>
        </Dialogue>
      ) : null}
    </div>
  )
}
