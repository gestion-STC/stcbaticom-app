// ════════════════════════════════════════════════════════════════════════════
// RÉGLAGES › NUMÉROS D'APPEL — la réserve des numéros d'émission Ringover :
// ajout, pause, retrait, et pour chacun la jauge des appels sortants du jour
// face au seuil « spam ». Même logique qu'avant (paramètres `numeros_emission`
// et `quota_appels_jour`, comptage sur les activités), habillage dans la
// trousse STC (09/10/2026).
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from "react"
import { Pause, Phone, Play, Plus, Trash2 } from "lucide-react"
import { chargerNumerosComplet, enregistrerNumerosComplet, normaliser, type NumeroEmission } from "../lib/numerosEmission"
import { compterAppelsDuJourParNumero } from "../demarchage/db"
import { lireParametre, ecrireParametre } from "../lib/parametresDb"
import { supabaseConfigure } from "../lib/supabase"
import { Bandeau, Bouton, Carte, Champ, Chargement, Pastille, Tableau, Td, Th, TitreCarte, Tr, Vide } from "../ui"

const QUOTA_DEFAUT = 100 // appels/jour/numéro recommandés pour rester sous le radar « spam »

// La jauge compare sur les 9 derniers chiffres : « +33 1 84 80 77 86 » et « 01 84 80 77 86 » sont le même numéro.
const finDeNumero = (n: string) => normaliser(n).slice(-9)
function parFinDeNumero(m: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>()
  for (const [k, v] of m) out.set(k.slice(-9), (out.get(k.slice(-9)) ?? 0) + v)
  return out
}

export default function NumerosManager() {
  const [numeros, setNumeros] = useState<NumeroEmission[]>([])
  const [saisie, setSaisie] = useState("")
  const [chargement, setChargement] = useState(supabaseConfigure)
  const [enregistre, setEnregistre] = useState(false)
  const [erreur, setErreur] = useState<string | null>(supabaseConfigure ? null : "Supabase non configuré.")
  // Jauge d'usage : appels passés AUJOURD'HUI par numéro (clé = chiffres du numéro).
  const [usage, setUsage] = useState<Map<string, number>>(new Map())
  const [quota, setQuota] = useState(QUOTA_DEFAUT)

  useEffect(() => {
    if (!supabaseConfigure) return
    chargerNumerosComplet()
      .then(setNumeros)
      .catch((e) => setErreur(e instanceof Error ? e.message : "Erreur inconnue"))
      .finally(() => setChargement(false))
    lireParametre("quota_appels_jour")
      .then((v) => {
        const n = Number(v)
        if (Number.isFinite(n) && n >= 10) setQuota(n)
      })
      .catch(() => {})
    // Usage du jour : les appels SORTANTS réels (les activités du démarchage), par numéro
    // d'émission vraiment utilisé. Un appel entrant ne « spamme » pas, il n'est pas compté.
    // Rafraîchi toutes les 60 s (la jauge avance pendant tes sessions).
    const majUsage = () =>
      compterAppelsDuJourParNumero(new Date())
        .then((m) => setUsage(parFinDeNumero(m)))
        .catch(() => {})
    majUsage()
    const iv = setInterval(majUsage, 60000)
    return () => clearInterval(iv)
  }, [])

  // La mention « Enregistré » s'efface seule après 1,5 s.
  useEffect(() => {
    if (!enregistre) return
    const t = setTimeout(() => setEnregistre(false), 1500)
    return () => clearTimeout(t)
  }, [enregistre])

  async function sauver(liste: NumeroEmission[]) {
    setNumeros(liste)
    try {
      await enregistrerNumerosComplet(liste)
      setEnregistre(true)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Enregistrement impossible")
    }
  }

  function ajouter() {
    const n = saisie.trim()
    if (!n) return
    // Évite le doublon (comparaison sur les chiffres).
    if (numeros.some((x) => normaliser(x.numero) === normaliser(n))) {
      setSaisie("")
      return
    }
    void sauver([...numeros, { numero: n, pause: false }])
    setSaisie("")
  }

  function retirer(numero: string) {
    void sauver(numeros.filter((x) => x.numero !== numero))
  }

  // Met en pause / réactive un numéro (le retire / le remet dans la rotation, sans le supprimer).
  function basculerPause(numero: string) {
    void sauver(numeros.map((x) => (x.numero === numero ? { ...x, pause: !x.pause } : x)))
  }

  function changerQuota(v: string) {
    const n = Math.max(10, Math.min(500, Number(v) || QUOTA_DEFAUT))
    setQuota(n)
    ecrireParametre("quota_appels_jour", String(n)).catch(() => {})
  }

  const nbActifs = numeros.filter((n) => !n.pause).length
  const enPause = numeros.some((n) => n.pause)
  // Numéros actifs ayant atteint le seuil du jour (à mettre en pause).
  const auSeuil = useMemo(
    () => numeros.filter((n) => !n.pause && (usage.get(finDeNumero(n.numero)) ?? 0) >= quota),
    [numeros, usage, quota],
  )

  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-legende text-encre-2">
        Les numéros Ringover avec lesquels on appelle. Le logiciel répartit les appels entre eux : chaque agence garde toujours le même numéro, et
        aucun ne dépasse le seuil du jour.
      </p>

      {/* Le mémo anti-spam, en deux phrases : la règle et le piège. */}
      <Bandeau role="info">
        Au-delà du seuil, les opérateurs marquent le numéro « spam » et les agences décrochent moins : à 100 %, mets-le en pause jusqu'à demain.
        N'ajoute ici que des numéros attribués à <b>ton</b> utilisateur Ringover ; celui d'un collègue ferait sonner son poste à ta place.
      </Bandeau>

      {erreur ? (
        <Bandeau role="alerte" action={<Bouton taille="sm" variante="discret" onClick={() => setErreur(null)}>Fermer</Bouton>}>
          {erreur}
        </Bandeau>
      ) : null}

      {auSeuil.length > 0 ? (
        <Bandeau role="alerte">
          <b>{auSeuil.map((n) => n.numero).join(", ")}</b> {auSeuil.length > 1 ? "ont" : "a"} atteint les {quota} appels aujourd'hui — mets-
          {auSeuil.length > 1 ? "les" : "le"} en pause jusqu'à demain.
        </Bandeau>
      ) : null}

      <Carte>
        <TitreCarte
          droite={
            <>
              {enregistre ? <Pastille role="fait" point>Enregistré</Pastille> : null}
              <label className="flex items-center gap-2 text-legende text-encre-2">
                Seuil par jour et par numéro
                <Champ
                  type="number"
                  min={10}
                  max={500}
                  value={quota}
                  onChange={(e) => setQuota(Number(e.target.value) || 0)}
                  onBlur={(e) => changerQuota(e.target.value)}
                  className="chiffres w-20"
                />
              </label>
            </>
          }
        >
          Mes numéros d'émission
        </TitreCarte>

        {/* Ajout */}
        <div className="flex flex-wrap items-center gap-2 px-5 pb-4">
          <Champ
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") ajouter() }}
            placeholder="+33 1 84 80 77 86"
            inputMode="tel"
            className="chiffres max-w-[280px]"
          />
          <Bouton variante="plein" icone={<Plus />} disabled={!saisie.trim()} onClick={ajouter}>Ajouter</Bouton>
        </div>

        {/* Liste */}
        {chargement ? (
          <Chargement texte="Lecture des numéros…" />
        ) : numeros.length === 0 ? (
          <Vide titre="Aucun numéro" texte="Ajoute ton premier numéro ci-dessus pour pouvoir appeler." />
        ) : (
          <Tableau className="pb-2">
            <thead>
              <tr>
                <Th>Numéro</Th>
                <Th className="w-[130px]">État</Th>
                <Th className="w-[300px]">Aujourd'hui</Th>
                <Th className="w-[220px]" />
              </tr>
            </thead>
            <tbody>
              {numeros.map((n) => {
                const compte = usage.get(finDeNumero(n.numero)) ?? 0
                const pct = quota > 0 ? Math.min(100, Math.round((compte / quota) * 100)) : 0
                const plein = compte >= quota
                return (
                  <Tr key={n.numero}>
                    <Td>
                      <span className={"inline-flex items-center gap-2 font-medium " + (n.pause ? "text-encre-3 line-through" : "text-encre")}>
                        <Phone size={14} className={n.pause ? "text-encre-3" : "text-encre-2"} />
                        <span className="chiffres">{n.numero}</span>
                      </span>
                    </Td>
                    <Td>
                      {n.pause ? (
                        <Pastille role="inerte">En pause</Pastille>
                      ) : plein ? (
                        <Pastille role="probleme" point>Seuil atteint</Pastille>
                      ) : (
                        <Pastille role="fait" point>En rotation</Pastille>
                      )}
                    </Td>
                    <Td>
                      {/* Jauge d'usage du jour (appels passés aujourd'hui avec ce numéro) */}
                      {n.pause ? (
                        <span className="text-colonne text-encre-3">Hors rotation</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-fond-3" role="progressbar" aria-valuemin={0} aria-valuemax={quota} aria-valuenow={compte}>
                            <div className={"h-full rounded-full transition-all " + (plein ? "bg-alerte" : "bg-action")} style={{ width: `${pct}%` }} />
                          </div>
                          <span className={"chiffres shrink-0 text-colonne " + (plein ? "font-medium text-alerte" : "text-encre-2")}>
                            {compte} / {quota}
                          </span>
                        </div>
                      )}
                    </Td>
                    <Td className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <Bouton
                          taille="sm"
                          variante={!n.pause && plein ? "danger" : "contour"}
                          icone={n.pause ? <Play /> : <Pause />}
                          title={n.pause ? "Remettre dans la rotation" : "Mettre en pause (garde le numéro, ne l'utilise plus)"}
                          onClick={() => basculerPause(n.numero)}
                        >
                          {n.pause ? "Réactiver" : "Pause"}
                        </Bouton>
                        <Bouton taille="sm" variante="discret" icone={<Trash2 />} className="text-encre-2 hover:text-alerte" onClick={() => retirer(n.numero)}>
                          Retirer
                        </Bouton>
                      </div>
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
          </Tableau>
        )}

        {!chargement && nbActifs <= 1 ? (
          <div className="px-5 pb-4">
            <Bandeau role="attention">
              {nbActifs === 0
                ? "Aucun numéro actif : ajoute-en un (ou réactive un numéro en pause) pour pouvoir appeler."
                : "Avec un seul numéro actif, il n'y a pas de rotation. Ajoute-en 2 ou 3 (ou réactive) pour répartir tes appels et éviter le « spam »."}
            </Bandeau>
          </div>
        ) : null}
        {enPause ? (
          <p className="px-5 pb-4 text-colonne text-encre-2">
            Les numéros en pause restent enregistrés mais ne servent plus à appeler. Leurs agences sont <b>bloquées</b> (jamais appelées avec un autre
            numéro) jusqu'à la réactivation — ou réattribution consciente depuis leur fiche en session.
          </p>
        ) : null}
      </Carte>
    </div>
  )
}
