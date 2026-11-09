// La fiche d'un dossier déposé, en panneau. Sortie de l'ancienne page « Dossiers déposés » le 09/11/2026 :
// elle s'ouvre désormais depuis « Leads reçus », avec son état, ses pièces, ses réponses et les contrats.
import { useMemo, useState, type ReactNode } from "react"
import { useQualification } from "../../lib/qualificationStDb"
import { ExternalLink, FileSignature, KeyRound, Link2, Paperclip, Unlink, UserPlus } from "lucide-react"
import type { DossierST, SousTraitant } from "../../recrutement"
import { libelleStatutST, rolePastilleStatut } from "../../recrutement"
import { creerFicheHorsBase, lienPieceDossier, marquerDossier, rattacherDossier } from "../../lib/machineDb"
import { statutDossier } from "../../lib/dossierStatut"
import { chiffresTel } from "../../lib/telephone"
import EnvoyerContratsDialogue from "./EnvoyerContratsDialogue"
import { LIBELLE_CONTRAT, ROLE_CONTRAT, envoyerLienAcces } from "../../lib/contratsDb"
import { Bandeau, Bouton, Carte, Champ, Dialogue, Etiquette, Ligne, Panneau, Pastille } from "../../ui"

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))
const dateHeure = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
const normaliser = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()
const nomDePiece = (p: { nom?: string; path: string }) => p.nom || p.path.split("/").pop() || p.path

/**
 * Une réponse du questionnaire, lisible : courte = sur une ligne (libellé à gauche, valeur à droite) ;
 * longue, ou question longue (volet « savoir-être ») = la question au-dessus, la réponse en dessous,
 * pleine largeur, retours à la ligne respectés. Mahdi, 11/10 : « qu'on puisse lire clairement ».
 */
function Reponse({ label, valeur }: { label: string; valeur: string }) {
  const v = (valeur || "").trim()
  const longue = label.length > 48 || v.length > 70 || v.includes("\n")
  if (!longue) return <Ligne libelle={label}>{v || "—"}</Ligne>
  return (
    <div className="py-2.5">
      <div className="text-colonne font-medium text-encre-2">{label}</div>
      <div className={"mt-1 whitespace-pre-wrap text-legende leading-relaxed " + (v ? "text-encre" : "text-encre-3")}>{v || "—"}</div>
    </div>
  )
}

/**
 * Les 8 fiches les plus proches d'une recherche (entreprise, e-mail, téléphone,
 * contact). Sans recherche : celles qui ressemblent au dossier lui-même
 * (même e-mail d'abord, puis même nom d'entreprise).
 */
function chercherFiches(fiches: SousTraitant[], recherche: string, dossier: DossierST): SousTraitant[] {
  const q = normaliser(recherche)
  if (!q) {
    const email = normaliser(dossier.email)
    const nom = normaliser(dossier.raisonSociale)
    const score = (f: SousTraitant) => {
      if (email && normaliser(f.email) === email) return 3
      const fe = normaliser(f.entreprise)
      if (nom && fe && (fe.includes(nom) || nom.includes(fe))) return 2
      return 0
    }
    return fiches.map((f) => ({ f, s: score(f) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 8).map((x) => x.f)
  }
  const chiffres = chiffresTel(q)
  const score = (f: SousTraitant) => {
    let s = 0
    if (normaliser(f.entreprise).includes(q)) s += 3
    if (normaliser(f.email).includes(q)) s += 3
    if (chiffres.length >= 4 && chiffresTel(f.telephone).includes(chiffres)) s += 3
    if (normaliser(f.contact).includes(q)) s += 1
    return s
  }
  return fiches.map((f) => ({ f, s: score(f) })).filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.f.entreprise.localeCompare(b.f.entreprise, "fr")).slice(0, 8).map((x) => x.f)
}

// ════════════════════════════════════════════════════════════════════════════
// LE PANNEAU D'UN DOSSIER — la fiche rattachée (ou le bloc pour la rattacher),
// les pièces, les réponses du formulaire section par section ; en pied,
// « Marquer traité » ou « Rouvrir ».
// ════════════════════════════════════════════════════════════════════════════
export default function PanneauDossier({ dossier, fiche, fiches, onFermer, onMaj, onRecharger, onOuvrirFiche, avant }: {
  dossier: DossierST
  fiche: SousTraitant | undefined
  fiches: SousTraitant[]
  onFermer: () => void
  onMaj: (id: string, champs: Partial<DossierST>) => void
  onRecharger: () => Promise<void>
  onOuvrirFiche: (id: string) => void
  avant?: ReactNode
}) {
  const [recherche, setRecherche] = useState("")
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState("")
  const [info, setInfo] = useState("")
  const [pieceEnCours, setPieceEnCours] = useState<string | null>(null)
  const [envoiContrats, setEnvoiContrats] = useState(false)
  const [confirmerAcces, setConfirmerAcces] = useState(false) // envoyer le lien d'accès sans contrats signés (Mahdi, 12/10)
  const candidats = useMemo(() => chercherFiches(fiches, recherche, dossier), [fiches, recherche, dossier])
  const sections = dossier.donnees?.sections ?? []
  const s = statutDossier(dossier, fiche)
  const qualif = useQualification(fiche?.id ?? "")

  const agir = async (f: () => Promise<void>, message: string) => {
    setOccupe(true); setErreur(""); setInfo("")
    try { await f(); setInfo(message) }
    catch (e) { setErreur(msg(e)) }
    finally { setOccupe(false) }
  }
  // Un artisan qui n'est pas dans la base : sa fiche est créée depuis le
  // dossier, puis rattachée — contrats et lien d'accès se débloquent (12/10/2026).
  const horsBase = () => agir(async () => {
    const f = await creerFicheHorsBase(dossier)
    onMaj(dossier.id, { sousTraitantId: f.id })
    await onRecharger()
  }, "Fiche créée depuis le dossier et rattachée : vous pouvez envoyer les contrats.")
  const rattacher = (id: string | null) => agir(async () => {
    await rattacherDossier(dossier, id)
    onMaj(dossier.id, { sousTraitantId: id })
    await onRecharger() // la fiche rattachée vient de passer « déposé »
  }, id ? "Dossier rattaché : la séquence de l'artisan est arrêtée." : "Dossier détaché de la fiche.")
  const traiter = (traite: boolean) => agir(async () => {
    await marquerDossier(dossier.id, { traite })
    onMaj(dossier.id, { traiteLe: traite ? new Date().toISOString() : null })
  }, traite ? "Dossier marqué traité." : "Dossier rouvert.")

  // Le lien signé ne vit que 10 minutes : il est fabriqué au clic. L'onglet
  // s'ouvre AVANT l'attente, sinon le navigateur le bloque comme une fenêtre
  // surgissante ; on coupe ensuite le lien avec notre page (opener).
  const ouvrirPiece = async (p: { path: string; nom?: string }) => {
    const onglet = window.open("", "_blank")
    if (onglet) onglet.opener = null
    setPieceEnCours(p.path); setErreur("")
    try {
      const url = await lienPieceDossier(p.path)
      if (onglet) onglet.location.href = url
      else setErreur("Le navigateur a bloqué l'ouverture : autorisez les fenêtres surgissantes pour ce site.")
    } catch (e) {
      onglet?.close()
      setErreur(msg(e))
    } finally {
      setPieceEnCours(null)
    }
  }

  const titreSection = (t: string) => <h3 className="mb-2 mt-6 text-colonne font-medium text-encre-2">{t}</h3>

  return (
    <Panneau
      titre={dossier.raisonSociale || "Dossier sans nom"}
      sousTitre={<span className="flex flex-wrap items-center gap-2"><Pastille role={s.role} point={s.texte === "nouveau"}>{s.texte}</Pastille><span>Déposé le {dateHeure(dossier.creeLe)}</span>{dossier.email ? <span>· {dossier.email}</span> : null}</span>}
      onFermer={onFermer}
      largeur="w-[720px]"
      pied={<>
        {fiche ? <Bouton icone={<FileSignature />} disabled={occupe || qualif.decision !== "Accepté" || ["envoye", "livre", "signe_artisan", "signe"].includes(fiche.contratStatut ?? "")} title={qualif.decision !== "Accepté" ? "Accepte d'abord le sous-traitant dans sa qualification" : fiche.contratStatut === "signe" ? "Contrats déjà signés" : fiche.contratStatut ? "Contrats déjà en cours de signature" : "Remplir les informations et envoyer les contrats DocuSign"} onClick={() => setEnvoiContrats(true)}>{fiche.contratStatut ? LIBELLE_CONTRAT[fiche.contratStatut] : "Envoyer les contrats"}</Bouton> : <Bouton icone={<FileSignature />} disabled title="Rattache d'abord le dossier à une fiche">Envoyer les contrats</Bouton>}
        {dossier.traiteLe
          ? <Bouton chargement={occupe} onClick={() => traiter(false)}>Rouvrir</Bouton>
          : <Bouton variante="plein" chargement={occupe} onClick={() => traiter(true)}>Marquer traité</Bouton>}
      </>}
    >
      {avant}
      {erreur ? <Bandeau role="alerte" className="mb-3">{erreur}</Bandeau> : null}
      {info ? <Bandeau role="ok" className="mb-3">{info}</Bandeau> : null}
      {fiche ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-legende">
          {fiche.contratStatut ? <Pastille role={ROLE_CONTRAT[fiche.contratStatut]} point>{LIBELLE_CONTRAT[fiche.contratStatut]}</Pastille> : <Pastille role="inerte" point>Contrats pas encore envoyés</Pastille>}
          {fiche.contratLe ? <span className="text-encre-2">{new Date(fiche.contratLe).toLocaleDateString("fr-FR")}</span> : null}
          {fiche.accesOuvertLe ? <Pastille role="fait" point>Accès ouvert le {new Date(fiche.accesOuvertLe).toLocaleDateString("fr-FR")}</Pastille>
            : fiche.accesEnvoyeLe ? <Pastille role="attente" point>Lien d'accès envoyé le {new Date(fiche.accesEnvoyeLe).toLocaleDateString("fr-FR")}</Pastille> : null}
          {/* Le lien part tout seul à la signature des deux parties, mais l'artisan ne le voit pas toujours et nous appelle
              (Mahdi, 12/10) : le bouton reste là pour l'envoyer ou le renvoyer à la main ; sans contrats signés, on confirme. */}
          {!fiche.accesOuvertLe ? (
            <Bouton taille="sm" variante="discret" icone={<KeyRound />} disabled={occupe} onClick={() => { if (fiche.contratStatut === "signe") void agir(async () => { const a = await envoyerLienAcces(fiche.id!, !!fiche.accesEnvoyeLe); await onRecharger(); setInfo(`Lien « ouvrir mon accès » envoyé à ${a}, copie à STC.`) }, ""); else setConfirmerAcces(true) }}>{fiche.accesEnvoyeLe ? "Renvoyer le lien d'accès" : "Envoyer le lien d'accès"}</Bouton>
          ) : null}
        </div>
      ) : null}
      {envoiContrats && fiche ? <EnvoyerContratsDialogue fiche={fiche} dossier={dossier} onFermer={() => setEnvoiContrats(false)} onEnvoye={async (texte) => { setEnvoiContrats(false); setInfo(texte); await onRecharger() }} /> : null}
      {confirmerAcces && fiche ? (
        <Dialogue
          titre="Envoyer le lien d'accès sans contrats signés ?"
          description="Les contrats ne sont pas signés par les deux parties dans DocuSign. Le lien ouvre l'Espace Partenaire tout de suite : à n'envoyer que si les contrats ont été signés autrement (papier, ancien envoi)."
          onFermer={() => setConfirmerAcces(false)}
          pied={<><Bouton onClick={() => setConfirmerAcces(false)}>Annuler</Bouton><Bouton variante="plein" chargement={occupe} onClick={() => agir(async () => { const a = await envoyerLienAcces(fiche.id!, true); setConfirmerAcces(false); await onRecharger(); setInfo(`Lien « ouvrir mon accès » envoyé à ${a}, copie à STC.`) }, "")}>Envoyer quand même</Bouton></>}
        />
      ) : null}

      {titreSection("Fiche rattachée")}
      {fiche ? (
        <Carte className="px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-legende font-semibold text-encre">{fiche.entreprise}</div>
              <div className="truncate text-colonne text-encre-2">{[fiche.contact, fiche.email, fiche.telephone, fiche.metier].filter(Boolean).join(" · ")}</div>
            </div>
            <Pastille role={rolePastilleStatut[fiche.statut]} point>{libelleStatutST[fiche.statut]}</Pastille>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Bouton taille="sm" icone={<ExternalLink />} onClick={() => onOuvrirFiche(fiche.id!)}>Ouvrir la fiche</Bouton>
            <Bouton variante="discret" taille="sm" icone={<Unlink />} disabled={occupe} onClick={() => rattacher(null)}>Détacher</Bouton>
          </div>
        </Carte>
      ) : dossier.sousTraitantId ? (
        <Bandeau role="attention" action={<Bouton taille="sm" icone={<Unlink />} disabled={occupe} onClick={() => rattacher(null)}>Détacher</Bouton>}>
          Rattaché à une fiche introuvable (supprimée ?). Détachez-le pour le relier à une autre.
        </Bandeau>
      ) : (
        <div>
          <Bandeau role="attention" className="mb-3">Aucune fiche de recrutement n'est rattachée : la séquence de cet artisan continue tant que le dossier n'est pas relié à sa fiche.</Bandeau>
          <Etiquette texte="Rattacher à une fiche" aide={recherche ? undefined : "Sans recherche : les fiches qui ressemblent au dossier (même e-mail, même entreprise)."}>
            <Champ value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Entreprise, e-mail ou téléphone…" />
          </Etiquette>
          <ul className="mt-2 divide-y divide-fond-4 rounded-4 border border-trait">
            {candidats.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-legende font-medium text-encre">{c.entreprise || <span className="italic text-encre-2">Sans nom</span>}</div>
                  <div className="truncate text-colonne text-encre-2">{[c.contact, c.email, c.telephone, c.metier].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Pastille role={rolePastilleStatut[c.statut]}>{libelleStatutST[c.statut]}</Pastille>
                  <Bouton taille="sm" icone={<Link2 />} disabled={occupe} onClick={() => rattacher(c.id!)}>Rattacher</Bouton>
                </div>
              </li>
            ))}
            {candidats.length === 0 ? (
              <li className="px-3 py-3 text-legende text-encre-2">{recherche ? "Aucune fiche ne correspond." : "Aucune fiche ne ressemble à ce dossier : cherchez-la par son nom, son e-mail ou son téléphone."}</li>
            ) : null}
          </ul>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-4 border border-trait px-3 py-2.5">
            <div className="min-w-0 text-legende text-encre-2">
              <span className="font-medium text-encre">L'artisan n'est pas dans la base ?</span>{" "}
              Sa fiche est créée à partir du dossier, et les contrats peuvent partir.
            </div>
            <Bouton taille="sm" icone={<UserPlus />} disabled={occupe} onClick={horsBase}>Sous-traitant hors base</Bouton>
          </div>
        </div>
      )}

      {titreSection(`Pièces (${dossier.fichiers.length})`)}
      {dossier.fichiers.length === 0 ? <p className="text-legende text-encre-2">Aucune pièce jointe.</p> : (
        <ul className="divide-y divide-fond-4">
          {dossier.fichiers.map((p) => (
            <li key={p.path} className="flex items-center justify-between gap-3 py-2">
              <span className="flex min-w-0 items-center gap-2 text-legende text-encre">
                <Paperclip size={14} className="shrink-0 text-encre-2" />
                <span className="truncate">{nomDePiece(p)}</span>
                {p.slot ? <Pastille>{p.slot}</Pastille> : null}
              </span>
              <Bouton taille="sm" icone={<ExternalLink />} chargement={pieceEnCours === p.path} onClick={() => ouvrirPiece(p)}>Ouvrir</Bouton>
            </li>
          ))}
        </ul>
      )}

      {sections.length === 0 ? (
        <>
          {titreSection("Réponses")}
          <p className="text-legende text-encre-2">Le dossier ne contient pas de réponses détaillées.</p>
        </>
      ) : sections.map((sec, i) => (
        <div key={i}>
          {titreSection(sec.titre)}
          <div className="divide-y divide-fond-4">
            {(sec.lignes ?? []).map((l, k) => <Reponse key={k} label={l.label} valeur={l.valeur} />)}
          </div>
        </div>
      ))}
    </Panneau>
  )
}
