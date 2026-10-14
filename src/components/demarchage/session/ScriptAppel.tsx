// Script d'appel, repliable. L'état vient de `useScriptAppel` (lu et enregistré là).
import { ChevronDown, ChevronUp } from "lucide-react"
import { Bouton, Carte, Zone } from "../../../ui"
import type { ScriptAppelEtat } from "./useScriptAppel"

export default function ScriptAppel({ script, scriptOuvert, setScriptOuvert, scriptEdit, setScriptEdit, scriptBrouillon, setScriptBrouillon, basculerScriptEdit }: ScriptAppelEtat) {
  return (
    <Carte>
      <button type="button" onClick={() => setScriptOuvert((v) => !v)} aria-expanded={scriptOuvert} className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left">
        <span className="text-sous-titre font-semibold text-encre">Script d'appel</span>
        <span className="flex items-center gap-2 text-legende text-encre-2">
          {!scriptOuvert && script.trim() ? <span className="max-w-[40ch] truncate">{script.trim().split("\n")[0]}</span> : null}
          {scriptOuvert ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>
      {scriptOuvert ? (
        <div className="border-t border-fond-4 px-5 py-4">
          {scriptEdit ? (
            <Zone value={scriptBrouillon} onChange={(e) => setScriptBrouillon(e.target.value)} rows={8} placeholder="Ton accroche, tes arguments, les objections types…" />
          ) : script.trim() ? (
            <p className="whitespace-pre-line text-corps text-encre">{script}</p>
          ) : (
            <p className="text-legende text-encre-2">Aucun script. Écris ton accroche et tes arguments : ils resteront affichés pendant les appels.</p>
          )}
          <div className="mt-3 flex justify-end gap-2">
            {scriptEdit ? <Bouton taille="sm" variante="discret" onClick={() => setScriptEdit(false)}>Annuler</Bouton> : null}
            <Bouton taille="sm" onClick={basculerScriptEdit}>{scriptEdit ? "Enregistrer" : "Modifier"}</Bouton>
          </div>
        </div>
      ) : null}
    </Carte>
  )
}
