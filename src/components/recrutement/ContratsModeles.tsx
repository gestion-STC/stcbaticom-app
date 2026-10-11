// ════════════════════════════════════════════════════════════════════════════
// RÉGLAGES → RECRUTEMENT → « CONTRATS » (11/10/2026)
//
// Les PDF que « Envoyer les contrats » fait signer, dans l'ordre. Ils vivent
// dans le bucket privé `contrats/modeles`. Un modèle inactif reste là mais ne
// part plus. Et le bouton « Brancher les retours DocuSign », à cliquer une fois.
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useRef, useState } from "react"
import { Download, Plug, Trash2, Upload } from "lucide-react"
import { chargerModeles, deposerModele, installerConnect, lienModele, majModele, supprimerModele, type ModeleContrat } from "../../lib/contratsDb"
import { Bandeau, Bouton, Carte, Case, Chargement, TitreCarte, Vide } from "../../ui"

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export default function ContratsModeles() {
  const [modeles, setModeles] = useState<ModeleContrat[] | null>(null)
  const [erreur, setErreur] = useState("")
  const [info, setInfo] = useState("")
  const [occupe, setOccupe] = useState(false)
  const fichier = useRef<HTMLInputElement>(null)

  const charger = useCallback(async () => {
    try { setModeles(await chargerModeles()) } catch (e) { setErreur(message(e)) }
  }, [])
  useEffect(() => { const t = setTimeout(charger, 0); return () => clearTimeout(t) }, [charger])

  const agir = async (f: () => Promise<void>, ok: string) => {
    setOccupe(true); setErreur(""); setInfo("")
    try { await f(); setInfo(ok); await charger() }
    catch (e) { setErreur(message(e)) }
    finally { setOccupe(false) }
  }
  const deposer = (liste: FileList | null) => {
    const f = liste?.[0]
    if (!f) return
    if (!/\.pdf$/i.test(f.name)) { setErreur("Seuls les PDF sont acceptés."); return }
    const ordre = (modeles?.length ?? 0) + 1
    agir(() => deposerModele(f, f.name.replace(/\.pdf$/i, ""), ordre), `« ${f.name} » déposé : il partira en position ${ordre}.`)
    if (fichier.current) fichier.current.value = ""
  }
  const ouvrir = async (m: ModeleContrat) => {
    try { window.open(await lienModele(m.chemin), "_blank", "noopener") } catch (e) { setErreur(message(e)) }
  }

  return (
    <Carte>
      <TitreCarte droite={<>
        <input ref={fichier} type="file" accept="application/pdf" className="hidden" onChange={(e) => deposer(e.target.files)} />
        <Bouton taille="sm" icone={<Plug />} disabled={occupe} onClick={() => agir(async () => { await installerConnect() }, "Retours DocuSign branchés : les signatures remonteront toutes seules.")}>Brancher les retours DocuSign</Bouton>
        <Bouton taille="sm" icone={<Upload />} disabled={occupe} onClick={() => fichier.current?.click()}>Déposer un PDF</Bouton>
      </>}>Contrats à faire signer</TitreCarte>
      <div className="px-5 pb-5">
        <p className="text-legende text-encre-2">Les PDF envoyés par « Envoyer les contrats », dans cet ordre. L'artisan signe en bas à gauche de la dernière page de chacun, STC en bas à droite.</p>
        {erreur ? <Bandeau role="alerte" className="mt-3" action={<Bouton taille="sm" variante="discret" onClick={() => setErreur("")}>Fermer</Bouton>}>{erreur}</Bandeau> : null}
        {info ? <Bandeau role="ok" className="mt-3" action={<Bouton taille="sm" variante="discret" onClick={() => setInfo("")}>Fermer</Bouton>}>{info}</Bandeau> : null}
        {modeles === null ? <Chargement /> : modeles.length === 0 ? (
          <Vide titre="Aucun contrat" texte="Dépose les PDF à faire signer : contrat cadre, charte, RIB à compléter…" action={<Bouton icone={<Upload />} onClick={() => fichier.current?.click()}>Déposer un PDF</Bouton>} />
        ) : (
          <ul className="mt-3 divide-y divide-fond-4 border-t border-trait">
            {modeles.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2">
                <span className="chiffres w-6 shrink-0 text-legende text-encre-2">{m.ordre}</span>
                <span className="min-w-0 flex-1">
                  <span className={"block truncate text-legende font-medium " + (m.actif ? "text-encre" : "text-encre-3 line-through")}>{m.nom}</span>
                  <span className="block truncate text-colonne text-encre-2">{m.chemin.replace(/^modeles\//, "")}</span>
                </span>
                <Case texte="part" checked={m.actif} onChange={(e) => agir(() => majModele(m.id, { actif: e.target.checked }), e.target.checked ? "Ce contrat partira." : "Ce contrat ne partira plus.")} />
                <Bouton taille="sm" variante="discret" icone={<Download />} onClick={() => ouvrir(m)}>Voir</Bouton>
                <Bouton taille="sm" variante="discret" icone={<Trash2 />} disabled={occupe} onClick={() => { if (confirm(`Retirer « ${m.nom} » ?`)) agir(() => supprimerModele(m), "Contrat retiré.") }}>Retirer</Bouton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Carte>
  )
}
