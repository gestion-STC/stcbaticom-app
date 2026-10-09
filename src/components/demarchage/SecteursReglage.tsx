// ════════════════════════════════════════════════════════════════════════════
// RÉGLAGES › SECTEURS — la liste fermée des codes postaux où l'on prospecte,
// groupée par zone (Paris, 92, 93, 94, 95, 78), avec le nombre d'agences dans
// chacun. On renomme un libellé en place, on ajoute un secteur par son code
// postal (la zone se déduit des deux premiers chiffres). On ne supprime pas :
// un secteur porte des agences.
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState, type KeyboardEvent } from "react"
import { Check, Pencil, Plus, X } from "lucide-react"
import { chargerSecteurs } from "../../demarchage/db"
import type { Secteur } from "../../demarchage/modele"
import { ajouterSecteur, codeValide, compterAgencesParSecteur, grouperParZone, libelleZone, renommerSecteur, zoneDepuisCode } from "../../demarchage/secteursOutils"
import { supabaseConfigure } from "../../lib/supabase"
import { Bandeau, Bouton, Carte, Champ, Chargement, Etiquette, Pastille, Tableau, Td, Th, TitreCarte, Tr, Vide } from "../../ui"

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export default function SecteursReglage() {
  const [secteurs, setSecteurs] = useState<Secteur[] | null>(null)
  const [comptes, setComptes] = useState<Map<string, number>>(new Map())
  const [erreur, setErreur] = useState(supabaseConfigure ? "" : "Base non configurée.")
  // Le secteur dont on édite le libellé, et le texte en cours.
  const [edition, setEdition] = useState<{ code: string; libelle: string } | null>(null)
  const [nouveau, setNouveau] = useState({ code: "", libelle: "" })
  const [occupe, setOccupe] = useState(false)

  const charger = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([chargerSecteurs(), compterAgencesParSecteur()])
      setSecteurs(s)
      setComptes(c)
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

  if (!secteurs) return erreur ? <Bandeau role="alerte">{erreur}</Bandeau> : <Chargement texte="Lecture des secteurs…" />

  const groupes = grouperParZone(secteurs)
  const sansSecteur = comptes.get("") ?? 0
  const zoneNouveau = codeValide(nouveau.code) ? zoneDepuisCode(nouveau.code) : ""

  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-legende text-encre-2">
        Les secteurs sont la liste fermée des codes postaux où l'on prospecte. Chaque agence en a un ; la file « À prospecter » met le secteur du
        jour en premier. Renomme un libellé en cliquant dessus ; ajoute un secteur par son code postal, la zone se déduit toute seule.
      </p>
      {erreur ? <Bandeau role="alerte">{erreur}</Bandeau> : null}
      {sansSecteur ? <Bandeau role="attention">{sansSecteur} agence{sansSecteur > 1 ? "s" : ""} sans secteur : elles ne sortent jamais en « secteur du jour ». Donne-leur un code postal depuis leur fiche.</Bandeau> : null}

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
            const total = g.secteurs.reduce((n, s) => n + (comptes.get(s.code) ?? 0), 0)
            return (
              <Carte key={g.zone}>
                <TitreCarte droite={<span className="chiffres text-legende text-encre-2">{g.secteurs.length} secteur{g.secteurs.length > 1 ? "s" : ""} · {total} agence{total > 1 ? "s" : ""}</span>}>{g.libelle}</TitreCarte>
                <Tableau className="pb-2">
                  <thead>
                    <tr><Th className="w-[90px]">Code</Th><Th>Secteur</Th><Th num className="w-[90px]">Agences</Th><Th className="w-[44px]" /></tr>
                  </thead>
                  <tbody>
                    {g.secteurs.map((s) => {
                      const n = comptes.get(s.code) ?? 0
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
