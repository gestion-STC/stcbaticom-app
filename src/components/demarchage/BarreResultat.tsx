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
import { useEffect, useRef, useState } from "react"
import { Briefcase, Check, Sparkles, TriangleAlert } from "lucide-react"
import type { PropositionIa } from "../../demarchage/appelsIa"
import type { Destinataire } from "../../lib/destinataire"
import MailDeSuivi from "./session/MailDeSuivi"
import { useReglages } from "../../demarchage/reglages"
import { ISSUES, MOTIFS, RESULTATS, effetAnnonce, nomContact, type Agence, type Contact, type Issue, type Motif, type Resultat } from "../../demarchage/modele"
import { TYPES_RDV, choixComplet, estChampDeSaisie, issuePourTouche, resultatPourTouche, versIso, type ChoixResultat, type TypeRdv } from "../../demarchage/sessionOutils"
import { Bouton, Etiquette, Champ, Selecteur } from "../../ui"

const NOUVEAU_CONTACT = "__nouveau__"

/** Un gros bouton de résultat ou d'issue, avec sa touche en petit. */
function GrosBouton({ touche, libelle, aide, choisi, ia = false, onClick }: { touche: string; libelle: string; aide: string; choisi: boolean; ia?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={choisi}
      title={aide}
      className={
        "relative flex min-h-[56px] flex-1 basis-[140px] flex-col items-start justify-center gap-0.5 rounded-4 border px-3 py-2 text-left transition-colors " +
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signature focus-visible:ring-offset-2 " +
        (choisi ? "border-action bg-fond-3 text-encre ring-1 ring-action" : "border-trait bg-fond text-encre hover:border-trait-fort hover:bg-fond-4")
      }
    >
      <span className="flex items-center gap-2">
        <kbd className="rounded-3 bg-fond-4 px-1.5 text-[10px] font-semibold leading-4 text-encre-2">{touche}</kbd>
        <span className="text-legende font-medium">{libelle}</span>
      </span>
      <span className="text-colonne text-encre-2">{aide}</span>
      {ia ? <span className="absolute right-2 top-2 flex items-center gap-1 text-[10px] font-medium text-encre-2" title="Proposé par l'IA"><span className="h-1.5 w-1.5 rounded-full bg-signature" />IA</span> : null}
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
  onApporteur,
  ia = null,
  destinataire = null,
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
  /** Valeurs datetime-local par défaut (demain, heure des relances), calculées par le parent. */
  defautRappel: string
  defautRdv: string
  raccourcis?: boolean
  enregistrement?: boolean
  /** Le mail de suivi part APRÈS l'enregistrement du résultat : le parent appelle `envoyerMail` s'il est là. */
  onValider: (choix: ChoixResultat, envoyerMail?: (() => Promise<string>) | null) => void
  /** L'IA après le raccroché (maquette 07/11) : « attente » pendant qu'elle écoute, puis sa proposition. */
  ia?: { etat: "attente" | "prete" | "rien"; depuis: number; proposition: PropositionIa | null } | null
  /** À qui part le mail de suivi (l'agence, ou le contact eu en ligne). */
  destinataire?: Destinataire | null
  /** « C'est un apporteur d'affaires » : on le découvre EN LIGNE (Mahdi, 28/10). L'agence sort du
   *  démarchage, l'appel est clos par la base, on passe à la suivante. Sans résultat à cocher. */
  onApporteur?: () => void
}) {
  const { reglages } = useReglages()
  const [choisi, setChoisi] = useState<Resultat | null>(null)
  const [issueChoisie, setIssue] = useState<Issue | "">("")
  const [motif, setMotif] = useState<Motif | "">("")
  const [rappel, setRappel] = useState(defautRappel)
  const [rdv, setRdv] = useState(defautRdv)
  const [rdvType, setRdvType] = useState<TypeRdv>("telephone")

  const prop = ia?.etat === "prete" ? ia.proposition : null
  const [envoyer, setEnvoyer] = useState(true)
  const envoiRef = useRef<(() => Promise<string>) | null>(null)
  // Au raccroché, la barre vient sous les yeux : le commercial n'a pas à descendre la chercher.
  const barreRef = useRef<HTMLElement>(null)
  const ecoute = ia?.etat === "attente"
  useEffect(() => { if (ecoute) barreRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }) }, [ecoute])
  // Tant que l'utilisateur n'a rien cliqué, la suggestion (Ringover) puis la proposition de l'IA tiennent lieu de choix.
  const resultat: Resultat | null = choisi ?? suggestion ?? prop?.resultat ?? null
  const joint = resultat === "joint"
  // Tant que l'issue n'est pas choisie, celle de l'IA en tient lieu (si elle propose « joint »).
  const issue: Issue | "" = issueChoisie || (joint && prop?.resultat === "joint" ? prop.issue : "")
  const desaccord = Boolean(prop && resultat && (resultat !== prop.resultat || (joint && issue && prop.issue && issue !== prop.issue)))
  const avecMail = Boolean(destinataire && (resultat === "joint" || resultat === "standard"))
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
    onValider({ resultat, issue: joint ? issue : "", motif: joint && issue === "pas_interesse" ? motif : "", contactId, rappelLe, rdvLe, rdvType }, avecMail ? envoiRef.current : null)
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
          onValider({ resultat, issue: joint ? issue : "", motif: joint && issue === "pas_interesse" ? motif : "", contactId, rappelLe, rdvLe, rdvType }, avecMail ? envoiRef.current : null)
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
      if (joint) {
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
  }, [raccourcis, resultat, choisi, joint, issue, motif, complet, enregistrement, contactId, rappelLe, rdvLe, rdvType, onValider, avecMail])

  const actifs = contacts.filter((c) => !c.parti)

  return (
    <section ref={barreRef} className="scroll-mt-4 border-y-[0.5px] border-trait py-4" aria-label="Résultat de l'appel">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        {ia?.etat === "attente" ? (
          <h2 className="flex items-center gap-2 text-sous-titre font-semibold text-encre"><span className="h-2 w-2 animate-pulse rounded-full bg-signature" />L'IA écoute l'appel…</h2>
        ) : prop ? (
          <h2 className="flex items-center gap-2 text-sous-titre font-semibold text-encre"><Sparkles size={15} className="text-signature" />L'IA propose · à toi de valider</h2>
        ) : (
          <h2 className="text-sous-titre font-semibold text-encre">Qu'est-ce qui s'est passé ?</h2>
        )}
        <span className="chiffres text-colonne text-encre-2">{ia?.etat === "attente" ? `${ia.depuis} s · tu peux noter sans attendre, l'IA vérifiera derrière` : "Touches 1 à 4 · Entrée valide · Échap efface"}</span>
      </div>
      {ia?.etat === "attente" ? <div className="mb-3 h-[3px] overflow-hidden rounded-full bg-fond-3"><div className="h-full rounded-full bg-signature/60 transition-[width] duration-500" style={{ width: `${Math.min(100, ia.depuis * 10)}%` }} /></div> : null}
      {indice ? <p className="mb-3 text-legende text-attention">{indice}</p> : null}

      <div className="flex flex-wrap gap-2">
        {RESULTATS.map((r) => (
          <GrosBouton key={r.code} touche={r.touche} libelle={r.libelle} aide={r.aide} choisi={resultat === r.code} ia={prop?.resultat === r.code} onClick={() => choisirResultat(r.code)} />
        ))}
      </div>

      {joint ? (
        <div className="mt-3 border-t border-fond-4 pt-3">
          <div className="mb-2 text-colonne font-medium text-encre-2">Et avec le gestionnaire ?</div>
          <div className="flex flex-wrap gap-2">
            {ISSUES.map((i) => (
              <GrosBouton key={i.code} touche={i.touche} libelle={i.libelle} aide={i.aide} choisi={issue === i.code} ia={prop?.resultat === "joint" && prop.issue === i.code} onClick={() => setIssue(i.code)} />
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

      {prop?.preuve ? <blockquote className="mt-3 border-l-2 border-signature/50 pl-3 text-legende text-encre">{prop.preuve} <span className="text-encre-2">· d'après l'appel</span></blockquote> : null}
      {desaccord && prop ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-4 bg-fond-3 px-3 py-2 text-legende text-encre">
          <span className="flex items-center gap-2"><TriangleAlert size={14} className="shrink-0 text-attention" />L'IA avait proposé <b className="font-medium">{RESULTATS.find((r) => r.code === prop.resultat)?.libelle}{prop.resultat === "joint" && prop.issue ? " · " + ISSUES.find((i) => i.code === prop.issue)?.libelle : ""}</b>. Ton choix et le sien sont gardés : c'est ce qui mesure sa justesse.</span>
          <Bouton taille="sm" onClick={() => { setChoisi(prop.resultat); setIssue("") }}>L'IA a raison</Bouton>
        </div>
      ) : null}
      {ia?.etat === "rien" ? <p className="mt-3 text-colonne text-encre-2">L'IA n'a pas pu écouter cet appel : note-le toi-même.</p> : null}

      <p className="mt-3 text-legende text-encre-2">{resultat && reglages ? effetAnnonce(resultat, joint ? (issue || null) : null, agence, { sommeilApres: reglages.sommeil_apres_tentatives, sommeilJours: reglages.sommeil_jours, relanceJours: reglages.relance_interesse_jours }) : "Choisis ce qui s'est passé : l'étape et les tâches suivent toutes seules."}</p>

      {avecMail && destinataire ? <MailDeSuivi destinataire={destinataire} brouillon={prop?.mailCorps ? { objet: prop.mailObjet, corps: prop.mailCorps } : null} envoyer={envoyer} setEnvoyer={setEnvoyer} envoiRef={envoiRef} /> : null}

      <div className="sticky bottom-0 z-10 mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-fond-4 bg-fond pb-1 pt-3">
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
        <div className="flex flex-wrap items-center gap-2">
          {onApporteur ? (
            <Bouton variante="discret" icone={<Briefcase />} disabled={enregistrement} title="Cette agence est un apporteur d'affaires : elle sort du démarchage, l'appel est clos, on passe à la suivante" onClick={onApporteur}>
              Apporteur d'affaires
            </Bouton>
          ) : null}
          <Bouton variante="plein" icone={<Check />} disabled={!complet} chargement={enregistrement} onClick={valider}>
            {avecMail && envoyer ? "Valider et envoyer le mail" : "Valider"}
          </Bouton>
        </div>
      </div>
    </section>
  )
}
