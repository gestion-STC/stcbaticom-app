// ════════════════════════════════════════════════════════════════════════════
// APPORTEURS D'AFFAIRES — une archive de classement.
//
// Mahdi : « c'est juste du classement, on ne les travaille pas ». Ces fiches
// (type d'agence « apporteur ») ne sont jamais dans les files ni dans les
// sessions de call ; on les consulte, on les exporte, c'est tout.
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState } from "react"
import { Download } from "lucide-react"
import type { Agence } from "../../demarchage/modele"
import { chargerAgences } from "../../demarchage/db"
import { FILTRES_VIDES, filtrerAgences, messageErreur, pluriel } from "../../demarchage/agencesOutils"
import { exporterApporteursExcel } from "../../demarchage/exportAgences"
import { supabaseConfigure } from "../../lib/supabase"
import { Bandeau, BarreFiltres, Bouton, Carte, Champ, Chargement, EnTetePage, Tableau, Td, Th, Tr, Vide } from "../../ui"
import FicheAgence from "./FicheAgence"

export default function Apporteurs() {
  const [agences, setAgences] = useState<Agence[]>([])
  const [recherche, setRecherche] = useState("")
  const [chargement, setChargement] = useState(supabaseConfigure)
  const [erreur, setErreur] = useState(supabaseConfigure ? "" : "Base non configurée.")
  const [exportEnCours, setExportEnCours] = useState(false)
  const [ficheOuverte, setFicheOuverte] = useState<string | null>(null)

  const charger = useCallback(async () => {
    if (!supabaseConfigure) return
    try {
      setAgences(await chargerAgences({ type: "apporteur" }))
      setErreur("")
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setChargement(false)
    }
  }, [])
  useEffect(() => { const t = setTimeout(charger, 0); return () => clearTimeout(t) }, [charger])

  const filtrees = useMemo(() => filtrerAgences(agences, { ...FILTRES_VIDES, recherche }), [agences, recherche])

  const exporter = async () => {
    setExportEnCours(true); setErreur("")
    try { await exporterApporteursExcel(filtrees) }
    catch (e) { setErreur(messageErreur(e)) }
    finally { setExportEnCours(false) }
  }

  return (
    <div className="page">
      <EnTetePage
        titre="Apporteurs d'affaires"
        sousTitre={`Archive : ces fiches ne sont jamais appelées · ${pluriel(agences.length, "fiche")}`}
        droite={<Bouton icone={<Download />} chargement={exportEnCours} disabled={filtrees.length === 0} onClick={exporter}>Exporter</Bouton>}
      />

      {erreur ? <Bandeau role="alerte" className="mb-4" action={<Bouton taille="sm" onClick={() => { setChargement(true); charger() }}>Réessayer</Bouton>}>{erreur}</Bandeau> : null}

      <BarreFiltres className="mb-4">
        <div className="min-w-[240px] flex-1">
          <Champ type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher : nom, contact, téléphone, e-mail, secteur" aria-label="Rechercher" />
        </div>
        {recherche ? <Bouton variante="discret" taille="sm" onClick={() => setRecherche("")}>Effacer</Bouton> : null}
      </BarreFiltres>

      {chargement ? <Chargement texte="Chargement de l'archive…" /> : null}

      {!chargement && !erreur ? (
        <Carte className="overflow-hidden">
          {filtrees.length === 0 ? (
            agences.length === 0
              ? <Vide titre="Aucun apporteur d'affaires" texte="Une fiche entre ici quand son type est « Apporteur d'affaires » (dans la fiche agence, Identité → Modifier)." />
              : <Vide titre="Rien ne correspond" texte="Aucune fiche ne contient ce texte." action={<Bouton onClick={() => setRecherche("")}>Effacer la recherche</Bouton>} />
          ) : (
            <Tableau>
              <thead>
                <tr>
                  <Th>Nom</Th>
                  <Th>Contact principal</Th>
                  <Th>Téléphone</Th>
                  <Th>E-mail</Th>
                  <Th>Secteur</Th>
                </tr>
              </thead>
              <tbody>
                {filtrees.map((a) => (
                  <Tr key={a.id} onClick={() => setFicheOuverte(a.id)}>
                    <Td>
                      <div className="font-semibold text-encre">{a.nom}</div>
                      {a.adresse ? <div className="text-legende text-encre-2">{a.adresse}</div> : null}
                    </Td>
                    <Td>{a.contactPrincipal || <span className="text-encre-2">—</span>}</Td>
                    <Td><span className="chiffres">{a.contactLigne || a.telephone || "—"}</span></Td>
                    <Td>{a.email || <span className="text-encre-2">—</span>}</Td>
                    <Td>{a.secteurLibelle || "—"}</Td>
                  </Tr>
                ))}
              </tbody>
            </Tableau>
          )}
        </Carte>
      ) : null}

      {!chargement && filtrees.length > 0 ? <div className="mt-3 chiffres text-legende text-encre-2">{filtrees.length} sur {agences.length}</div> : null}

      {ficheOuverte ? <FicheAgence id={ficheOuverte} onFermer={() => setFicheOuverte(null)} onChange={charger} /> : null}
    </div>
  )
}
