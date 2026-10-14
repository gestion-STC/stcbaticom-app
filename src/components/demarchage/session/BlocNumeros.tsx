// Les numéros de l'agence en cours, l'état de l'appel, le numéro d'émission et sa jauge du jour.
import { Check, Copy, Phone, StickyNote } from "lucide-react"
import { formaterTelephone } from "../../../lib/telephone"
import { dureeLisible } from "../../../demarchage/modele"
import { dureeAppel, type jaugeDuJour, type lignesNumeros, type numeroEmissionPour } from "../../../demarchage/sessionOutils"
import { Bandeau, Bouton, Pastille, Vide } from "../../../ui"
import { Section } from "./morceaux"
import { TEXTES_APPEL, type AppelEnCours } from "./outils"

export default function BlocNumeros({
  lignes,
  appel,
  maintenant,
  barreVisible,
  appelEnSuspens,
  titreSuspens,
  noterSansRingover,
  copie,
  copier,
  emissionBloquee,
  libre,
  autreOnglet,
  bloqueOnglet,
  lancerAppel,
  attribution,
  reattribuerNumero,
  numeroEmission,
  jauge,
}: {
  lignes: ReturnType<typeof lignesNumeros>
  appel: AppelEnCours | null
  maintenant: number
  barreVisible: boolean
  appelEnSuspens: boolean
  titreSuspens: string | undefined
  noterSansRingover: () => void
  copie: string
  copier: (numero: string) => void
  emissionBloquee: boolean
  libre: boolean
  autreOnglet: boolean
  bloqueOnglet: string | undefined
  lancerAppel: (numero: string, contactId: string | null) => Promise<void>
  attribution: ReturnType<typeof numeroEmissionPour> | null
  reattribuerNumero: () => void
  numeroEmission: string
  jauge: ReturnType<typeof jaugeDuJour>
}) {
  // ── L'état de l'appel, en une ligne ──
  const dureeAffichee = appel
    ? appel.etape === "en_cours" && appel.enLigneDepuis
      ? dureeLisible(dureeAppel(appel.enLigneDepuis, maintenant))
      : appel.fin && appel.enLigneDepuis
        ? dureeLisible(dureeAppel(appel.enLigneDepuis, appel.fin))
        : ""
    : ""

  return (
    <>
      {/* Numéros */}
      <Section
        titre="Numéros"
        droite={
          <Bouton taille="sm" variante="discret" icone={<StickyNote />} onClick={noterSansRingover} disabled={barreVisible || appelEnSuspens} title={titreSuspens}>Noter un appel sans Ringover</Bouton>
        }
      >
        {lignes.length === 0 ? (
          <Vide titre="Aucun numéro" texte="Complète le standard sur la fiche, ou ajoute un contact avec sa ligne directe." />
        ) : (
          <div className="divide-y divide-fond-4">
            {lignes.map((l) => (
              <div key={l.cle} className="flex flex-wrap items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className={"chiffres text-sous-titre font-semibold " + (l.valide ? "text-encre" : "text-alerte")}>{formaterTelephone(l.numero) || l.numero}</div>
                  <div className="text-legende text-encre-2">
                    {l.libelle} · {l.detail}
                    {!l.valide ? " · numéro incomplet" : ""}
                  </div>
                </div>
                <Bouton variante="discret" taille="icone" aria-label="Copier le numéro" title="Copier" onClick={() => copier(l.numero)}>
                  {copie === l.numero ? <Check className="text-ok" /> : <Copy />}
                </Bouton>
                <Bouton
                  variante={l.parDefaut ? "plein" : "contour"}
                  icone={<Phone />}
                  disabled={!l.valide || emissionBloquee || !libre || appelEnSuspens || autreOnglet}
                  title={emissionBloquee ? "Numéro d'émission hors réserve : voir le bandeau" : !libre ? "Note d'abord le résultat de l'appel en cours" : (titreSuspens ?? bloqueOnglet)}
                  onClick={() => void lancerAppel(l.numero, l.contactId)}
                >
                  Appeler
                </Bouton>
              </div>
            ))}
          </div>
        )}
        {appel && !appel.manuel ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-legende text-encre">
            <Pastille role={appel.etape === "en_cours" ? "fait" : appel.etape === "termine" ? "info" : appel.etape === "sans_suivi" ? "attente" : "actif"} point>
              {appel.etape === "en_cours" ? "En ligne" : appel.etape === "termine" ? "Terminé" : appel.etape === "sans_suivi" ? "Sans suivi" : "Appel lancé"}
            </Pastille>
            {dureeAffichee ? <span className="chiffres font-medium">{dureeAffichee}</span> : null}
            <span className="text-encre-2">{TEXTES_APPEL[appel.etape]}</span>
          </div>
        ) : null}
      </Section>

      {/* Numéro d'émission + jauge */}
      {emissionBloquee && attribution ? (
        <Bandeau role="alerte" className="mt-3" action={<Bouton taille="sm" onClick={reattribuerNumero}>Réattribuer un numéro</Bouton>}>
          Appel bloqué : cette agence a toujours été appelée depuis le <b className="chiffres">{formaterTelephone(attribution.numero)}</b>, qui n'est plus dans la réserve. On n'appelle jamais en douce avec un autre numéro : réactive-le dans Réglages, ou réattribue en connaissance de cause.
        </Bandeau>
      ) : (
        <div className="mt-3 rounded-4 border border-trait bg-fond-2 px-3 py-2 text-legende text-encre">
          {numeroEmission ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  Tu appelles depuis le <b className="chiffres">{formaterTelephone(numeroEmission)}</b>
                  <span className="text-encre-2" title="Ringover fait sonner le propriétaire du numéro : ouvre Ringover sur ce poste, connecté avec TON compte, avant d'appeler."> · ton Ringover doit être ouvert sur ce poste</span>
                </span>
                <span className={"chiffres " + (jauge.depasse ? "font-medium text-alerte" : "text-encre-2")}>{jauge.texte}</span>
              </div>
              {jauge.quota > 0 ? (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fond-4" role="progressbar" aria-valuemin={0} aria-valuemax={jauge.quota} aria-valuenow={jauge.utilises}>
                  <div className={"h-full rounded-full " + (jauge.depasse ? "bg-alerte" : "bg-signature")} style={{ width: `${Math.round(jauge.part * 100)}%` }} />
                </div>
              ) : null}
            </>
          ) : (
            <span className="text-encre-2">Aucun numéro d'émission réglé : Ringover choisira le sien. La réserve se règle dans Réglages › Numéros d'appel.</span>
          )}
        </div>
      )}
    </>
  )
}
