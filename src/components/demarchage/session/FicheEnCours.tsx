// ── 2. L'agence en cours (dessin du 06/11/2026, thème A2 : au trait, sans carte) ──
// L'identité, les bandeaux (appel direct, appel en suspens), les numéros et les contacts (reçus
// tout prêts : `BlocNumeros`, `BlocContacts`), la note de l'appel. Plus de boutons E-mail, Tâche, RDV (07/11) :
// le mail part de la barre de résultat, le rendez-vous et le rappel se notent dans le résultat.
import type { Dispatch, ReactNode, SetStateAction } from "react"
import { ArrowRightLeft, ExternalLink, MapPin, Mic, MicOff } from "lucide-react"
import type { AgenceComplete, Lead } from "../../../demarchage/db"
import { attenteLisible, couleurAttente, minutesDepuis } from "../../../demarchage/leadsOutils"
import { DernierEchange } from "../EchangesAppels"
import { dateCourte } from "../../../demarchage/agencesOutils"
import { libelleEtape, libelleType, pastilleEtape, type Activite } from "../../../demarchage/modele"
import { bilanDepuisAgence, dateHeureCourte, texteBilanAppels } from "../../../demarchage/sessionOutils"
import { Bandeau, Bouton, Pastille, Zone } from "../../../ui"
import { Section } from "./morceaux"
import ConseilsAvantAppel from "./ConseilsAvantAppel"
import { FABRIQUE_DICTEE } from "./outils"

export default function FicheEnCours({
  fiche,
  ouvrirAgence,
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
  lead,
  maintenant,
}: {
  fiche: AgenceComplete
  /** Le lead de l'agence (mode Leads) : son signal s'affiche sous le nom. */
  lead?: Lead
  maintenant: Date
  ouvrirAgence: ((id: string, options?: { etape?: boolean }) => void) | undefined
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
}) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-h1 font-semibold tracking-[-0.015em] text-encre">{fiche.agence.nom}</h2>
          {lead ? (
            <p className="mt-1.5 text-legende text-encre">
              <span className="mr-2 inline-block h-1.5 w-1.5 -translate-y-px rounded-full bg-signature" />
              <b className="font-medium">Lead</b> · {lead.signal} · <span className={"chiffres " + couleurAttente(minutesDepuis(lead.creeLe, maintenant))}>{attenteLisible(minutesDepuis(lead.creeLe, maintenant))}</span>
              {lead.tentatives ? <span className="text-encre-2"> · {lead.tentatives} essai{lead.tentatives > 1 ? "s" : ""} sans le gestionnaire</span> : null}
              {lead.detail ? <span className="block pl-[14px] text-colonne text-encre-2">{lead.detail}</span> : null}
            </p>
          ) : null}
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

      {/* Ce qui s'est dit la dernière fois (26/10/2026) : avant de rappeler, on sait où on en est. */}
      <DernierEchange agenceId={fiche.agence.id} version={fiche.activites.length} className="mt-3" />
      <ConseilsAvantAppel agenceId={fiche.agence.id} className="mt-3" />

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

    </div>
  )
}
