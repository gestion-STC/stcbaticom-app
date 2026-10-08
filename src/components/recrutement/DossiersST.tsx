// ════════════════════════════════════════════════════════════════════════════
// DOSSIERS DÉPOSÉS — les dossiers de qualification déposés par les artisans
// sur stcbatiment.fr/sous-traitants (table dossiers_st).
//
// Un dossier est « nouveau » tant que personne ne l'a ouvert, « vu » dès
// qu'on l'ouvre, « traité » quand on le dit. Il doit être RATTACHÉ à une fiche
// de recrutement : c'est ce rattachement qui arrête la séquence de l'artisan
// (la machine le fait seule quand le lien tracké a suivi, sinon on le fait ici).
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState } from "react"
import { ExternalLink, Link2, Paperclip, Unlink } from "lucide-react"
import type { DossierST, SousTraitant } from "../../recrutement"
import { libelleStatutST, rolePastilleStatut } from "../../recrutement"
import { supabaseConfigure } from "../../lib/supabase"
import { chargerDossiers, lienPieceDossier, marquerDossier, rattacherDossier } from "../../lib/machineDb"
import { chargerSousTraitants } from "../../lib/sousTraitantsDb"
import { chiffresTel } from "../../lib/telephone"
import FicheArtisan from "./FicheArtisan"
import { Bandeau, Bouton, Carte, Champ, Chargement, Compteurs, EnTetePage, Etiquette, Ligne, Panneau, Pastille, Tableau, Td, Th, Tr, Vide } from "../../ui"

type Filtre = "tous" | "nouveaux" | "a_traiter" | "sans_fiche"

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))
const dateHeure = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
const normaliser = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()
const estNouveau = (d: DossierST) => !d.vuLe && !d.traiteLe
const statutDossier = (d: DossierST): { role: "fait" | "actif" | "info"; texte: string } =>
  d.traiteLe ? { role: "fait", texte: "traité" } : d.vuLe ? { role: "actif", texte: "vu" } : { role: "info", texte: "nouveau" }
const nomDePiece = (p: { nom?: string; path: string }) => p.nom || p.path.split("/").pop() || p.path
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`

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

export default function DossiersST() {
  const [dossiers, setDossiers] = useState<DossierST[]>([])
  const [fiches, setFiches] = useState<SousTraitant[]>([])
  const [chargement, setChargement] = useState(!!supabaseConfigure)
  const [erreur, setErreur] = useState(supabaseConfigure ? "" : "Base non configurée.")
  const [filtre, setFiltre] = useState<Filtre>("tous")
  const [ouvertId, setOuvertId] = useState<string | null>(null)
  const [ficheOuverte, setFicheOuverte] = useState<string | null>(null)

  const charger = useCallback(() =>
    Promise.all([chargerDossiers(), chargerSousTraitants()])
      .then(([ds, fs]) => { setDossiers(ds); setFiches(fs) })
      .catch((e) => setErreur(msg(e)))
      .finally(() => setChargement(false)),
  [])
  useEffect(() => { if (supabaseConfigure) charger() }, [charger])

  const parId = useMemo(() => new Map(fiches.map((f) => [f.id ?? "", f])), [fiches])
  const compte = useMemo(() => ({
    tous: dossiers.length,
    nouveaux: dossiers.filter(estNouveau).length,
    a_traiter: dossiers.filter((d) => !d.traiteLe).length,
    sans_fiche: dossiers.filter((d) => !d.sousTraitantId).length,
  }), [dossiers])
  const visibles = useMemo(() => dossiers.filter((d) =>
    filtre === "nouveaux" ? estNouveau(d) : filtre === "a_traiter" ? !d.traiteLe : filtre === "sans_fiche" ? !d.sousTraitantId : true,
  ), [dossiers, filtre])
  const ouvert = dossiers.find((d) => d.id === ouvertId) ?? null

  const majLocal = (id: string, champs: Partial<DossierST>) => setDossiers((l) => l.map((d) => (d.id === id ? { ...d, ...champs } : d)))
  const ouvrir = (d: DossierST) => {
    setOuvertId(d.id)
    // Vu dès l'ouverture : le compteur « nouveaux » baisse tout de suite.
    if (!d.vuLe) marquerDossier(d.id, { vu: true }).then(() => majLocal(d.id, { vuLe: new Date().toISOString() })).catch((e) => setErreur(msg(e)))
  }

  return (
    <div className="mx-auto max-w-[1200px] px-8 py-6">
      <EnTetePage
        titre="Dossiers déposés"
        sousTitre={`${pluriel(compte.tous, "dossier")} · ${compte.a_traiter} à traiter · ${compte.sans_fiche} sans fiche rattachée`}
      />

      {erreur ? <Bandeau role="alerte" className="mb-4" action={<Bouton variante="discret" taille="sm" onClick={() => setErreur("")}>Fermer</Bouton>}>{erreur}</Bandeau> : null}

      {chargement ? <Chargement /> : (
        <>
          <Compteurs<Filtre>
            actif={filtre}
            onSelect={setFiltre}
            valeurs={[
              { id: "tous", libelle: "Tous", valeur: compte.tous },
              { id: "nouveaux", libelle: "Nouveaux", valeur: compte.nouveaux, detail: "ni vus ni traités" },
              { id: "a_traiter", libelle: "À traiter", valeur: compte.a_traiter, detail: "pas encore traités" },
              { id: "sans_fiche", libelle: "Sans fiche", valeur: compte.sans_fiche, detail: "à rattacher", role: compte.sans_fiche > 0 ? "alerte" : undefined },
            ]}
          />

          <Carte className="mt-4 overflow-hidden">
            {visibles.length === 0 ? (
              <Vide
                titre={dossiers.length === 0 ? "Aucun dossier déposé" : "Rien dans ce filtre"}
                texte={dossiers.length === 0 ? "Les dossiers déposés sur stcbatiment.fr/sous-traitants apparaîtront ici." : "Changez de compteur pour voir les autres dossiers."}
              />
            ) : (
              <Tableau>
                <thead>
                  <tr>
                    <Th>Déposé le</Th>
                    <Th>Entreprise</Th>
                    <Th>E-mail</Th>
                    <Th>Fiche rattachée</Th>
                    <Th num>Pièces</Th>
                    <Th>Statut</Th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((d) => {
                    const fiche = d.sousTraitantId ? parId.get(d.sousTraitantId) : undefined
                    const s = statutDossier(d)
                    return (
                      <Tr key={d.id} onClick={() => ouvrir(d)}>
                        <Td className="chiffres whitespace-nowrap text-encre-2">{dateHeure(d.creeLe)}</Td>
                        <Td className={estNouveau(d) ? "font-semibold text-encre" : "font-medium text-encre"}>{d.raisonSociale || <span className="italic text-encre-2">Sans nom</span>}</Td>
                        <Td className="text-encre-2">{d.email || "—"}</Td>
                        <Td>{fiche ? <span className="text-encre">{fiche.entreprise}</span> : d.sousTraitantId ? <Pastille role="attente">fiche introuvable</Pastille> : <Pastille role="attente">à rattacher</Pastille>}</Td>
                        <Td num>{d.fichiers.length}</Td>
                        <Td><Pastille role={s.role} point={s.texte === "nouveau"}>{s.texte}</Pastille></Td>
                      </Tr>
                    )
                  })}
                </tbody>
              </Tableau>
            )}
          </Carte>
        </>
      )}

      {/* Le panneau du dossier s'efface derrière la fiche artisan, et revient quand elle se ferme. */}
      {ouvert && !ficheOuverte ? (
        <PanneauDossier
          dossier={ouvert}
          fiche={ouvert.sousTraitantId ? parId.get(ouvert.sousTraitantId) : undefined}
          fiches={fiches}
          onFermer={() => setOuvertId(null)}
          onMaj={majLocal}
          onRecharger={charger}
          onOuvrirFiche={setFicheOuverte}
        />
      ) : null}
      {ficheOuverte ? <FicheArtisan id={ficheOuverte} onFermer={() => setFicheOuverte(null)} onChange={charger} /> : null}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// LE PANNEAU D'UN DOSSIER — la fiche rattachée (ou le bloc pour la rattacher),
// les pièces, les réponses du formulaire section par section ; en pied,
// « Marquer traité » ou « Rouvrir ».
// ════════════════════════════════════════════════════════════════════════════
function PanneauDossier({ dossier, fiche, fiches, onFermer, onMaj, onRecharger, onOuvrirFiche }: {
  dossier: DossierST
  fiche: SousTraitant | undefined
  fiches: SousTraitant[]
  onFermer: () => void
  onMaj: (id: string, champs: Partial<DossierST>) => void
  onRecharger: () => Promise<void>
  onOuvrirFiche: (id: string) => void
}) {
  const [recherche, setRecherche] = useState("")
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState("")
  const [info, setInfo] = useState("")
  const [pieceEnCours, setPieceEnCours] = useState<string | null>(null)
  const candidats = useMemo(() => chercherFiches(fiches, recherche, dossier), [fiches, recherche, dossier])
  const sections = dossier.donnees?.sections ?? []
  const s = statutDossier(dossier)

  const agir = async (f: () => Promise<void>, message: string) => {
    setOccupe(true); setErreur(""); setInfo("")
    try { await f(); setInfo(message) }
    catch (e) { setErreur(msg(e)) }
    finally { setOccupe(false) }
  }
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

  const titreSection = (t: string) => <h3 className="mb-2 mt-6 text-colonne font-semibold uppercase tracking-[0.07em] text-encre-2">{t}</h3>

  return (
    <Panneau
      titre={dossier.raisonSociale || "Dossier sans nom"}
      sousTitre={<span className="flex flex-wrap items-center gap-2"><Pastille role={s.role} point={s.texte === "nouveau"}>{s.texte}</Pastille><span>Déposé le {dateHeure(dossier.creeLe)}</span>{dossier.email ? <span>· {dossier.email}</span> : null}</span>}
      onFermer={onFermer}
      largeur="w-[560px]"
      pied={dossier.traiteLe
        ? <Bouton chargement={occupe} onClick={() => traiter(false)}>Rouvrir</Bouton>
        : <Bouton variante="plein" chargement={occupe} onClick={() => traiter(true)}>Marquer traité</Bouton>}
    >
      {erreur ? <Bandeau role="alerte" className="mb-3">{erreur}</Bandeau> : null}
      {info ? <Bandeau role="ok" className="mb-3">{info}</Bandeau> : null}

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
            {(sec.lignes ?? []).map((l, k) => <Ligne key={k} libelle={l.label}>{l.valeur || "—"}</Ligne>)}
          </div>
        </div>
      ))}
    </Panneau>
  )
}
