// ════════════════════════════════════════════════════════════════════════════
// Le dialogue d'un modèle d'e-mail : nom, objet, corps, variables à insérer
// au curseur, pièces jointes (stockage Supabase) et aperçu avec la signature.
// Même logique qu'avant, habillage dans la trousse STC (09/10/2026).
// ════════════════════════════════════════════════════════════════════════════
import { useRef, useState } from "react"
import { FileText, Paperclip, Save, Trash2 } from "lucide-react"
import { variables, apercu, type Email } from "../emails"
import { televerser, supprimerFichier, formatTaille } from "../lib/stockage"
import { Bandeau, Bouton, Champ, Dialogue, Etiquette, Pastille, Zone } from "../ui"

export default function EmailModal({
  email,
  ordreParDefaut,
  signature,
  onClose,
  onSave,
}: {
  email: Email | null // null = création
  ordreParDefaut: number
  signature?: string
  onClose: () => void
  onSave: (e: Email) => void
}) {
  const [f, setF] = useState<Email>(email ?? { nom: "", objet: "", corps: "", ordre: ordreParDefaut, pieces: [] })
  // La zone de texte du corps est un composant de la trousse : on retrouve le
  // <textarea> par son enveloppe pour insérer une variable au curseur.
  const corpsRef = useRef<HTMLDivElement>(null)
  const pjRef = useRef<HTMLInputElement>(null)
  const [upload, setUpload] = useState(false)
  const [erreurPj, setErreurPj] = useState<string | null>(null)
  const set = (champ: keyof Email, v: string) => setF((p) => ({ ...p, [champ]: v }))

  async function ajouterPiece(file: File) {
    setErreurPj(null)
    setUpload(true)
    try {
      const pj = await televerser(file)
      setF((p) => ({ ...p, pieces: [...p.pieces, pj] }))
    } catch (e) {
      setErreurPj("Envoi du fichier impossible. Le stockage est-il configuré ? Détail : " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setUpload(false)
    }
  }

  function retirerPiece(i: number) {
    const pj = f.pieces[i]
    setF((p) => ({ ...p, pieces: p.pieces.filter((_, k) => k !== i) }))
    if (pj?.chemin) supprimerFichier(pj.chemin).catch(() => {})
  }

  // Insère une variable à la position du curseur dans le corps.
  function inserer(cle: string) {
    const ta = corpsRef.current?.querySelector("textarea") ?? null
    if (!ta) {
      set("corps", f.corps + cle)
      return
    }
    const debut = ta.selectionStart
    const fin = ta.selectionEnd
    set("corps", f.corps.slice(0, debut) + cle + f.corps.slice(fin))
    requestAnimationFrame(() => {
      ta.focus()
      ta.selectionStart = ta.selectionEnd = debut + cle.length
    })
  }

  return (
    <Dialogue
      titre={email ? "Modifier le modèle" : "Nouveau modèle"}
      description="Les variables sont remplacées par les informations de l'agence à l'envoi ; la signature STC Bâtiment est ajoutée à la fin."
      onFermer={onClose}
      largeur="max-w-4xl"
      pied={
        <>
          <Bouton onClick={onClose}>Annuler</Bouton>
          <Bouton variante="plein" icone={<Save />} disabled={!f.nom.trim()} onClick={() => onSave(f)}>Enregistrer</Bouton>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Édition */}
        <div className="space-y-4">
          <Etiquette texte="Nom du modèle">
            <Champ value={f.nom} onChange={(e) => set("nom", e.target.value)} placeholder="ex. Annonce d'appel" autoFocus />
          </Etiquette>
          <Etiquette texte="Objet">
            <Champ value={f.objet} onChange={(e) => set("objet", e.target.value)} />
          </Etiquette>
          <div ref={corpsRef}>
            <Etiquette texte="Corps du message">
              <Zone value={f.corps} onChange={(e) => set("corps", e.target.value)} rows={10} className="resize-y" />
            </Etiquette>
          </div>

          <div>
            <p className="mb-1.5 text-legende font-medium text-encre">Insérer une variable</p>
            <div className="flex flex-wrap gap-1.5">
              {variables.map((v) => (
                <button key={v.cle} type="button" onClick={() => inserer(v.cle)} title={v.cle} className="rounded-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signature">
                  <Pastille role="info" className="cursor-pointer hover:border-signature/50">{v.label}</Pastille>
                </button>
              ))}
            </div>
          </div>

          {/* Pièces jointes */}
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-legende font-medium text-encre">Pièces jointes</p>
              <Bouton taille="sm" icone={<Paperclip />} chargement={upload} onClick={() => pjRef.current?.click()}>
                {upload ? "Envoi…" : "Ajouter un document"}
              </Bouton>
              <input
                ref={pjRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ""
                  if (file) void ajouterPiece(file)
                }}
              />
            </div>
            {erreurPj ? <Bandeau role="alerte" className="mb-2">{erreurPj}</Bandeau> : null}
            {f.pieces.length === 0 ? (
              <p className="text-colonne text-encre-3">Aucune pièce jointe.</p>
            ) : (
              <ul className="divide-y divide-fond-4 rounded-4 border border-trait">
                {f.pieces.map((pj, i) => (
                  <li key={pj.chemin || i} className="flex items-center gap-2 px-2.5 py-1.5">
                    <FileText size={14} className="shrink-0 text-encre-2" />
                    <a href={pj.url} target="_blank" rel="noreferrer" title={pj.nom} className="min-w-0 flex-1 truncate text-legende text-encre hover:underline">
                      {pj.nom}
                    </a>
                    <span className="chiffres shrink-0 text-colonne text-encre-2">{formatTaille(pj.taille)}</span>
                    <Bouton taille="icone" variante="discret" className="h-7 w-7 text-encre-2 hover:text-alerte" aria-label={`Retirer ${pj.nom}`} onClick={() => retirerPiece(i)}><Trash2 /></Bouton>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Aperçu */}
        <div>
          <p className="mb-1 text-legende font-medium text-encre">Aperçu</p>
          <div className="rounded-4 border border-trait bg-fond-2 p-4">
            <p className={"border-b border-trait pb-2 text-corps font-medium " + (f.objet ? "text-encre" : "text-encre-3")}>{apercu(f.objet) || "(objet)"}</p>
            <p className={"mt-2 whitespace-pre-wrap text-corps " + (f.corps ? "text-encre" : "text-encre-3")}>{apercu(f.corps) || "(corps du message)"}</p>
            {signature ? <div className="signature-edit text-corps" dangerouslySetInnerHTML={{ __html: apercu(signature) }} /> : null}
          </div>
        </div>
      </div>
    </Dialogue>
  )
}
