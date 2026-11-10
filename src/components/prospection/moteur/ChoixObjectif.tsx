// Créer une campagne : d'abord l'objectif, dans une fenêtre, comme chez Meta (Mahdi, 10/11/2026). La liste à gauche,
// l'explication à droite ; le reste de la campagne se règle ensuite et tout reste modifiable.
import { useState } from "react"
import { Bouton, Dialogue } from "../../../ui"
import type { ModeleCampagne } from "./modelesCampagne"
import { estBaseAvis } from "../../../prospection/avis"

const ZERO = "zero"
const DETAILS: Record<string, { pour: string; prepare: string[] }> = {
  "ag-vol": { pour: "Toucher beaucoup de gestionnaires et repérer celles qui montrent de l'intérêt.", prepare: ["Un mail, puis un appel 3 jours après", "Un clic suffit pour créer le lead", "Idéal sur un grand fichier"] },
  "ag-qual": { pour: "Obtenir moins de contacts, mais déjà renseignés.", prepare: ["Un mail vers un formulaire", "Le lead naît quand la fiche est remplie", "Idéal sur un fichier ciblé"] },
  "st-vol": { pour: "Constituer un stock de sous-traitants intéressés à appeler.", prepare: ["Un mail, puis un appel 3 jours après", "Le clic les met en session de call", "Le lead naît au dossier déposé"] },
  "st-qual": { pour: "Ne garder que ceux qui déposent leur dossier.", prepare: ["Un mail vers le dépôt de dossier", "Le lead naît au dossier déposé", "Aucun appel prévu"] },
  "av-loc": { pour: "Récolter l'avis des locataires après une intervention.", prepare: ["Un mail, une relance à 7 jours", "Une page d'avis", "Aucun lead, aucun appel"] },
  "av-cli": { pour: "Récolter l'avis de vos agences clientes.", prepare: ["Un mail, une relance à 7 jours", "Une page d'avis", "Aucun lead, aucun appel"] },
  "av-st": { pour: "Récolter l'avis des sous-traitants qui travaillent avec vous.", prepare: ["Un mail, une relance à 7 jours", "Une page d'avis", "Aucun lead, aucun appel"] },
}

export default function ChoixObjectif({ modeles, onChoisir, onAnnuler }: { modeles: ModeleCampagne[]; onChoisir: (m: ModeleCampagne | null) => void; onAnnuler: () => void }) {
  const [id, setId] = useState(modeles[0]?.id ?? ZERO)
  const m = modeles.find((x) => x.id === id) ?? null
  const groupes = [{ titre: "Trouver des leads", liste: modeles.filter((x) => !estBaseAvis(x.baseId)) }, { titre: "Récolter des avis", liste: modeles.filter((x) => estBaseAvis(x.baseId)) }].filter((g) => g.liste.length)
  const option = (cle: string, titre: string) => <label key={cle} className={`flex cursor-pointer items-center gap-2.5 rounded-4 px-2.5 py-2 text-legende ${id === cle ? "bg-fond-4 font-medium text-encre" : "text-encre hover:bg-fond-2"}`}><input type="radio" name="objectif" className="accent-[var(--color-action)]" checked={id === cle} onChange={() => setId(cle)} />{titre}</label>
  const detail = m ? DETAILS[m.id] : null
  return (
    <Dialogue titre="Créer une campagne" description="Choisis ce que tu veux obtenir. Tout reste modifiable ensuite." largeur="max-w-3xl" onFermer={onAnnuler} pied={<><Bouton onClick={onAnnuler}>Annuler</Bouton><Bouton variante="plein" onClick={() => onChoisir(m)}>Continuer</Bouton></>}>
      <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          {groupes.map((g) => <div key={g.titre}><p className="px-2.5 pb-1 text-colonne text-encre-2">{g.titre}</p>{g.liste.map((x) => option(x.id, x.titre))}</div>)}
          <div><p className="px-2.5 pb-1 text-colonne text-encre-2">Autre</p>{option(ZERO, "Partir de zéro")}</div>
        </div>
        <div className="rounded-6 bg-fond-2 p-5">
          <h3 className="text-sous-titre font-semibold text-encre">{m?.titre ?? "Partir de zéro"}</h3>
          <p className="mt-1.5 text-legende text-encre-2">{detail?.pour ?? "Une campagne vide : tu choisis la base, la séquence et les règles toi-même."}</p>
          {detail ? <><p className="mt-4 text-colonne text-encre-2">Déjà préparé</p><ul className="mt-1.5 space-y-1 text-legende text-encre">{detail.prepare.map((p) => <li key={p}>{p}</li>)}</ul></> : null}
        </div>
      </div>
    </Dialogue>
  )
}
