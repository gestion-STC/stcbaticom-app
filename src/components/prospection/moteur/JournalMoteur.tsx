// Le journal du moteur (17/11/2026) : à chaque passage (toutes les 10 minutes), ce que le moteur a fait pour CETTE campagne,
// et pourquoi rien n'est parti quand rien ne part (créneau fermé, plafond, boîtes, adresses refusées, erreurs).
import { useEffect, useState } from "react"
import { Bouton } from "../../../ui"
import { Bloc } from "../../demarchage/aujourdhui/courtier"
import { lireParametre } from "../../../lib/parametresDb"
import { lignesJournal, type LigneJournal } from "../../../prospection/journalMoteur"

export default function JournalMoteur({ campagneId }: { campagneId: string }) {
  const [lignes, setLignes] = useState<LigneJournal[] | null>(null)
  const [tout, setTout] = useState(false)
  const lire = () => lireParametre("campagnes_moteur_journal").then((v) => setLignes(lignesJournal(v, campagneId))).catch(() => setLignes([]))
  useEffect(() => { void lire() }, [campagneId]) // eslint-disable-line react-hooks/exhaustive-deps
  const visibles = (lignes ?? []).filter((l) => tout || l.important).slice(0, 30)
  return (
    <Bloc titre="Journal du moteur" droite={<span className="flex items-center gap-2"><label className="flex items-center gap-1.5 text-colonne text-encre-2"><input type="checkbox" className="accent-[var(--color-action)]" checked={tout} onChange={(e) => setTout(e.target.checked)} />Tous les passages</label><Bouton taille="sm" variante="discret" onClick={() => void lire()}>Relire</Bouton></span>}>
      <div className="mt-3">
        {lignes === null ? <p className="text-colonne text-encre-2">Lecture…</p> : !visibles.length ? <p className="text-colonne text-encre-2">{lignes.length ? "Rien à signaler sur les 12 dernières heures (coche « Tous les passages » pour tout voir)." : "Aucun passage noté pour l'instant : le journal se remplit à chaque passage du moteur."}</p> : (
          <div className="divide-y-[0.5px] divide-trait rounded-4 border-[0.5px] border-trait">
            {visibles.map((l) => (
              <div key={l.le} className="flex gap-3 px-3 py-1.5 text-colonne">
                <span className="chiffres w-12 shrink-0 text-encre-2">{l.heure}</span>
                <span className={l.niveau === "erreur" ? "text-alerte" : l.niveau === "attention" ? "text-attention" : "text-encre"}>{l.texte}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Bloc>
  )
}
