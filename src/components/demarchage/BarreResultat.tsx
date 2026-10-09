// ════════════════════════════════════════════════════════════════════════════
// LA BARRE DE RÉSULTAT — une question, quatre boutons (Mahdi, 09/10/2026).
//
// Ligne 1 : Pas de réponse · Standard, pas de gestionnaire · Gestionnaire
// joint · Faux numéro / fermé. Si « joint », ligne 2 : Intéressé · RDV ·
// À rappeler le… · Pas intéressé (motif). Les touches 1 à 4 choisissent, Entrée
// valide, Échap efface. L'étape, les tentatives et les tâches sont posées par
// la base (`appel_enregistrer`) : ici on ne fait que décrire ce qui s'est passé.
// Ce composant ne touche pas la base : il rend un `ChoixResultat` à l'écran.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react"
import { Check } from "lucide-react"
import { ISSUES, MOTIFS, RESULTATS, effetAnnonce, nomContact, type Agence, type Contact, type Issue, type Motif, type Resultat } from "../../demarchage/modele"
import { TYPES_RDV, choixComplet, estChampDeSaisie, issuePourTouche, resultatPourTouche, versIso, type ChoixResultat, type TypeRdv } from "../../demarchage/sessionOutils"
import { Bouton, Carte, Etiquette, Champ, Selecteur } from "../../ui"

const NOUVEAU_CONTACT = "__nouveau__"

/** Un gros bouton de résultat ou d'issue, avec sa touche en petit. */
function GrosBouton({ touche, libelle, aide, choisi, onClick }: { touche: string; libelle: string; aide: string; choisi: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={choisi}
      title={aide}
      className={
        "flex min-h-[56px] flex-1 basis-[140px] flex-col items-start justify-center gap-0.5 rounded-4 border px-3 py-2 text-left transition-colors " +
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signature focus-visible:ring-offset-2 " +
        (choisi ? "border-action bg-fond-3 text-encre ring-1 ring-action" : "border-trait bg-fond text-encre hover:border-trait-fort hover:bg-fond-4")
      }
    >
      <span className="flex items-center gap-2">
        <kbd className="rounded-3 bg-fond-4 px-1.5 text-[10px] font-semibold leading-4 text-encre-2">{touche}</kbd>
        <span className="text-legende font-medium">{libelle}</span>
      </span>
      <span className="text-colonne text-encre-2">{aide}</span>
    </button>
  )
}

export default function BarreResultat({
  agence,
  contacts,
  contactId,
  onContactChange,
  onNouveauContact,
  suggestion = null,
  indice = "",
  defautRappel,
  defautRdv,
  raccourcis = true,
  enregistrement = false,
  onValider,
}: {
  agence: Pick<Agence, "etape" | "tentatives">
  contacts: Contact[]
  /** Le contact concerné (celui du numéro appelé), modifiable ici. null = le standard. */
  contactId: string | null
  onContactChange: (id: string | null) => void
  /** « + contact » dans le sélecteur : le parent ouvre son formulaire. */
  onNouveauContact?: () => void
  /** Pré-sélection proposée par la surveillance de l'appel (pas de réponse, faux numéro). */
  suggestion?: Resultat | null
  /** Une phrase d'explication de la suggestion (« Ringover dit : répondeur. »). */
  indice?: string
  /** Valeurs datetime-local par défaut (demain 10 h), calculées par le parent. */
  defautRappel: string
  defautRdv: string
  raccourcis?: boolean
  enregistrement?: boolean
  onValider: (choix: ChoixResultat) => void
}) {
  const [choisi, setChoisi] = useState<Resultat | null>(null)
  const [issue, setIssue] = useState<Issue | "">("")
  const [motif, setMotif] = useState<Motif | "">("")
  const [rappel, setRappel] = useState(defautRappel)
  const [rdv, setRdv] = useState(defautRdv)
  const [rdvType, setRdvType] = useState<TypeRdv>("telephone")

  // Tant que l'utilisateur n'a rien cliqué, la suggestion tient lieu de choix.
  const resultat: Resultat | null = choisi ?? suggestion
  const joint = resultat === "joint"
  const rappelLe = issue === "a_rappeler" ? versIso(rappel) : null
  const rdvLe = issue === "rdv" ? versIso(rdv) : null
  const complet = choixComplet({ resultat, issue, motif, rappelLe, rdvLe })

  function choisirResultat(r: Resultat) {
    setChoisi(r)
    if (r !== "joint") {
      setIssue("")
      setMotif("")
    }
  }
  function valider() {
    if (!resultat || !complet || enregistrement) return
    onValider({ resultat, issue: joint ? issue : "", motif: joint && issue === "pas_interesse" ? motif : "", contactId, rappelLe, rdvLe, rdvType })
  }

  // Raccourcis : 1-4 choisissent (le résultat, puis l'issue si joint), Entrée valide, Échap efface.
  useEffect(() => {
    if (!raccourcis) return
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null
      if (estChampDeSaisie(el?.tagName, Boolean(el?.isContentEditable))) return
      if (e.key === "Enter") {
        if (resultat && complet && !enregistrement) {
          e.preventDefault()
          onValider({ resultat, issue: joint ? issue : "", motif: joint && issue === "pas_interesse" ? motif : "", contactId, rappelLe, rdvLe, rdvType })
        }
        return
      }
      if (e.key === "Escape") {
        setChoisi(null)
        setIssue("")
        setMotif("")
        return
      }
      if (!/^[1-4]$/.test(e.key)) return
      e.preventDefault()
      if (joint && choisi === "joint") {
        const i = issuePourTouche(e.key)
        if (i) setIssue(i)
        return
      }
      const r = resultatPourTouche(e.key)
      if (r) {
        setChoisi(r)
        if (r !== "joint") {
          setIssue("")
          setMotif("")
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [raccourcis, resultat, choisi, joint, issue, motif, complet, enregistrement, contactId, rappelLe, rdvLe, rdvType, onValider])

  const actifs = contacts.filter((c) => !c.parti)

  return (
    <Carte className="px-5 py-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sous-titre font-semibold text-encre">Qu'est-ce qui s'est passé ?</h2>
        <span className="text-colonne text-encre-2">Touches 1 à 4 · Entrée valide · Échap efface</span>
      </div>
      {indice ? <p className="mb-3 text-legende text-attention">{indice}</p> : null}

      <div className="flex flex-wrap gap-2">
        {RESULTATS.map((r) => (
          <GrosBouton key={r.code} touche={r.touche} libelle={r.libelle} aide={r.aide} choisi={resultat === r.code} onClick={() => choisirResultat(r.code)} />
        ))}
      </div>

      {joint ? (
        <div className="mt-3 border-t border-fond-4 pt-3">
          <div className="mb-2 text-colonne font-semibold uppercase tracking-[0.07em] text-encre-2">Et avec le gestionnaire ?</div>
          <div className="flex flex-wrap gap-2">
            {ISSUES.map((i) => (
              <GrosBouton key={i.code} touche={i.touche} libelle={i.libelle} aide={i.aide} choisi={issue === i.code} onClick={() => setIssue(i.code)} />
            ))}
          </div>
          {issue === "a_rappeler" ? (
            <div className="mt-3 max-w-xs">
              <Etiquette texte="Rappeler le">
                <Champ type="datetime-local" value={rappel} onChange={(e) => setRappel(e.target.value)} />
              </Etiquette>
            </div>
          ) : null}
          {issue === "rdv" ? (
            <div className="mt-3 grid max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
              <Etiquette texte="Rendez-vous le">
                <Champ type="datetime-local" value={rdv} onChange={(e) => setRdv(e.target.value)} />
              </Etiquette>
              <Etiquette texte="Type">
                <Selecteur value={rdvType} onChange={(e) => setRdvType(e.target.value as TypeRdv)}>
                  {TYPES_RDV.map((t) => (
                    <option key={t.code} value={t.code}>{t.libelle}</option>
                  ))}
                </Selecteur>
              </Etiquette>
            </div>
          ) : null}
          {issue === "pas_interesse" ? (
            <div className="mt-3 max-w-xs">
              <Etiquette texte="Motif">
                <Selecteur value={motif} onChange={(e) => setMotif(e.target.value as Motif | "")}>
                  <option value="">Choisir un motif…</option>
                  {MOTIFS.map((m) => (
                    <option key={m.code} value={m.code}>{m.libelle}</option>
                  ))}
                </Selecteur>
              </Etiquette>
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="mt-3 text-legende text-encre-2">{resultat ? effetAnnonce(resultat, joint ? (issue || null) : null, agence) : "Choisis ce qui s'est passé : l'étape et les tâches suivent toutes seules."}</p>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-fond-4 pt-3">
        <div className="w-full max-w-xs">
          <Etiquette texte="Qui as-tu eu en ligne ?">
            <Selecteur
              value={contactId ?? ""}
              onChange={(e) => {
                if (e.target.value === NOUVEAU_CONTACT) onNouveauContact?.()
                else onContactChange(e.target.value || null)
              }}
            >
              <option value="">Le standard, personne en particulier</option>
              {actifs.map((c) => (
                <option key={c.id} value={c.id}>{nomContact(c)}{c.principal ? " · principal" : ""}</option>
              ))}
              {onNouveauContact ? <option value={NOUVEAU_CONTACT}>+ Nouveau contact…</option> : null}
            </Selecteur>
          </Etiquette>
        </div>
        <Bouton variante="plein" icone={<Check />} disabled={!complet} chargement={enregistrement} onClick={valider}>
          Valider
        </Bouton>
      </div>
    </Carte>
  )
}
