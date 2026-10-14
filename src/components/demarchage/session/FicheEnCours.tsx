// ── 2. L'agence en cours : sa carte ──
// L'identité, les bandeaux (appel direct, appel en suspens), les numéros et les contacts (reçus
// tout prêts : `BlocNumeros`, `BlocContacts`), la note de l'appel, les autres actions.
import type { Dispatch, ReactNode, SetStateAction } from "react"
import { ArrowRightLeft, Briefcase, CalendarClock, ExternalLink, Mail, MapPin, Mic, MicOff, SquareCheck, StickyNote } from "lucide-react"
import type { AgenceComplete } from "../../../demarchage/db"
import { dateCourte } from "../../../demarchage/agencesOutils"
import { libelleEtape, libelleType, pastilleEtape, type Activite } from "../../../demarchage/modele"
import { bilanDepuisAgence, dateHeureCourte, texteBilanAppels } from "../../../demarchage/sessionOutils"
import { Bandeau, Bouton, Carte, Pastille, Zone } from "../../../ui"
import { Section } from "./morceaux"
import { FABRIQUE_DICTEE, type Action } from "./outils"

export default function FicheEnCours({
  fiche,
  ouvrirAgence,
  passerEnApporteur,
  directeId,
  onRevenirFile,
  appelEnSuspens,
  noterAppelEnSuspens,
  barreVisible,
  blocNumeros,
  blocContacts,
  ecoute,
  dicter,
  note,
  setNote,
  ouvrirEmail,
  ouvrirAction,
}: {
  fiche: AgenceComplete
  ouvrirAgence: ((id: string, options?: { etape?: boolean }) => void) | undefined
  passerEnApporteur: () => Promise<void>
  directeId: string | null
  onRevenirFile: () => void
  appelEnSuspens: Activite | null
  noterAppelEnSuspens: (ligne: Activite) => void
  barreVisible: boolean
  blocNumeros: ReactNode
  blocContacts: ReactNode
  ecoute: boolean
  dicter: () => void
  note: string
  setNote: Dispatch<SetStateAction<string>>
  ouvrirEmail: () => void
  ouvrirAction: (type: Exclude<Action, "passer">) => void
}) {
  return (
    <Carte className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-section font-semibold tracking-[-0.015em] text-encre">{fiche.agence.nom}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {fiche.agence.enseigne ? <Pastille>{fiche.agence.enseigne}</Pastille> : null}
            {fiche.agence.secteurLibelle ? <Pastille>{fiche.agence.secteurLibelle}</Pastille> : null}
            <Pastille>{libelleType(fiche.agence.type)}</Pastille>
            <Pastille role={pastilleEtape(fiche.agence.etape)} point>{libelleEtape(fiche.agence.etape)}</Pastille>
            <span className="chiffres text-legende text-encre-2">
              {texteBilanAppels(bilanDepuisAgence(fiche.agence, fiche.activites), fiche.agence.etape)}
            </span>
            {fiche.agence.compteOuvertLe ? (
              <Pastille role="fait" point>Compte STC Bâtiment ouvert le {dateCourte(fiche.agence.compteOuvertLe)}</Pastille>
            ) : fiche.agence.dernierSignal ? (
              <Pastille role="info" point>{fiche.agence.dernierSignal} le {dateCourte(fiche.agence.dernierSignalLe)}</Pastille>
            ) : null}
          </div>
          {/* L'adresse, toujours visible (Mahdi, 14/10) : deux agences d'un même réseau dans le même arrondissement
              (« Laforêt Paris 13 ») ne se confondent plus. Inconnue : on le dit, et l'e-mail aide à les distinguer. */}
          <div className={"mt-1 flex items-start gap-1.5 text-legende " + (fiche.agence.adresse ? "text-encre" : "text-attention")}>
            <MapPin size={14} className="mt-0.5 shrink-0" />
            {fiche.agence.adresse ? (
              <span>{fiche.agence.adresse}</span>
            ) : (
              <span>Adresse inconnue{fiche.agence.email ? ` · ${fiche.agence.email}` : ""} — complète-la sur la fiche si tu l'obtiens.</span>
            )}
          </div>
        </div>
        {ouvrirAgence ? (
          <div className="flex items-center gap-1">
            <Bouton variante="discret" icone={<ArrowRightLeft />} onClick={() => ouvrirAgence(fiche.agence.id, { etape: true })}>Changer l'étape</Bouton>
            {/* Un apporteur d'affaires découvert en ligne (Mahdi, 12/10) : un clic, elle sort du démarchage, la file avance.
                Pas pendant un résultat à noter : recharger la file effacerait l'appel en cours. */}
            <Bouton variante="discret" icone={<Briefcase />} title="Cette agence est un apporteur d'affaires : elle sort du démarchage, l'appel en cours est clos, on passe à la suivante" onClick={() => void passerEnApporteur()}>Apporteur d'affaires</Bouton>
            <Bouton variante="discret" icone={<ExternalLink />} onClick={() => ouvrirAgence(fiche.agence.id)}>Ouvrir la fiche</Bouton>
          </div>
        ) : null}
      </div>
      {directeId ? (
        <Bandeau role="info" className="mt-3" action={<Bouton taille="sm" variante="discret" onClick={onRevenirFile}>Revenir à la file</Bouton>}>
          Appel direct, hors file.
        </Bandeau>
      ) : null}
      {appelEnSuspens ? (
        <Bandeau role="attention" className="mt-3" action={<Bouton taille="sm" variante="plein" onClick={() => noterAppelEnSuspens(appelEnSuspens)} disabled={barreVisible}>Noter le résultat</Bouton>}>
          Appel du {dateHeureCourte(appelEnSuspens.date)} : résultat non noté. Tant qu'il ne l'est pas, la fiche ne sait pas si tu as eu quelqu'un.
        </Bandeau>
      ) : null}

      {blocNumeros}

      {/* Contacts */}
      {blocContacts}

      {/* Note de l'appel */}
      <Section
        titre="Note de l'appel"
        droite={
          FABRIQUE_DICTEE ? (
            <Bouton taille="sm" variante={ecoute ? "danger" : "discret"} icone={ecoute ? <MicOff /> : <Mic />} onClick={dicter}>{ecoute ? "Arrêter la dictée" : "Dicter"}</Bouton>
          ) : null
        }
      >
        <Zone value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Ce qui s'est dit pendant l'appel… La note part avec le résultat." />
      </Section>

      {/* Autres actions */}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-fond-4 pt-3">
        <Bouton icone={<Mail />} onClick={ouvrirEmail}>E-mail</Bouton>
        <Bouton icone={<SquareCheck />} onClick={() => ouvrirAction("tache")}>Tâche</Bouton>
        <Bouton icone={<CalendarClock />} onClick={() => ouvrirAction("rdv")}>RDV</Bouton>
        <Bouton icone={<StickyNote />} onClick={() => ouvrirAction("note")}>Note</Bouton>
      </div>
    </Carte>
  )
}
