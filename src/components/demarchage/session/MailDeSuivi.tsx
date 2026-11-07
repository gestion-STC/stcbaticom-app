// ── Le mail de suivi, DANS la barre de résultat (maquette 07/11/2026) ──
// Mahdi : « au bon endroit, au bon moment ». Le mail se prépare pendant qu'on note le résultat et part
// en validant. On part du mail de l'IA (écrit d'après l'appel) ou d'un de nos modèles enregistrés.
// Les 4 documents de base (Kbis, assurance, les deux plaquettes du 14/10) sont joints d'office, les autres
// s'ajoutent à la main ; le
// lien suivi « Créer un compte » est toujours là : c'est lui qui trace le gestionnaire et crée le lead.
import { useEffect, useMemo, useState, type MutableRefObject } from "react"
import { FileText, Link2, Mail, Pencil, Sparkles, X } from "lucide-react"
import type { Email, PieceJointe } from "../../../emails"
import type { Destinataire } from "../../../lib/destinataire"
import { chargerEmails } from "../../../lib/emailsDb"
import { composer, envoyerEmail } from "../../../lib/envoiEmail"
import { apercuLiens } from "../../../lib/liensSuivisDb"
import { bibliothequeDocuments, documentsDeBase, estJoint } from "../../../lib/documentsBibliotheque"
import { decouperAdresses } from "../../../lib/adressesEmail"
import { useSession } from "../../../lib/auth"
import { useSignataires } from "../../../lib/useSignataires"
import { prenomDe, signatureStc } from "../../../lib/signatureStc"
import { Selecteur, Zone } from "../../../ui"

const IA = "__ia__"
const LIEN = "{{lien_creer_compte}}"
const PHRASE_LIEN = `Vous pouvez ouvrir dès maintenant votre espace de suivi STC Bâtiment, en deux minutes : ${LIEN}`

export default function MailDeSuivi({ destinataire, brouillon, envoyer, setEnvoyer, envoiRef }: {
  destinataire: Destinataire
  /** Le mail écrit par l'IA d'après l'appel ; null tant qu'elle n'a pas fini (ou rien d'utile). */
  brouillon: { objet: string; corps: string } | null
  envoyer: boolean
  setEnvoyer: (v: boolean) => void
  /** Rempli ici : le parent l'appelle une fois le résultat enregistré. */
  envoiRef: MutableRefObject<(() => Promise<string>) | null>
}) {
  const session = useSession()
  const { nom: nomSignataire } = useSignataires(session)
  const signature = useMemo(() => signatureStc({ nom: nomSignataire }), [nomSignataire])
  const prenom = prenomDe(nomSignataire)
  const [modeles, setModeles] = useState<Email[]>([])
  const [choix, setChoix] = useState<string | null>(null)                 // null : le mail de l'IA s'il est là, sinon le 1er modèle
  const [texte, setTexte] = useState<{ objet: string; corps: string } | null>(null) // le texte retouché à la main
  const [edition, setEdition] = useState(false)
  const [retires, setRetires] = useState<string[]>([])

  useEffect(() => { chargerEmails().then(setModeles).catch(() => {}) }, [])
  const [ajoutes, setAjoutes] = useState<PieceJointe[]>([])
  const base = useMemo(() => documentsDeBase(modeles), [modeles])
  const documents = useMemo(() => [...base, ...ajoutes], [base, ajoutes])
  const autres = useMemo(() => bibliothequeDocuments(modeles).filter((d) => !estJoint(d, documents)), [modeles, documents])
  const pieces: PieceJointe[] = documents.filter((d) => !retires.includes(d.chemin))

  // Le point de départ : le mail de l'IA dès qu'il arrive, sinon le 1er modèle.
  const source = choix ?? (brouillon ? IA : modeles[0]?.id ?? "")
  const depart = source === IA ? brouillon : modeles.find((x) => x.id === source) ?? null
  const objet = texte?.objet ?? depart?.objet ?? ""
  const corps = texte?.corps ?? depart?.corps ?? ""
  function partirDe(id: string) { setChoix(id); setTexte(null); setEdition(false) }

  // Le lien « Créer un compte » : ajouté d'office s'il n'est pas déjà dans le texte.
  const corpsFinal = corps.includes(LIEN) ? corps : `${corps.trimEnd()}\n\n${PHRASE_LIEN}`
  const aEnvoyer = useMemo<Email>(() => ({ nom: source === IA ? "Mail de l'IA après l'appel" : modeles.find((m) => m.id === source)?.nom ?? "", objet, corps: corpsFinal, ordre: 0, pieces }), [source, modeles, objet, corpsFinal, pieces])
  const apercu = useMemo(() => { const c = composer(aEnvoyer, destinataire, signature, prenom); return { ...c, corpsHtml: apercuLiens(c.corpsHtml) } }, [aEnvoyer, destinataire, signature, prenom])

  const adresses = decouperAdresses(destinataire.email || "")
  const pret = envoyer && adresses.length > 0 && objet.trim() !== ""
  useEffect(() => {
    envoiRef.current = pret ? async () => { await envoyerEmail(destinataire, aEnvoyer, signature, prenom, adresses, { cc: [], cci: [] }); return adresses[0] } : null
  })

  return (
    <div className="mt-4 border-t border-fond-4 pt-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-legende font-medium text-encre"><Mail size={14} />Le mail de suivi</span>
        <label className="flex cursor-pointer items-center gap-2 text-legende text-encre">
          <input type="checkbox" checked={envoyer} onChange={(e) => setEnvoyer(e.target.checked)} className="accent-[var(--color-action)]" />L'envoyer en validant
        </label>
      </div>
      {envoyer ? (
        <div className="space-y-3">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <button type="button" disabled={!brouillon} onClick={() => partirDe(IA)} className={`flex h-[30px] items-center gap-1.5 rounded-full px-3 text-[12px] font-medium disabled:opacity-50 ${source === IA ? "bg-action text-white" : "border-[0.5px] border-trait-fort bg-fond text-encre hover:bg-fond-2"}`}>
                <Sparkles size={13} />{brouillon ? "Mail de l'IA, d'après l'appel" : "Mail de l'IA : en cours…"}
              </button>
              <div className="min-w-0 flex-1 basis-[220px]">
                <Selecteur value={source === IA ? "" : source} onChange={(e) => e.target.value && partirDe(e.target.value)}>
                  <option value="">Partir d'un de nos modèles…</option>
                  {modeles.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
                </Selecteur>
              </div>
            </div>
            <div className="rounded-4 border-[0.5px] border-trait px-4 py-3">
              <p className="text-colonne text-encre-2">À : <span className="text-encre">{destinataire.contact ? `${destinataire.contact} ` : ""}&lt;{destinataire.email || "adresse inconnue"}&gt;</span></p>
              <p className="mt-0.5 text-colonne text-encre-2">Objet : <span className="text-encre">{apercu.objet}</span></p>
              {edition
                ? <Zone value={corps} onChange={(e) => setTexte({ objet, corps: e.target.value })} rows={10} className="mt-3 resize-y" />
                : <div className="signature-edit mt-3 max-h-[260px] overflow-y-auto text-legende [&_div]:!text-[13px] [&_div]:!leading-[1.55]" dangerouslySetInnerHTML={{ __html: apercu.corpsHtml }} />}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-fond-4 pt-2">
                <button type="button" onClick={() => setEdition((v) => !v)} className="flex items-center gap-1 text-colonne text-encre-2 hover:text-encre"><Pencil size={11} />{edition ? "Voir le mail tel qu'il part" : "Modifier le texte"}</button>
                <span className="flex items-center gap-1.5 text-colonne text-encre-2"><Link2 size={12} />Lien suivi « Créer un compte » {corps.includes(LIEN) ? "déjà dans le modèle" : "ajouté d'office"}</span>
              </div>
            </div>
          </div>
          <div>
            <div className="text-colonne font-medium text-encre-2">Pièces jointes · documents de base</div>
            <ul className="mt-2 space-y-1">
              {documents.map((d) => {
                const joint = !retires.includes(d.chemin)
                return (
                  <li key={d.chemin} className={`flex h-8 items-center gap-2 rounded-3 px-2 text-colonne ${joint ? "bg-fond-3 text-encre" : "border-[0.5px] border-dashed border-trait text-encre-2 line-through"}`}>
                    <FileText size={13} className="shrink-0 text-encre-2" /><span className="truncate">{d.nom}</span>
                    <button type="button" title={joint ? "Retirer de cet envoi" : "Remettre"} onClick={() => setRetires((r) => (joint ? [...r, d.chemin] : r.filter((x) => x !== d.chemin)))} className="ml-auto shrink-0 text-encre-3 hover:text-encre"><X size={12} /></button>
                  </li>
                )
              })}
            </ul>
            {autres.length ? (
              <div className="mt-2 w-[300px] max-w-full">
                <Selecteur value="" onChange={(e) => { const d = autres.find((x) => x.chemin === e.target.value); if (d) setAjoutes((l) => [...l, d]) }} aria-label="Ajouter un document">
                  <option value="">Ajouter un document…</option>
                  {autres.map((d) => <option key={d.chemin} value={d.chemin}>{d.nom}</option>)}
                </Selecteur>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
