// La fenêtre « Nouvelle tâche / Nouveau rendez-vous / Nouvelle note » de la session.
import { Check } from "lucide-react"
import { TYPES_RDV, type TypeRdv } from "../../../demarchage/sessionOutils"
import { Bouton, Champ, Dialogue, Etiquette, Selecteur, Zone } from "../../../ui"
import type { FormAction } from "./outils"

export default function DialogueAction({
  dialogue,
  nomAgence,
  formAction,
  setFormAction,
  onFermer,
  onValider,
}: {
  dialogue: "tache" | "rdv" | "note"
  nomAgence: string | undefined
  formAction: FormAction
  setFormAction: (f: FormAction) => void
  onFermer: () => void
  onValider: () => void
}) {
  return (
    <Dialogue
      titre={dialogue === "tache" ? "Nouvelle tâche" : dialogue === "rdv" ? "Nouveau rendez-vous" : "Nouvelle note"}
      description={nomAgence}
      onFermer={onFermer}
      pied={
        <>
          <Bouton variante="discret" onClick={onFermer}>Annuler</Bouton>
          <Bouton variante="plein" icone={<Check />} onClick={onValider} disabled={dialogue === "note" ? !formAction.note.trim() : !formAction.quand}>
            Enregistrer
          </Bouton>
        </>
      }
    >
      <div className="space-y-3">
        {dialogue !== "note" ? (
          <>
            <Etiquette texte="Titre"><Champ value={formAction.titre} onChange={(e) => setFormAction({ ...formAction, titre: e.target.value })} autoFocus /></Etiquette>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Etiquette texte={dialogue === "rdv" ? "Le" : "Pour le"}>
                <Champ type="datetime-local" value={formAction.quand} onChange={(e) => setFormAction({ ...formAction, quand: e.target.value })} />
              </Etiquette>
              {dialogue === "rdv" ? (
                <Etiquette texte="Type">
                  <Selecteur value={formAction.type} onChange={(e) => setFormAction({ ...formAction, type: e.target.value as TypeRdv })}>
                    {TYPES_RDV.map((t) => (
                      <option key={t.code} value={t.code}>{t.libelle}</option>
                    ))}
                  </Selecteur>
                </Etiquette>
              ) : null}
            </div>
          </>
        ) : null}
        <Etiquette texte={dialogue === "note" ? "Note" : "Précisions"}>
          <Zone value={formAction.note} onChange={(e) => setFormAction({ ...formAction, note: e.target.value })} rows={4} autoFocus={dialogue === "note"} />
        </Etiquette>
      </div>
    </Dialogue>
  )
}
