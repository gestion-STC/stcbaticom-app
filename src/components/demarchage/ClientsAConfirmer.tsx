// ════════════════════════════════════════════════════════════════════════════
// ORDRES DE SERVICE À CONFIRMER (10/10/2026) — la confirmation humaine.
//
// STC Bâtiment reçoit les ordres de service ; toutes les heures, la fonction
// serveur `synchro-clients` repère les gestionnaires qui en ont envoyé un et
// propose l'agence correspondante de notre base (e-mail, téléphone, nom,
// code postal). Rien ne devient client tout seul : ici, quelqu'un répond à la
// question « telle agence, a-t-elle bien envoyé l'ordre de service ? » (Mahdi).
// Quatre réponses : c'est elle · une autre agence · créer l'agence · ignorer.
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState, type FormEvent } from "react"
import { ArrowUpRight, Check, Plus, Search, X } from "lucide-react"
import { chargerAgences, chargerClientsAConfirmer, chargerSecteurs, confirmerClientSignale, creerAgenceCliente, ignorerClientSignale, type CandidatClient, type ClientSignale } from "../../demarchage/db"
import { libelleEtape, pastilleEtape, secteurDepuis, type Agence, type Secteur } from "../../demarchage/modele"
import { secteursParZone } from "../../demarchage/agencesOutils"
import { useSession } from "../../lib/auth"
import { nomAffiche } from "../../lib/comptes"
import { Bandeau, Bouton, Carte, Champ, Dialogue, Etiquette, Pastille, Selecteur, TitreCarte } from "../../ui"

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const dateCourte = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "date inconnue")
const s = (n: number) => (n > 1 ? "s" : "")

type Dialogue = { type: "autre" | "creer"; client: ClientSignale }

export default function ClientsAConfirmer({ onOuvrirAgence, onDecision }: { onOuvrirAgence?: (agenceId: string) => void; onDecision?: () => void }) {
  const session = useSession()
  const compteNom = nomAffiche(session)
  const [liste, setListe] = useState<ClientSignale[]>([])
  const [erreur, setErreur] = useState("")
  const [occupe, setOccupe] = useState(false)
  const [dialogue, setDialogue] = useState<Dialogue | null>(null)

  const charger = useCallback(async () => {
    try { setListe(await chargerClientsAConfirmer()) }
    catch (e) { setErreur(message(e)) }
  }, [])
  useEffect(() => {
    const t = setTimeout(charger, 0)
    return () => clearTimeout(t)
  }, [charger])

  const agir = async (f: () => Promise<void>) => {
    setOccupe(true); setErreur("")
    try { await f(); setDialogue(null); await charger(); onDecision?.() }
    catch (e) { setErreur(message(e)) }
    finally { setOccupe(false) }
  }
  const confirmer = (c: ClientSignale, agenceId: string) => agir(() => confirmerClientSignale(c, agenceId, compteNom))
  const ignorer = (c: ClientSignale) => agir(() => ignorerClientSignale(c.id, compteNom))

  if (liste.length === 0 && !erreur) return null

  return (
    <Carte className="mb-4">
      <TitreCarte droite={<span className="chiffres text-legende text-encre-2">{liste.length} à confirmer</span>}>Ordres de service à confirmer</TitreCarte>
      <p className="px-5 pb-3 text-legende text-encre-2">STC Bâtiment a reçu un ordre de service de ces gestionnaires. Dis-nous de quelle agence il s'agit : elle passera « Client », datée du premier OS.</p>
      {erreur ? <div className="px-5 pb-3"><Bandeau role="alerte" action={<Bouton taille="sm" variante="discret" onClick={() => setErreur("")}>Fermer</Bouton>}>{erreur}</Bandeau></div> : null}
      <ul className="border-t border-trait">
        {liste.map((c) => <LigneClient key={c.id} client={c} occupe={occupe} onConfirmer={(id) => confirmer(c, id)} onAutre={() => setDialogue({ type: "autre", client: c })} onCreer={() => setDialogue({ type: "creer", client: c })} onIgnorer={() => ignorer(c)} />)}
      </ul>

      {dialogue?.type === "autre" ? <DialogueAutreAgence client={dialogue.client} occupe={occupe} onFermer={() => setDialogue(null)} onChoisir={(id) => confirmer(dialogue.client, id)} onOuvrirAgence={onOuvrirAgence} /> : null}
      {dialogue?.type === "creer" ? <DialogueCreer client={dialogue.client} occupe={occupe} onFermer={() => setDialogue(null)} onCreer={(secteur) => agir(async () => { await creerAgenceCliente(dialogue.client, compteNom, secteur) })} /> : null}
    </Carte>
  )
}

/** Une proposition : le gestionnaire tel que STC Bâtiment le connaît, l'agence qu'on croit reconnaître, et les quatre réponses. */
function LigneClient({ client: c, occupe, onConfirmer, onAutre, onCreer, onIgnorer }: {
  client: ClientSignale; occupe: boolean; onConfirmer: (agenceId: string) => void; onAutre: () => void; onCreer: () => void; onIgnorer: () => void
}) {
  const [premier, ...autres] = c.candidats
  const nomsOs = c.nomsAgence.split("|").map((x) => x.trim()).filter((x) => x && x.toLowerCase() !== c.societe.toLowerCase())
  return (
    <li className="grid gap-3 border-b border-fond-4 px-5 py-3 last:border-b-0 lg:grid-cols-[1fr_1.2fr]">
      <div className="min-w-0">
        <p className="truncate text-corps font-semibold text-encre">{c.societe || c.nomsAgence.split("|")[0] || c.nom || "Gestionnaire sans nom"}</p>
        <p className="truncate text-legende text-encre-2">
          {c.nom ? <span className="text-encre">{c.nom}</span> : null}
          {c.nom && c.email ? " · " : ""}{c.email}
          {c.telephones[0] ? <span className="chiffres"> · {c.telephones[0]}</span> : null}
        </p>
        <p className="mt-1 text-legende text-encre-2">
          Premier OS{c.premierOsNumero ? <span className="chiffres"> n° {c.premierOsNumero}</span> : null} reçu le <span className="text-encre">{dateCourte(c.premierOsLe)}</span>
          {c.nbOs > 1 ? <> · <span className="chiffres">{c.nbOs}</span> OS au total</> : null}
          {c.codesPostaux ? <span className="chiffres"> · {c.codesPostaux.replace(/ \| /g, ", ")}</span> : null}
        </p>
        {nomsOs.length ? <p className="truncate text-colonne text-encre-2">Nom sur les OS : {nomsOs.join(", ")}</p> : null}
      </div>
      <div className="min-w-0">
        {premier ? (
          <>
            <p className="text-legende text-encre">
              Est-ce bien <b className="font-semibold">{premier.nom}</b>{premier.secteur ? <span className="chiffres text-encre-2"> ({premier.secteur})</span> : null} ?
            </p>
            <p className="text-colonne text-encre-2">{premier.raisons.join(" · ")}</p>
            {autres.length ? (
              <p className="mt-1 text-colonne text-encre-2">
                Sinon : {autres.map((a, i) => <span key={a.agenceId}>{i ? ", " : ""}<button type="button" className="underline-offset-2 hover:underline" disabled={occupe} onClick={() => onConfirmer(a.agenceId)} title={a.raisons.join(" · ")}>{a.nom}</button></span>)}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-legende text-encre-2">Aucune agence de la base ne ressemble à ce gestionnaire.</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {premier ? <Bouton taille="sm" icone={<Check />} disabled={occupe} onClick={() => onConfirmer(premier.agenceId)}>Oui, c'est elle</Bouton> : null}
          <Bouton taille="sm" variante="discret" icone={<Search />} disabled={occupe} onClick={onAutre}>{premier ? "Une autre agence…" : "Chercher l'agence…"}</Bouton>
          <Bouton taille="sm" variante="discret" icone={<Plus />} disabled={occupe} onClick={onCreer}>Créer l'agence cliente</Bouton>
          <Bouton taille="sm" variante="discret" icone={<X />} disabled={occupe} onClick={onIgnorer}>Ignorer</Bouton>
        </div>
      </div>
    </li>
  )
}

/** Chercher l'agence dans la base, quand la proposition ne convient pas. */
function DialogueAutreAgence({ client, occupe, onFermer, onChoisir, onOuvrirAgence }: {
  client: ClientSignale; occupe: boolean; onFermer: () => void; onChoisir: (agenceId: string) => void; onOuvrirAgence?: (agenceId: string) => void
}) {
  const [recherche, setRecherche] = useState(client.societe || client.nomsAgence.split("|")[0] || "")
  const [resultats, setResultats] = useState<Agence[] | null>(null)
  useEffect(() => {
    const r = recherche.trim()
    if (r.length < 2) { const t = setTimeout(() => setResultats([]), 0); return () => clearTimeout(t) }
    const t = setTimeout(() => { chargerAgences({ recherche: r, limite: 15 }).then(setResultats).catch(() => setResultats([])) }, 250)
    return () => clearTimeout(t)
  }, [recherche])
  return (
    <Dialogue titre="Quelle agence a envoyé cet ordre de service ?" description={`${client.societe || client.nom}${client.email ? ` · ${client.email}` : ""}`} onFermer={onFermer} pied={<Bouton onClick={onFermer}>Annuler</Bouton>}>
      <Champ value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Nom, téléphone, e-mail, adresse…" autoFocus aria-label="Chercher une agence" />
      <ul className="mt-3 max-h-80 overflow-y-auto rounded-4 border border-trait">
        {resultats === null ? <li className="px-3 py-2 text-legende text-encre-2">Recherche…</li> : null}
        {resultats?.length === 0 ? <li className="px-3 py-2 text-legende text-encre-2">Aucune agence ne correspond. Tu peux la créer depuis la carte.</li> : null}
        {resultats?.map((a) => (
          <li key={a.id} className="flex items-center gap-2 border-b border-fond-4 px-3 py-2 last:border-b-0">
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2"><span className="truncate text-legende font-medium text-encre">{a.nom}</span><Pastille role={pastilleEtape(a.etape)} className="shrink-0">{libelleEtape(a.etape)}</Pastille></span>
              <span className="block truncate text-colonne text-encre-2">{[a.secteurLibelle, a.telephone, a.email, a.contactPrincipal].filter(Boolean).join(" · ")}</span>
            </span>
            {onOuvrirAgence ? <Bouton taille="sm" variante="discret" icone={<ArrowUpRight />} onClick={() => onOuvrirAgence(a.id)}>Voir</Bouton> : null}
            <Bouton taille="sm" icone={<Check />} disabled={occupe} onClick={() => onChoisir(a.id)}>C'est elle</Bouton>
          </li>
        ))}
      </ul>
    </Dialogue>
  )
}

/** Créer l'agence quand elle n'est pas dans la base : elle naît cliente, avec le gestionnaire en contact. */
function DialogueCreer({ client, occupe, onFermer, onCreer }: { client: ClientSignale; occupe: boolean; onFermer: () => void; onCreer: (secteur: string | null) => void }) {
  const [secteurs, setSecteurs] = useState<Secteur[]>([])
  const [secteur, setSecteur] = useState(() => secteurDepuis(client.codesPostaux) ?? "")
  useEffect(() => {
    const t = setTimeout(() => { chargerSecteurs().then(setSecteurs).catch(() => setSecteurs([])) }, 0)
    return () => clearTimeout(t)
  }, [])
  const nom = (client.societe || client.nomsAgence.split("|")[0] || client.nom).trim()
  const valider = (e: FormEvent) => { e.preventDefault(); onCreer(secteur || null) }
  return (
    <Dialogue titre="Créer l'agence cliente" description="Elle entre dans la base directement en « Client », datée du premier ordre de service." onFermer={onFermer}
      pied={<><Bouton onClick={onFermer}>Annuler</Bouton><Bouton variante="plein" form="form-creer-cliente" type="submit" chargement={occupe}>Créer et confirmer</Bouton></>}>
      <form id="form-creer-cliente" onSubmit={valider} className="grid gap-3">
        <Etiquette texte="Nom"><Champ value={nom} readOnly /></Etiquette>
        <Etiquette texte="Secteur">
          <Selecteur value={secteur} onChange={(e) => setSecteur(e.target.value)}>
            <option value="">Sans secteur</option>
            {secteursParZone(secteurs).map((z) => <optgroup key={z.zone} label={z.zone}>{z.secteurs.map((x) => <option key={x.code} value={x.code}>{x.code} · {x.libelle}</option>)}</optgroup>)}
          </Selecteur>
        </Etiquette>
        <p className="text-colonne text-encre-2">
          Contact : {client.nom || "sans nom"}{client.email ? ` · ${client.email}` : ""}{client.telephones.length ? ` · ${client.telephones.length} téléphone${s(client.telephones.length)}` : ""}.
        </p>
      </form>
    </Dialogue>
  )
}

export type { CandidatClient }
