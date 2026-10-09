// ════════════════════════════════════════════════════════════════════════════
// AGENCES — la liste principale du démarchage.
//
// Quatre FILES (À prospecter · Rappels du jour · Intéressés sans nouvelle ·
// À réveiller) et « Toutes », en compteurs cliquables ; une barre de filtres ;
// un tableau paginé (50 par page, comme la boîte de réception). Une ligne
// s'ouvre dans la fiche (volet à droite) ; « Appeler » envoie dans une session
// de call. Les apporteurs d'affaires n'apparaissent jamais ici (archive).
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, Download, ExternalLink, Phone, Plus, Upload } from "lucide-react"
import { ETAPES, FILES, SORTIES, TYPES_AGENCE, type Agence, type File, type Secteur, type TypeAgence, libelleEtape, libelleResultat, pastilleEtape, SOMMEIL_APRES_TENTATIVES } from "../../demarchage/modele"
import { chargerAgences, chargerFile, chargerSecteurs, compterFiles, compterParEtape, type FiltresAgences } from "../../demarchage/db"
import {
  FILTRES_VIDES, type CleTri, type FileOuToutes, type FiltresLocaux, type Tri, basculerTri, dateCourte, depuisTexte, enRetard, enseignesDistinctes, filtrerAgences, ilYA, messageErreur, pluriel,
  secteursParZone, sousTitreAgences, trierAgences,
} from "../../demarchage/agencesOutils"
import { exporterAgencesExcel, exporterContactsExcel } from "../../demarchage/exportAgences"
import { supabaseConfigure } from "../../lib/supabase"
import { Bandeau, BarreFiltres, Bouton, Carte, Case, Champ, Chargement, Compteurs, EnTetePage, Pastille, Selecteur, Tableau, Td, Th, Tr, Vide } from "../../ui"
import FicheAgence from "./FicheAgence"
import NouvelleAgence from "./NouvelleAgence"
import ImportAgences from "./ImportAgences"

const PAR_PAGE = 50
const COMPTES_VIDES: Record<File, number> = { a_prospecter: 0, rappels: 0, sans_nouvelle: 0, a_reveiller: 0 }

export default function Agences({ onOuvrirSession }: { onOuvrirSession?: (agenceId: string) => void }) {
  const [agences, setAgences] = useState<Agence[]>([])
  const [secteurs, setSecteurs] = useState<Secteur[]>([])
  const [parEtape, setParEtape] = useState<Record<string, number>>({})
  const [parFile, setParFile] = useState<Record<File, number>>(COMPTES_VIDES)
  const [file, setFile] = useState<FileOuToutes>("toutes")
  const [filtres, setFiltres] = useState<FiltresLocaux>(FILTRES_VIDES)
  const [recherchePrete, setRecherchePrete] = useState("") // la recherche, 300 ms après la dernière frappe
  const [tri, setTri] = useState<Tri>({ cle: "nom", sens: "asc" })
  const [page, setPage] = useState(0)
  const [maintenant, setMaintenant] = useState(() => new Date())
  const [chargement, setChargement] = useState(supabaseConfigure)
  const [erreur, setErreur] = useState(supabaseConfigure ? "" : "Base non configurée.")
  const [info, setInfo] = useState("")
  const [ficheOuverte, setFicheOuverte] = useState<string | null>(null)
  const [ficheSurEtape, setFicheSurEtape] = useState(false) // la fiche s'ouvre sur « Changer l'étape »
  const [nouvelle, setNouvelle] = useState(false)
  const [importOuvert, setImportOuvert] = useState(false)
  const [menuExport, setMenuExport] = useState(false)
  const [exportEnCours, setExportEnCours] = useState(false)

  // La recherche part au serveur 300 ms après la dernière frappe, pas à chaque touche.
  useEffect(() => {
    const t = setTimeout(() => setRecherchePrete(filtres.recherche), 300)
    return () => clearTimeout(t)
  }, [filtres.recherche])

  // Les filtres que la base sait appliquer (« sorties » n'existe que chez nous : on le filtre après).
  const filtresServeur = useMemo<FiltresAgences>(() => ({
    etape: filtres.etape === "sorties" ? "" : filtres.etape, secteur: filtres.secteur, type: filtres.type as TypeAgence | "", enseigne: filtres.enseigne,
    recherche: recherchePrete, jamaisJointe: filtres.jamaisJointe, avecContact: filtres.avecContact,
  }), [filtres.etape, filtres.secteur, filtres.type, filtres.enseigne, filtres.jamaisJointe, filtres.avecContact, recherchePrete])

  const chargerCompteurs = useCallback(async () => {
    const quand = new Date()
    const [e, f] = await Promise.all([compterParEtape(), compterFiles(quand)])
    setParEtape(e); setParFile(f)
  }, [])

  const charger = useCallback(async () => {
    if (!supabaseConfigure) return
    try {
      const quand = new Date()
      const liste = file === "toutes" ? await chargerAgences(filtresServeur) : await chargerFile(file, quand)
      setAgences(liste); setMaintenant(quand); setErreur("")
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setChargement(false)
    }
  }, [file, filtresServeur])
  useEffect(() => { const t = setTimeout(charger, 0); return () => clearTimeout(t) }, [charger])
  useEffect(() => {
    if (!supabaseConfigure) return
    const t = setTimeout(() => {
      chargerSecteurs().then(setSecteurs).catch(() => undefined)
      chargerCompteurs().catch((e) => setErreur(messageErreur(e)))
    }, 0)
    return () => clearTimeout(t)
  }, [chargerCompteurs])

  // Après une écriture dans la fiche : la liste et les compteurs.
  const recharger = useCallback(() => { charger(); chargerCompteurs().catch(() => undefined) }, [charger, chargerCompteurs])

  const majFiltres = (patch: Partial<FiltresLocaux>) => { setFiltres((f) => ({ ...f, ...patch })); setPage(0) }
  const choisirFile = (id: FileOuToutes) => { setFile(id); setPage(0); setChargement(true) }
  const filtresActifs = (Object.keys(FILTRES_VIDES) as (keyof FiltresLocaux)[]).some((k) => filtres[k] !== FILTRES_VIDES[k])

  // Les files arrivent sans filtre : on applique les nôtres en mémoire (sans effet quand la base l'a déjà fait).
  const filtrees = useMemo(() => filtrerAgences(agences, filtres), [agences, filtres])
  const triees = useMemo(() => trierAgences(filtrees, tri), [filtrees, tri])
  const enseignes = useMemo(() => enseignesDistinctes(agences), [agences])
  const nbPages = Math.max(1, Math.ceil(triees.length / PAR_PAGE))
  const pageCourante = Math.min(page, nbPages - 1)
  const visibles = triees.slice(pageCourante * PAR_PAGE, pageCourante * PAR_PAGE + PAR_PAGE)
  const total = Object.values(parEtape).reduce((n, v) => n + v, 0)

  const exporter = async (quoi: "agences" | "contacts") => {
    setMenuExport(false); setExportEnCours(true); setErreur("")
    try {
      if (quoi === "agences") { await exporterAgencesExcel(triees); setInfo(`${pluriel(triees.length, "agence exportée", "agences exportées")}.`) }
      else { const n = await exporterContactsExcel(triees); setInfo(`${pluriel(n, "contact exporté", "contacts exportés")}.`) }
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setExportEnCours(false)
    }
  }

  const enTeteTri = (cle: CleTri, libelle: string) => (
    <Th>
      <button type="button" className="inline-flex items-center gap-1 uppercase hover:text-encre" onClick={() => setTri((t) => basculerTri(t, cle))}>
        {libelle}
        {tri.cle === cle ? (tri.sens === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} className="opacity-50" />}
      </button>
    </Th>
  )

  return (
    <div className="page">
      <EnTetePage
        titre="Agences"
        sousTitre={sousTitreAgences(parEtape)}
        droite={
          <>
            <Bouton icone={<Upload />} onClick={() => setImportOuvert(true)} disabled={!supabaseConfigure}>Importer un fichier</Bouton>
            <div className="relative">
              <Bouton icone={<Download />} chargement={exportEnCours} disabled={triees.length === 0} onClick={() => setMenuExport((v) => !v)}>Exporter <ChevronDown /></Bouton>
              {menuExport ? (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuExport(false)} />
                  <Carte className="absolute right-0 z-20 mt-1 min-w-[240px] p-1 shadow-flottante">
                    <button type="button" className="block w-full rounded-3 px-3 py-2 text-left text-legende text-encre hover:bg-fond-4" onClick={() => exporter("agences")}>
                      Les agences affichées <span className="chiffres text-encre-2">({triees.length})</span>
                    </button>
                    <button type="button" className="block w-full rounded-3 px-3 py-2 text-left text-legende text-encre hover:bg-fond-4" onClick={() => exporter("contacts")}>
                      Leurs contacts
                    </button>
                  </Carte>
                </>
              ) : null}
            </div>
            <Bouton variante="plein" icone={<Plus />} onClick={() => setNouvelle(true)} disabled={!supabaseConfigure}>Nouvelle agence</Bouton>
          </>
        }
      />

      {erreur ? <Bandeau role="alerte" className="mb-4" action={<Bouton taille="sm" onClick={() => { setChargement(true); recharger() }}>Réessayer</Bouton>}>{erreur}</Bandeau> : null}
      {info ? <Bandeau role="ok" className="mb-4" action={<Bouton taille="sm" variante="discret" onClick={() => setInfo("")}>Fermer</Bouton>}>{info}</Bandeau> : null}

      <div className="mb-4">
        <Compteurs<FileOuToutes>
          valeurs={[
            { id: "toutes", libelle: "Toutes", valeur: total, detail: "Sans les apporteurs" },
            ...FILES.map((f) => ({ id: f.code, libelle: f.libelle, valeur: parFile[f.code], detail: f.aide, role: f.code === "rappels" && parFile.rappels > 0 ? ("alerte" as const) : undefined })),
          ]}
          actif={file}
          onSelect={choisirFile}
        />
      </div>

      <BarreFiltres className="mb-4">
        <div className="min-w-[240px] flex-1">
          <Champ type="search" value={filtres.recherche} onChange={(e) => majFiltres({ recherche: e.target.value })} placeholder="Rechercher : nom, téléphone, e-mail, adresse, contact" aria-label="Rechercher" />
        </div>
        <Selecteur className="w-[190px]" value={filtres.secteur} onChange={(e) => majFiltres({ secteur: e.target.value })} aria-label="Secteur">
          <option value="">Tous les secteurs</option>
          {secteursParZone(secteurs).map((z) => (
            <optgroup key={z.zone} label={z.zone}>{z.secteurs.map((s) => <option key={s.code} value={s.code}>{s.libelle}</option>)}</optgroup>
          ))}
        </Selecteur>
        <Selecteur className="w-[190px]" value={filtres.etape} onChange={(e) => majFiltres({ etape: e.target.value as FiltresLocaux["etape"] })} aria-label="Étape">
          <option value="">Toutes les étapes</option>
          <option value="actives">En cours (sans les sorties)</option>
          <option value="sorties">Les sorties</option>
          <optgroup label="Étapes">{ETAPES.map((e) => <option key={e.code} value={e.code}>{e.libelle}</option>)}</optgroup>
          <optgroup label="Sorties">{SORTIES.map((s) => <option key={s.code} value={s.code}>{s.libelle}</option>)}</optgroup>
        </Selecteur>
        <Selecteur className="w-[170px]" value={filtres.type} onChange={(e) => majFiltres({ type: e.target.value as FiltresLocaux["type"] })} aria-label="Type">
          <option value="">Tous les types</option>
          {TYPES_AGENCE.filter((t) => t.code !== "apporteur").map((t) => <option key={t.code} value={t.code}>{t.libelle}</option>)}
        </Selecteur>
        <Selecteur className="w-[160px]" value={filtres.enseigne} onChange={(e) => majFiltres({ enseigne: e.target.value })} aria-label="Enseigne">
          <option value="">Toutes les enseignes</option>
          {enseignes.map((en) => <option key={en} value={en}>{en}</option>)}
          {filtres.enseigne && !enseignes.includes(filtres.enseigne) ? <option value={filtres.enseigne}>{filtres.enseigne}</option> : null}
        </Selecteur>
        <Case texte="jamais jointe" checked={filtres.jamaisJointe} onChange={(e) => majFiltres({ jamaisJointe: e.target.checked })} />
        <Case texte="avec contact" checked={filtres.avecContact} onChange={(e) => majFiltres({ avecContact: e.target.checked })} />
        {filtresActifs ? <Bouton variante="discret" taille="sm" onClick={() => { setFiltres(FILTRES_VIDES); setPage(0) }}>Effacer</Bouton> : null}
      </BarreFiltres>

      {chargement ? <Chargement texte="Chargement des agences…" /> : null}

      {!chargement && !erreur ? (
        <>
          <Carte className="overflow-hidden">
            {triees.length === 0 ? (
              agences.length === 0 && !filtresActifs
                ? (file === "toutes"
                  ? <Vide titre="Aucune agence" texte="Importe un fichier ou crée la première agence à la main." action={<Bouton icone={<Plus />} onClick={() => setNouvelle(true)}>Nouvelle agence</Bouton>} />
                  : <Vide titre={`Rien dans « ${FILES.find((f) => f.code === file)?.libelle ?? ""} »`} texte={file === "rappels" ? "Aucune tâche d'aujourd'hui ni en retard." : file === "a_reveiller" ? "Aucune agence endormie n'a atteint sa date de réveil." : file === "sans_nouvelle" ? "Toutes les agences intéressées ont eu une nouvelle cette semaine." : "Toutes les agences ont une tâche datée ou sont sorties du circuit."} action={<Bouton onClick={() => choisirFile("toutes")}>Voir toutes les agences</Bouton>} />)
                : <Vide titre="Rien ne correspond" texte="Aucune agence ne passe ces filtres." action={<Bouton onClick={() => { setFiltres(FILTRES_VIDES); setPage(0) }}>Effacer les filtres</Bouton>} />
            ) : (
              <Tableau>
                <thead>
                  <tr>
                    {enTeteTri("nom", "Agence")}
                    {enTeteTri("secteur", "Secteur")}
                    <Th>Standard</Th>
                    <Th>Contact principal</Th>
                    {enTeteTri("etape", "Étape")}
                    <Th num>Tentatives</Th>
                    {enTeteTri("dernierAppel", "Dernier appel")}
                    {enTeteTri("prochaineTache", "Prochaine tâche")}
                    <Th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((a) => {
                    const retard = enRetard(a.prochaineEcheance, maintenant)
                    return (
                      <Tr key={a.id} onClick={() => { setFicheSurEtape(false); setFicheOuverte(a.id) }}>
                        <Td>
                          <div className="font-semibold text-encre">{a.nom}</div>
                          {a.enseigne ? <div className="text-legende text-encre-2">{a.enseigne}</div> : null}
                        </Td>
                        <Td>{a.secteurLibelle || "—"}</Td>
                        <Td><span className="chiffres">{a.telephone || "—"}</span></Td>
                        <Td>
                          {a.contactPrincipal ? (
                            <>
                              <div className="text-encre">{a.contactPrincipal}</div>
                              {a.contactLigne ? <div className="chiffres text-colonne text-encre-2">{a.contactLigne}</div> : null}
                            </>
                          ) : <span className="text-encre-2">—</span>}
                        </Td>
                        <Td>
                          <button type="button" title="Changer l'étape" className="rounded-4 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signature" onClick={(e) => { e.stopPropagation(); setFicheSurEtape(true); setFicheOuverte(a.id) }}>
                            <Pastille role={pastilleEtape(a.etape)} point>{libelleEtape(a.etape)}</Pastille>
                          </button>
                          <div className="mt-0.5 chiffres text-colonne text-encre-2">{depuisTexte(a.etapeDepuis, maintenant)}</div>
                        </Td>
                        <Td num className={a.tentatives >= SOMMEIL_APRES_TENTATIVES ? "text-alerte font-semibold" : ""}>{a.tentatives} / {SOMMEIL_APRES_TENTATIVES}</Td>
                        <Td>
                          {a.dernierAppelLe ? (
                            <>
                              <div className="chiffres" title={ilYA(a.dernierAppelLe, maintenant)}>{dateCourte(a.dernierAppelLe)}</div>
                              {a.dernierResultat ? <div className="text-colonne text-encre-2">{libelleResultat(a.dernierResultat)}</div> : null}
                            </>
                          ) : <span className="text-encre-2">jamais</span>}
                        </Td>
                        <Td>
                          {a.prochaineEcheance ? (
                            <>
                              <div className={retard ? "font-medium text-alerte" : "text-encre"}>{a.prochaineTache || "Tâche"}</div>
                              <div className={"chiffres text-colonne " + (retard ? "text-alerte" : "text-encre-2")}>{dateCourte(a.prochaineEcheance)} · {ilYA(a.prochaineEcheance, maintenant)}</div>
                            </>
                          ) : <span className="text-encre-2">—</span>}
                        </Td>
                        <Td className="text-right">
                          <div className="flex justify-end gap-1">
                            <Bouton variante="discret" taille="icone" aria-label="Appeler" title={onOuvrirSession ? "Appeler dans une session" : "Appel indisponible ici"} icone={<Phone />} disabled={!onOuvrirSession} onClick={(e) => { e.stopPropagation(); onOuvrirSession?.(a.id) }} />
                            <Bouton variante="discret" taille="icone" aria-label="Ouvrir" title="Ouvrir la fiche" icone={<ExternalLink />} onClick={(e) => { e.stopPropagation(); setFicheSurEtape(false); setFicheOuverte(a.id) }} />
                          </div>
                        </Td>
                      </Tr>
                    )
                  })}
                </tbody>
              </Tableau>
            )}
          </Carte>

          {triees.length > 0 ? (
            <div className="mt-3 flex items-center justify-between gap-3 text-legende text-encre-2">
              <span className="chiffres">{pageCourante * PAR_PAGE + 1}–{Math.min(triees.length, (pageCourante + 1) * PAR_PAGE)} sur {triees.length}</span>
              {nbPages > 1 ? (
                <div className="flex items-center gap-2">
                  <Bouton taille="sm" icone={<ChevronLeft />} disabled={pageCourante <= 0} onClick={() => setPage(pageCourante - 1)}>Précédent</Bouton>
                  <span className="chiffres">page {pageCourante + 1} / {nbPages}</span>
                  <Bouton taille="sm" disabled={pageCourante >= nbPages - 1} onClick={() => setPage(pageCourante + 1)}>Suivant <ChevronRight /></Bouton>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {ficheOuverte ? <FicheAgence id={ficheOuverte} ouvrirEtape={ficheSurEtape} onFermer={() => { setFicheOuverte(null); setFicheSurEtape(false) }} onChange={recharger} onOuvrirSession={onOuvrirSession} /> : null}
      {nouvelle ? <NouvelleAgence onFermer={() => setNouvelle(false)} onCree={(id) => { setNouvelle(false); setFicheOuverte(id); recharger() }} /> : null}
      {importOuvert ? <ImportAgences onFermer={() => setImportOuvert(false)} onImporte={() => { setImportOuvert(false); setInfo("Import terminé."); recharger() }} /> : null}
    </div>
  )
}
