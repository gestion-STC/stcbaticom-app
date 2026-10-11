// ════════════════════════════════════════════════════════════════════════════
// RÉGLAGES → RECRUTEMENT → « CONTRATS À FAIRE SIGNER » (11/10/2026)
//
// Les contrats sont des MODÈLES DocuSign (Mahdi : « déjà enregistrés dans
// DocuSign »). Ici on lit les modèles du compte, on coche ceux qui forment le
// pack et on fixe leur ordre. À l'envoi, l'artisan signe d'abord, STC ensuite.
// Et le bouton « Brancher les retours DocuSign », à cliquer une fois.
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from "react"
import { ArrowDown, ArrowUp, Plug, RefreshCw, Save } from "lucide-react"
import { chargerModelesDocusign, chargerPack, enregistrerPack, installerConnect } from "../../lib/contratsDb"
import { roleArtisan, type ModeleDocusign } from "../../lib/contratsOutils"
import { Bandeau, Bouton, Carte, Case, Chargement, Pastille, TitreCarte, Vide } from "../../ui"

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export default function ContratsModeles() {
  const [modeles, setModeles] = useState<ModeleDocusign[] | null>(null)
  const [compte, setCompte] = useState("")
  const [pack, setPack] = useState<string[]>([]) // les templateId choisis, dans l'ordre
  const [origine, setOrigine] = useState<string[]>([])
  const [erreur, setErreur] = useState("")
  const [info, setInfo] = useState("")
  const [occupe, setOccupe] = useState(false)

  const charger = useCallback(async () => {
    setErreur("")
    try {
      const [m, p] = await Promise.all([chargerModelesDocusign(), chargerPack()])
      setModeles(m.modeles); setCompte(m.compte)
      const ids = p.filter((x) => x.actif).map((x) => x.templateId)
      setPack(ids); setOrigine(ids)
    } catch (e) { setErreur(message(e)); setModeles([]) }
  }, [])
  useEffect(() => { const t = setTimeout(charger, 0); return () => clearTimeout(t) }, [charger])

  const agir = async (f: () => Promise<void>, ok: string) => {
    setOccupe(true); setErreur(""); setInfo("")
    try { await f(); setInfo(ok) }
    catch (e) { setErreur(message(e)) }
    finally { setOccupe(false) }
  }
  const basculer = (id: string) => setPack((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const bouger = (id: string, sens: -1 | 1) => setPack((p) => {
    const i = p.indexOf(id), j = i + sens
    if (i < 0 || j < 0 || j >= p.length) return p
    const c = [...p]; [c[i], c[j]] = [c[j], c[i]]; return c
  })
  const change = pack.join("|") !== origine.join("|")
  const enregistrer = () => agir(async () => {
    const choisis = pack.map((id) => ({ templateId: id, nom: modeles?.find((m) => m.templateId === id)?.nom ?? id }))
    await enregistrerPack(choisis)
    setOrigine(pack)
  }, pack.length ? `Pack enregistré : ${pack.length} contrat${pack.length > 1 ? "s" : ""} partiront, dans cet ordre.` : "Pack vidé : plus aucun contrat ne part.")

  const ordre = (id: string) => pack.indexOf(id)
  const tries = modeles ? [...modeles].sort((a, b) => { const oa = ordre(a.templateId), ob = ordre(b.templateId); if ((oa >= 0) !== (ob >= 0)) return oa >= 0 ? -1 : 1; return oa >= 0 ? oa - ob : a.nom.localeCompare(b.nom, "fr") }) : []

  return (
    <Carte>
      <TitreCarte droite={<>
        {compte ? <Pastille role={compte === "réel" ? "fait" : "attente"}>{compte === "réel" ? "compte réel" : "bac à sable DocuSign"}</Pastille> : null}
        <Bouton taille="sm" variante="discret" icone={<RefreshCw />} disabled={occupe} onClick={() => { setModeles(null); charger() }}>Relire DocuSign</Bouton>
        <Bouton taille="sm" icone={<Plug />} disabled={occupe} onClick={() => agir(async () => { await installerConnect() }, "Retours DocuSign branchés : les signatures remonteront toutes seules.")}>Brancher les retours DocuSign</Bouton>
        <Bouton taille="sm" variante="plein" icone={<Save />} disabled={!change} chargement={occupe} onClick={enregistrer}>Enregistrer le pack</Bouton>
      </>}>Contrats à faire signer</TitreCarte>
      <div className="px-5 pb-5">
        <p className="text-legende text-encre-2">Les modèles de ton compte DocuSign. Coche ceux qui forment le pack envoyé depuis un dossier déposé, et range-les dans l'ordre. L'artisan signe d'abord, STC ensuite.</p>
        {erreur ? <Bandeau role="alerte" className="mt-3" action={<Bouton taille="sm" variante="discret" onClick={() => setErreur("")}>Fermer</Bouton>}>{erreur}</Bandeau> : null}
        {info ? <Bandeau role="ok" className="mt-3" action={<Bouton taille="sm" variante="discret" onClick={() => setInfo("")}>Fermer</Bouton>}>{info}</Bandeau> : null}
        {modeles === null ? <Chargement texte="Lecture des modèles DocuSign…" /> : modeles.length === 0 ? (
          <Vide titre="Aucun modèle dans ce compte DocuSign" texte={compte === "réel" ? "Crée tes modèles dans DocuSign (Modèles › Nouveau), puis reviens ici." : "Les modèles de ton compte réel ne sont pas dans le bac à sable. Dans le compte réel : Modèles › ⋯ › Télécharger ; dans le compte Développeur : Modèles › Importer. Puis « Relire DocuSign »."} />
        ) : (
          <ul className="mt-3 divide-y divide-fond-4 border-t border-trait">
            {tries.map((m) => {
              const i = ordre(m.templateId)
              const artisan = roleArtisan(m.roles)
              const autres = m.roles.filter((r) => r !== artisan)
              return (
                <li key={m.templateId} className="flex items-center gap-3 py-2">
                  <span className="chiffres w-6 shrink-0 text-legende text-encre-2">{i >= 0 ? i + 1 : ""}</span>
                  <Case texte="" checked={i >= 0} onChange={() => basculer(m.templateId)} />
                  <span className="min-w-0 flex-1">
                    <span className={"block truncate text-legende font-medium " + (i >= 0 ? "text-encre" : "text-encre-2")}>{m.nom}</span>
                    <span className="block truncate text-colonne text-encre-2">
                      {artisan ? <>signe : <b className="font-medium">{artisan.roleName}</b>{autres.length ? ` puis ${autres.map((r) => r.roleName).join(", ")}` : ""} · {artisan.champs.length ? `${artisan.champs.length} champ${artisan.champs.length > 1 ? "s" : ""} à remplir : ${artisan.champs.join(", ")}` : "aucun champ à remplir"}</> : <span className="text-alerte">aucun signataire dans ce modèle</span>}
                    </span>
                  </span>
                  {i >= 0 ? <>
                    <Bouton taille="sm" variante="discret" icone={<ArrowUp />} disabled={i === 0} onClick={() => bouger(m.templateId, -1)} title="Monter">{""}</Bouton>
                    <Bouton taille="sm" variante="discret" icone={<ArrowDown />} disabled={i === pack.length - 1} onClick={() => bouger(m.templateId, 1)} title="Descendre">{""}</Bouton>
                  </> : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Carte>
  )
}
