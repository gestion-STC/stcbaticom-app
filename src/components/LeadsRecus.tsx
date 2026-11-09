// ── LEADS REÇUS (Mahdi, 09/11/2026 : « un endroit où les leads tombent, comme Meta ») ──
// Tous les leads des bases du compte au même endroit : les fiches remplies en tête (dossiers déposés des
// artisans ; demain les formulaires des campagnes), puis les réponses, puis l'intérêt. Le choix de base
// pour qui a les deux ; le choix de la campagne pour les administrateurs. Remplace « Dossiers déposés » :
// une fiche remplie s'ouvre ICI, en panneau (Mahdi, 09/11 : « on ne peut pas avoir deux pages de leads reçus ») ;
// un lead simple garde le bouton Appeler.
import { useCallback, useEffect, useMemo, useState } from "react"
import { ExternalLink, FileText, Phone, RefreshCw } from "lucide-react"
import DossierDepuisLead from "./recrutement/DossierDepuisLead"
import type { Session } from "@supabase/supabase-js"
import { Bandeau as BandeauAlerte, Bouton, Chargement, Panneau, Pastille, Selecteur } from "../ui"
import { Bandeau, Table } from "./demarchage/aujourdhui/courtier"
import { Onglets, Titre } from "./prospection/morceaux"
import ChoixBase from "./ChoixBase"
import { estAdmin } from "../lib/comptes"
import type { Espace } from "../lib/messagesDb"
import { NOM_BASE } from "../lib/perimetre"
import { useChoixBase } from "../lib/useChoixBase"
import { compterParNiveau, filtrerLeads, LIBELLE_NIVEAU, leadsVisibles, trierLeads, type LeadRecu, type Niveau } from "../lib/leadsRecus"
import { chargerLeadsRecus, type CampagneCourte } from "../lib/leadsRecusDb"

const ROLE_NIVEAU: Record<Niveau, "fait" | "actif" | "inerte"> = { fiche: "fait", reponse: "actif", interet: "inerte" }
const quandCourt = (iso: string) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—")

export default function LeadsRecus({ session, espaces, onAppelerAgence, onOuvrirAgence, onSessionArtisans }: {
  session: Session | null
  espaces: Espace[]
  onAppelerAgence: (agenceId: string) => void
  onOuvrirAgence: (agenceId: string) => void
  onSessionArtisans: () => void
}) {
  const admin = estAdmin(session)
  const moiId = session?.user?.id ?? ""
  const [base, setBase] = useChoixBase("leads", espaces, true)
  const [campagne, setCampagne] = useState("toutes")
  const [statut, setStatut] = useState<"a_traiter" | "traites">("a_traiter")
  const [donnees, setDonnees] = useState<{ leads: LeadRecu[]; campagnes: CampagneCourte[] } | null>(null)
  const [erreur, setErreur] = useState("")
  // La fiche ouverte sur place : un dossier d'artisan, ou la fiche remplie par une agence.
  const [dossierOuvert, setDossierOuvert] = useState<string | null>(null)
  const [ficheAgence, setFicheAgence] = useState<LeadRecu | null>(null)

  const charger = useCallback(() => {
    chargerLeadsRecus(new Date())
      .then((d) => { setDonnees(d); setErreur("") })
      .catch((e) => setErreur(e instanceof Error ? e.message : String(e)))
  }, [])
  useEffect(() => {
    const t = setTimeout(charger, 0)
    const iv = setInterval(charger, 120_000)
    return () => { clearTimeout(t); clearInterval(iv) }
  }, [charger])

  // Ce que le compte a le droit de voir, puis les filtres de la page.
  const miens = useMemo(() => leadsVisibles(donnees?.leads ?? [], espaces, moiId, admin), [donnees, espaces, moiId, admin])
  const campagnesVisibles = (donnees?.campagnes ?? []).filter((c) => base === "tout" ? espaces.includes(c.baseId === "artisans" ? "recrutement" : "demarchage") : (c.baseId === "artisans") === (base === "recrutement"))
  const campagneValide = campagne === "toutes" || campagne === "hors" || campagnesVisibles.some((c) => c.id === campagne) ? campagne : "toutes"
  const filtres = { espace: base, campagne: campagneValide }
  const aTraiter = filtrerLeads(miens, { ...filtres, aTraiter: true })
  const traites = filtrerLeads(miens, { ...filtres, aTraiter: false })
  const lignes = trierLeads(statut === "a_traiter" ? aTraiter : traites)
  const n = compterParNiveau(aTraiter)
  const deuxBases = espaces.length > 1

  const action = (l: LeadRecu) =>
    l.cible.type === "dossier" ? <Bouton taille="sm" icone={<FileText />} onClick={() => setDossierOuvert(l.cible.id)}>Ouvrir le dossier</Bouton>
      : l.cible.type === "agence" && l.niveau === "fiche" ? <Bouton taille="sm" icone={<FileText />} onClick={() => setFicheAgence(l)}>Ouvrir la fiche</Bouton>
      : l.cible.type === "agence" ? <Bouton taille="sm" icone={<Phone />} onClick={() => onAppelerAgence(l.cible.id)}>Appeler</Bouton>
        : <Bouton taille="sm" icone={<Phone />} onClick={onSessionArtisans}>Appeler</Bouton>

  return (
    <div className="@container page space-y-6">
      <Titre titre="Leads reçus" sous="Tous ceux qui se sont manifestés : les fiches remplies en tête, puis les réponses, puis l'intérêt."
        droite={<Bouton taille="sm" variante="discret" icone={<RefreshCw />} onClick={charger}>Actualiser</Bouton>} />
      {erreur ? <BandeauAlerte role="alerte">{erreur}</BandeauAlerte> : null}

      <div className="flex flex-wrap items-center gap-3">
        <ChoixBase valeur={base} onChange={setBase} espaces={espaces} avecTout />
        {admin ? (
          <span className="w-72">
            <Selecteur value={campagneValide} onChange={(e) => setCampagne(e.target.value)} aria-label="Campagne">
              <option value="toutes">Toutes les campagnes</option>
              {campagnesVisibles.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              <option value="hors">Hors campagne</option>
            </Selecteur>
          </span>
        ) : null}
        <Onglets valeur={statut} onChange={setStatut} options={[["a_traiter", "À traiter", aTraiter.length], ["traites", "Traités", traites.length]]} />
      </div>

      <Bandeau cases={[
        { libelle: "Fiches remplies", valeur: n.fiche, ton: n.fiche ? "text-ok" : "text-encre", title: "Le plus chaud : un dossier déposé, un formulaire rempli" },
        { libelle: "Ont répondu", valeur: n.reponse, ton: n.reponse ? "text-signature" : "text-encre" },
        { libelle: "Intérêt", valeur: n.interet, title: "Un clic, une page ou une plaquette ouverte" },
        { libelle: "À traiter", valeur: aTraiter.length },
      ]} />

      {!donnees && !erreur ? <Chargement texte="Lecture des leads…" /> : (
        <Table colonnes={[{ titre: "", largeur: "130px" }, { titre: "Qui" }, ...(deuxBases ? [{ titre: "Base", largeur: "90px" }] : []), { titre: "Ce qu'il a fait", largeur: "260px" }, { titre: "Campagne", largeur: "220px" }, { titre: "Quand", largeur: "110px" }, { titre: "", largeur: "170px" }]}
          vide={statut === "a_traiter" ? "Aucun lead à traiter : les prochains tomberont ici." : "Aucun lead traité sur les deux derniers mois."}
          lignes={lignes.slice(0, 200).map((l) => ({ cle: l.id, cellules: [
            <Pastille role={ROLE_NIVEAU[l.niveau]} point>{LIBELLE_NIVEAU[l.niveau]}</Pastille>,
            <span className="block min-w-0 py-1.5">
              {l.cible.type === "agence" ? (
                <button type="button" onClick={() => onOuvrirAgence(l.cible.id)} className="flex max-w-full items-center gap-1 truncate text-left font-medium text-encre hover:underline">{l.nom}<ExternalLink size={11} className="shrink-0 text-encre-3" /></button>
              ) : <b className="block truncate font-medium">{l.nom}</b>}
              {l.detail ? <span className="block truncate text-colonne text-encre-2">{l.detail}</span> : null}
            </span>,
            ...(deuxBases ? [<span className="text-encre-2">{NOM_BASE[l.espace]}</span>] : []),
            <span className="flex min-w-0 items-center gap-2"><span className="truncate text-encre">{l.signal}</span>{l.etat ? <Pastille role={l.etat.role} point={l.etat.texte === "nouveau"}>{l.etat.texte}</Pastille> : null}</span>,
            <span className="block truncate text-encre-2">{l.campagne?.nom ?? "Hors campagne"}</span>,
            <span className="chiffres text-encre-2">{quandCourt(l.quand)}</span>,
            <span className="flex justify-end">{action(l)}</span>,
          ] }))} />
      )}
      {lignes.length > 200 ? <p className="text-colonne text-encre-3">Les 200 premiers affichés sur {lignes.length}.</p> : null}

      {dossierOuvert ? <DossierDepuisLead id={dossierOuvert} onFermer={() => setDossierOuvert(null)} onChange={charger} /> : null}
      {ficheAgence && ficheAgence.cible.type === "agence" ? (() => {
        const agenceId = ficheAgence.cible.id
        return (
          <Panneau titre={ficheAgence.nom} sousTitre={<span>{ficheAgence.signal} · {quandCourt(ficheAgence.quand)}</span>} onFermer={() => setFicheAgence(null)} largeur="w-[720px]"
            pied={<><Bouton icone={<ExternalLink />} onClick={() => { setFicheAgence(null); onOuvrirAgence(agenceId) }}>Fiche de l'agence</Bouton><Bouton variante="plein" icone={<Phone />} onClick={() => { setFicheAgence(null); onAppelerAgence(agenceId) }}>Appeler</Bouton></>}>
            <h3 className="mb-2 text-colonne font-medium text-encre-2">Ce qu'elle a renseigné</h3>
            <p className="whitespace-pre-wrap text-legende leading-relaxed text-encre">{ficheAgence.detail || "Aucun détail."}</p>
          </Panneau>
        )
      })() : null}
    </div>
  )
}
