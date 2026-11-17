// Qui va recevoir (lot 4, 17/11/2026) : toute l'audience, avec la raison de chaque exclusion, une recherche, et
// « Retirer » / « Remettre » pour CETTE campagne seulement (la fiche garde son étape).
import { useMemo, useState } from "react"
import { Bouton, Champ } from "../../../ui"
import { Bloc } from "../../demarchage/aujourdhui/courtier"
import type { Contact } from "../../../prospection/modele"

type Vue = "recoit" | "exclus" | "retires"
const PAGE = 100

export default function ListeAudience({ contacts, raison, onBasculer, unite }: { contacts: Contact[]; raison: (k: Contact) => string | null; onBasculer: (id: string) => void; unite: string }) {
  const [q, setQ] = useState("")
  const [vue, setVue] = useState<Vue>("recoit")
  const [max, setMax] = useState(PAGE)
  const lignes = useMemo(() => contacts.map((k) => ({ k, r: raison(k) })), [contacts, raison])
  const compte = { recoit: lignes.filter((l) => !l.r).length, exclus: lignes.filter((l) => l.r && l.r !== "Retiré de cette campagne").length, retires: lignes.filter((l) => l.r === "Retiré de cette campagne").length }
  const n = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  const visibles = lignes.filter((l) => (vue === "recoit" ? !l.r : vue === "retires" ? l.r === "Retiré de cette campagne" : l.r && l.r !== "Retiré de cette campagne"))
    .filter((l) => !q.trim() || n([l.k.nom, l.k.personne, l.k.email, l.k.champs.secteur, l.k.champs.etape, l.k.champs.enseigne].join(" ")).includes(n(q.trim())))
  const onglet = (id: Vue, libelle: string) => <button type="button" onClick={() => { setVue(id); setMax(PAGE) }} className={`h-7 rounded-full px-3 text-colonne ${vue === id ? "bg-fond-4 font-medium text-encre" : "text-encre-2 hover:bg-fond-3"}`}>{libelle} · {compte[id].toLocaleString("fr-FR")}</button>
  return (
    <Bloc titre="5 · Qui va recevoir" droite={<span className="chiffres text-colonne text-encre"><b className="font-medium">{compte.recoit.toLocaleString("fr-FR")}</b> {unite}</span>}>
      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">{onglet("recoit", "Recevront")}{onglet("exclus", "Exclus")}{onglet("retires", "Retirés à la main")}<span className="ml-auto w-60"><Champ value={q} placeholder="Agence, gestionnaire, secteur, étape…" aria-label="Chercher dans l'audience" onChange={(e) => setQ(e.target.value)} /></span></div>
        {visibles.length ? (
          <div className="divide-y-[0.5px] divide-trait rounded-4 border-[0.5px] border-trait">
            {visibles.slice(0, max).map(({ k, r }) => (
              <div key={k.id} className="flex items-center gap-3 px-3 py-1.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-legende text-encre">{k.nom}{k.personne ? <span className="text-encre-2"> · {k.personne}</span> : null}</div>
                  <div className="truncate text-colonne text-encre-2">{[k.champs.secteur, k.champs.etape, k.email || "sans mail"].filter(Boolean).join(" · ")}{r ? <span className="text-attention"> · {r}</span> : null}</div>
                </div>
                {!r || r === "Retiré de cette campagne" ? <Bouton taille="sm" onClick={() => onBasculer(k.id)}>{r ? "Remettre" : "Retirer"}</Bouton> : null}
              </div>
            ))}
          </div>
        ) : <p className="text-colonne text-encre-2">Personne ici.</p>}
        {visibles.length > max ? <Bouton taille="sm" onClick={() => setMax((m) => m + PAGE)}>Voir {Math.min(PAGE, visibles.length - max)} de plus (sur {visibles.length.toLocaleString("fr-FR")})</Bouton> : null}
        <p className="text-colonne text-encre-2">« Retirer » sort la fiche de cette campagne seulement : son étape et ses autres campagnes ne changent pas. Si elle avait déjà commencé, ses envois s'arrêtent et reprennent si tu la remets. Enregistre pour appliquer.</p>
      </div>
    </Bloc>
  )
}
