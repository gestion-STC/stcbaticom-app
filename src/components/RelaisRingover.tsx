// Les appels entrants à la seconde (17/11/2026) : l'adresse à coller dans Ringover (Développeurs › Webhooks), et la preuve
// que ça marche (le dernier événement reçu). Le code secret vit dans la base (parametres.ringover_webhook_cle), jamais
// dans le code ni dans un message.
import { useEffect, useState } from "react"
import { Copy, RefreshCw } from "lucide-react"
import { Bouton } from "../ui"
import { supabase } from "../lib/supabase"
import { lireParametre } from "../lib/parametresDb"

export default function RelaisRingover() {
  const [adresse, setAdresse] = useState<string | null>(null)
  const [dernier, setDernier] = useState<string | null | undefined>(undefined)
  const [copie, setCopie] = useState(false)
  const [erreur, setErreur] = useState("")
  const lire = () => {
    lireParametre("ringover_webhook_cle").then((cle) => setAdresse(cle ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ringover-webhook?cle=${cle}` : "")).then(() => setErreur("")).catch((e) => setErreur(e instanceof Error ? e.message : String(e)))
    supabase?.from("appels_entrants").select("cree_le").order("cree_le", { ascending: false }).limit(1).maybeSingle()
      .then(({ data, error }) => { if (error) setErreur(error.message); else setDernier((data as { cree_le?: string } | null)?.cree_le ?? null) })
  }
  useEffect(lire, [])
  return (
    <section className="mt-10 max-w-[720px] space-y-3">
      <h2 className="text-sous-titre font-semibold text-encre">Appels entrants à la seconde</h2>
      <p className="text-legende text-encre-2">Pour que la fiche de l'agence s'ouvre dès que le téléphone sonne : dans Ringover, <b className="font-medium text-encre">Développeurs › Webhooks</b>, ajoute cette adresse et coche les événements d'appel (sonnerie, décroché, raccroché).</p>
      {adresse === null ? <p className="text-colonne text-encre-2">Lecture…</p> : adresse ? (
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-4 bg-fond-2 px-3 py-2 text-colonne">{adresse.replace(/cle=.*/, "cle=••••••••")}</code>
          <Bouton taille="sm" icone={<Copy />} onClick={() => { void navigator.clipboard.writeText(adresse).then(() => { setCopie(true); setTimeout(() => setCopie(false), 2000) }, () => setErreur("Copie impossible : autorise le presse-papiers.")) }}>{copie ? "Copiée" : "Copier l'adresse"}</Bouton>
        </div>
      ) : <p className="text-colonne text-attention">Le relais n'a pas encore de code secret : il doit être posé côté serveur.</p>}
      <p className="flex items-center gap-2 text-colonne text-encre-2">
        {dernier === undefined ? "…" : dernier ? <>Dernier appel reçu par le relais : <b className="font-medium text-encre">{new Date(dernier).toLocaleString("fr-FR")}</b></> : "Aucun appel reçu par le relais pour l'instant."}
        <Bouton taille="sm" variante="discret" icone={<RefreshCw />} onClick={lire}>Relire</Bouton>
      </p>
      {erreur ? <p className="text-colonne text-alerte">{erreur}</p> : null}
    </section>
  )
}
