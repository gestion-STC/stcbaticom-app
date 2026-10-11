// ════════════════════════════════════════════════════════════════════════════
// RÉGLAGES › SECTEURS — la liste fermée des codes postaux où l'on prospecte,
// groupée par zone (Paris, 92, 93, 94, 95, 78), avec le nombre d'agences dans
// chacun. On renomme un libellé en place, on ajoute un secteur par son code
// postal (la zone se déduit des deux premiers chiffres). On ne supprime pas :
// un secteur porte des agences.
//
// L'ATTRIBUTION DE LA BASE (Mahdi, 11/10/2026) se règle ici aussi : chaque
// secteur est démarché par une personne ; choisir quelqu'un attribue les agences
// NON attribuées du secteur (celles déjà appelées gardent leur propriétaire).
// Et un réglage : qui voit les agences non attribuées (admins, ou tout le monde).
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState, type KeyboardEvent } from "react"
import { Check, Pencil, Plus, X } from "lucide-react"
import { attribuerSecteur, chargerSecteurs } from "../../demarchage/db"
import { CLE_NON_ATTRIBUEES, nonAttribueesPourTous } from "../../demarchage/attribution"
import type { Secteur } from "../../demarchage/modele"
import { ajouterSecteur, codeValide, compterAgencesParSecteur, compterNonAttribueesParSecteur, grouperParZone, libelleZone, renommerSecteur, zoneDepuisCode } from "../../demarchage/secteursOutils"
import { useSession } from "../../lib/auth"
import { estAdmin, listerComptes } from "../../lib/comptes"
import { ecrireParametre, lireParametre } from "../../lib/parametresDb"
import { supabaseConfigure } from "../../lib/supabase"
import { Bandeau, Bouton, Carte, Champ, Chargement, Etiquette, Pastille, Selecteur, Tableau, Td, Th, TitreCarte, Tr, Vide } from "../../ui"

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export default function SecteursReglage() {
  const session = useSession()
  const admin = estAdmin(session)
  const [secteurs, setSecteurs] = useState<Secteur[] | null>(null)
  const [nombres, setNombres] = useState<Map<string, number>>(new Map())
  const [nonAttribuees, setNonAttribuees] = useState<Map<string, number>>(new Map())
  const [comptes, setComptes] = useState<{ id: string; nom: string }[]>([])
  const [libre, setLibre] = useState(false)
  const [erreur, setErreur] = useState(supabaseConfigure ? "" : "Base non configurée.")
  const [info, setInfo] = useState("")
  // Le secteur dont on édite le libellé, et le texte en cours.
  const [edition, setEdition] = useState<{ code: string; libelle: string } | null>(null)
  const [nouveau, setNouveau] = useState({ code: "", libelle: "" })
  const [occupe, setOccupe] = useState(false)

  const charger = useCallback(async () => {
    try {
      const [s, c, n, l] = await Promise.all([chargerSecteurs(), compterAgencesParSecteur(), compterNonAttribueesParSecteur(), lireParametre(CLE_NON_ATTRIBUEES).catch(() => null)])
      setSecteurs(s)
      setNombres(c)
      setNonAttribuees(n)
      setLibre(nonAttribueesPourTous(l))
      setErreur("")
    } catch (e) {
      setErreur(message(e))
    }
  }, [])
  useEffect(() => {
    if (!supabaseConfigure) return
    const t = setTimeout(charger, 0)
    return () => clearTimeout(t)
  }, [charger])
  useEffect(() => {
    if (!admin) return
    listerComptes().then((l) => setComptes(l.map((c) => ({ id: c.id, nom: c.nom || c.email })))).catch(() => undefined)
  }, [admin])

  async function validerRenommage() {
    if (!edition || !secteurs) return
    const libelle = edition.libelle.trim()
    const actuel = secteurs.find((s) => s.code === edition.code)
    if (!actuel || actuel.libelle === libelle) { setEdition(null); return }
    setOccupe(true)
    try {
      await renommerSecteur(edition.code, libelle)
      setSecteurs(secteurs.map((s) => (s.code === edition.code ? { ...s, libelle } : s)))
      setEdition(null)
      setErreur("")
    } catch (e) {
      setErreur(message(e))
    } finally {
      setOccupe(false)
    }
  }
  const toucheEdition = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") void validerRenommage()
    if (e.key === "Escape") setEdition(null)
  }

  async function ajouter() {
    if (!secteurs) return
    setOccupe(true)
    try {
      const s = await ajouterSecteur(nouveau.code, nouveau.libelle, secteurs)
      setSecteurs([...secteurs, s])
      setNouveau({ code: "", libelle: "" })
      setErreur("")
    } catch (e) {
      setErreur(message(e))
    } finally {
      setOccupe(false)
    }
  }

  // Attribuer un secteur : le réglage est mémorisé, les agences non attribuées du secteur passent à la personne.
  async function attribuer(s: Secteur, compteId: string) {
    if (!secteurs) return
    setOccupe(true)
    try {
      const n = await attribuerSecteur(s.code, compteId || null)
      setSecteurs(secteurs.map((x) => (x.code === s.code ? { ...x, commercialId: compteId || null } : x)))
      if (compteId) setNonAttribuees(new Map(nonAttribuees).set(s.code, 0))
      const qui = comptes.find((c) => c.id === compteId)?.nom ?? "personne"
      setInfo(compteId ? `${s.libelle} → ${qui} : ${n} agence${n > 1 ? "s" : ""} attribuée${n > 1 ? "s" : ""}. Celles déjà attribuées gardent leur propriétaire.` : `${s.libelle} : plus personne en charge (les agences gardent leur propriétaire).`)
      setErreur("")
    } catch (e) {
      setErreur(message(e))
    } finally {
      setOccupe(false)
    }
  }
  async function reglerVisibilite(valeur: string) {
    try {
      await ecrireParametre(CLE_NON_ATTRIBUEES, valeur)
      setLibre(nonAttribueesPourTous(valeur))
      setErreur("")
    } catch (e) {
      setErreur(message(e))
    }
  }

  if (!secteurs) return erreur ? <Bandeau role="alerte">{erreur}</Bandeau> : <Chargement texte="Lecture des secteurs…" />

  const groupes = grouperParZone(secteurs)
  const sansSecteur = nombres.get("") ?? 0
  const zoneNouveau = codeValide(nouveau.code) ? zoneDepuisCode(nouveau.code) : ""
  const totalNonAttribuees = [...nonAttribuees.values()].reduce((a, b) => a + b, 0)
  const total = [...nombres.values()].reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-legende text-encre-2">
        Les secteurs sont la liste fermée des codes postaux où l'on prospecte. Chaque agence en a un ; la file « À prospecter » met le secteur du
        jour en premier. Renomme un libellé en cliquant dessus ; ajoute un secteur par son code postal, la zone se déduit toute seule.
      </p>
      {erreur ? <Bandeau role="alerte">{erreur}</Bandeau> : null}
      {info ? <Bandeau role="ok">{info}</Bandeau> : null}
      {sansSecteur ? <Bandeau role="attention">{sansSecteur} agence{sansSecteur > 1 ? "s" : ""} sans secteur : elles ne sortent jamais en « secteur du jour ». Donne-leur un code postal depuis leur fiche.</Bandeau> : null}

      {admin ? (
        <Carte>
          <TitreCarte droite={<span className="chiffres text-legende text-encre-2">{total - totalNonAttribuees} attribuée{total - totalNonAttribuees > 1 ? "s" : ""} · {totalNonAttribuees} non attribuée{totalNonAttribuees > 1 ? "s" : ""}</span>}>Attribution de la base</TitreCarte>
          <div className="space-y-3 px-5 pb-5">
            <p className="max-w-3xl text-legende text-encre-2">
              Chaque agence a un propriétaire : la personne qui la démarche. Dans sa session de call, un téléprospecteur n'appelle que sa base ; deux personnes ne tombent
              jamais sur le même numéro. Choisis ci-dessous qui démarche chaque secteur : les agences non attribuées du secteur lui passent, celles déjà appelées gardent
              leur propriétaire. Une agence sans propriétaire appelée depuis une session devient celle de l'appelant. Les statistiques restent sur la base générale.
            </p>
            <div className="flex flex-wrap items-end gap-4">
              <Etiquette texte="Les agences non attribuées sont visibles par" className="max-w-[320px]">
                <Selecteur value={libre ? "tous" : "admins"} onChange={(e) => reglerVisibilite(e.target.value)} aria-label="Qui voit les agences non attribuées">
                  <option value="admins">Les admins seulement</option>
                  <option value="tous">Tout le monde (chacun peut s'y servir)</option>
                </Selecteur>
              </Etiquette>
              {sansSecteur ? (
                <Etiquette texte={`Les ${nonAttribuees.get("") ?? 0} agences sans secteur non attribuées → démarchées par`} className="max-w-[360px]">
                  <Selecteur value="" onChange={(e) => { if (e.target.value) void attribuer({ code: "", libelle: "Sans secteur", zone: "", ordre: 0 }, e.target.value) }} disabled={occupe || !(nonAttribuees.get("") ?? 0)} aria-label="Qui démarche les agences sans secteur">
                    <option value="">— choisir quelqu'un —</option>
                    {comptes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </Selecteur>
                </Etiquette>
              ) : null}
            </div>
          </div>
        </Carte>
      ) : null}

      <Carte>
        <TitreCarte>Ajouter un secteur</TitreCarte>
        <div className="flex flex-wrap items-end gap-3 px-5 pb-5">
          <Etiquette texte="Code postal" className="w-[140px]">
            <Champ value={nouveau.code} onChange={(e) => setNouveau({ ...nouveau, code: e.target.value.replace(/\D/g, "").slice(0, 5) })} placeholder="92110" inputMode="numeric" className="chiffres" />
          </Etiquette>
          <Etiquette texte="Nom du secteur" className="min-w-[240px] flex-1">
            <Champ value={nouveau.libelle} onChange={(e) => setNouveau({ ...nouveau, libelle: e.target.value })} placeholder="Clichy" onKeyDown={(e) => { if (e.key === "Enter") void ajouter() }} />
          </Etiquette>
          <div className="flex h-[34px] items-center">
            {zoneNouveau ? <Pastille role="info">{libelleZone(zoneNouveau)}</Pastille> : <span className="text-colonne text-encre-3">La zone se déduit du code</span>}
          </div>
          <Bouton variante="plein" icone={<Plus />} chargement={occupe} disabled={!codeValide(nouveau.code) || !nouveau.libelle.trim()} onClick={ajouter}>Ajouter</Bouton>
        </div>
      </Carte>

      {groupes.length === 0 ? (
        <Carte><Vide titre="Aucun secteur" texte="Ajoute un premier code postal ci-dessus." /></Carte>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {groupes.map((g) => {
            const totalZone = g.secteurs.reduce((n, s) => n + (nombres.get(s.code) ?? 0), 0)
            return (
              <Carte key={g.zone}>
                <TitreCarte droite={<span className="chiffres text-legende text-encre-2">{g.secteurs.length} secteur{g.secteurs.length > 1 ? "s" : ""} · {totalZone} agence{totalZone > 1 ? "s" : ""}</span>}>{g.libelle}</TitreCarte>
                <Tableau className="pb-2">
                  <thead>
                    <tr>
                      <Th className="w-[90px]">Code</Th>
                      <Th>Secteur</Th>
                      <Th num className="w-[90px]">Agences</Th>
                      {admin ? <Th num className="w-[110px]">Non attribuées</Th> : null}
                      {admin ? <Th className="w-[190px]">Démarché par</Th> : null}
                      <Th className="w-[44px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {g.secteurs.map((s) => {
                      const n = nombres.get(s.code) ?? 0
                      const libres = nonAttribuees.get(s.code) ?? 0
                      const enEdition = edition?.code === s.code
                      return (
                        <Tr key={s.code}>
                          <Td className="chiffres text-encre-2">{s.code}</Td>
                          <Td>
                            {enEdition ? (
                              <div className="flex items-center gap-1">
                                <Champ autoFocus value={edition.libelle} onChange={(e) => setEdition({ code: s.code, libelle: e.target.value })} onKeyDown={toucheEdition} className="h-7 max-w-[260px]" />
                                <Bouton taille="icone" variante="discret" className="h-7 w-7" aria-label="Valider" chargement={occupe} onClick={validerRenommage}><Check /></Bouton>
                                <Bouton taille="icone" variante="discret" className="h-7 w-7" aria-label="Annuler" onClick={() => setEdition(null)}><X /></Bouton>
                              </div>
                            ) : (
                              <button type="button" onClick={() => setEdition({ code: s.code, libelle: s.libelle })} className="rounded-3 text-left text-encre hover:underline">
                                {s.libelle}
                              </button>
                            )}
                          </Td>
                          <Td num className={n ? "" : "text-encre-3"}>{n}</Td>
                          {admin ? <Td num className={libres ? "" : "text-encre-3"}>{libres}</Td> : null}
                          {admin ? (
                            <Td>
                              <Selecteur value={s.commercialId ?? ""} onChange={(e) => attribuer(s, e.target.value)} disabled={occupe} className="h-7" aria-label={`Qui démarche ${s.libelle}`}>
                                <option value="">— personne —</option>
                                {comptes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                                {s.commercialId && !comptes.some((c) => c.id === s.commercialId) ? <option value={s.commercialId}>Un autre compte</option> : null}
                              </Selecteur>
                            </Td>
                          ) : null}
                          <Td className="text-right">
                            {enEdition ? null : (
                              <Bouton taille="icone" variante="discret" className="h-7 w-7" aria-label={`Renommer ${s.libelle}`} onClick={() => setEdition({ code: s.code, libelle: s.libelle })}><Pencil /></Bouton>
                            )}
                          </Td>
                        </Tr>
                      )
                    })}
                  </tbody>
                </Tableau>
              </Carte>
            )
          })}
        </div>
      )}
    </div>
  )
}
