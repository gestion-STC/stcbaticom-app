import { useEffect, useState, type FormEvent } from "react"
import type { Session } from "@supabase/supabase-js"
import { KeyRound, Loader2, Plus, RefreshCw, Copy, Check, ShieldCheck, Headset, PenLine } from "lucide-react"
import {
  ROLES,
  LIBELLE_ROLE,
  estAdmin,
  listerComptes,
  creerCompte,
  changerRole,
  renommerCompte,
  validerNouveauCompte,
  genererMotDePasse,
  type Compte,
  type Role,
} from "../lib/comptes"

// Onglet « Comptes » (Mahdi, 07/10/2026) : ouvrir des comptes et donner un rôle.
// Visible et utilisable par les administrateurs seulement ; la fonction serveur
// refuse de toute façon un téléprospecteur.

const dateCourte = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—"

const dateHeure = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "jamais"

export default function Comptes({ session }: { session: Session | null }) {
  const admin = estAdmin(session)
  const [comptes, setComptes] = useState<Compte[]>([])
  // Rien à charger pour un non-administrateur : on ne part pas en « chargement ».
  const [chargement, setChargement] = useState(admin)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState<string | null>(null) // id du compte dont le rôle change
  // Le compte dont on est en train de modifier le nom (celui qui signe les e-mails).
  const [renommage, setRenommage] = useState<{ id: string; nom: string } | null>(null)

  // Formulaire de création
  const [nom, setNom] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<Role>("telepro")
  const [motDePasse, setMotDePasse] = useState(() => genererMotDePasse())
  const [creation, setCreation] = useState(false)
  const [erreurForm, setErreurForm] = useState<string | null>(null)
  // Le dernier compte créé, avec son mot de passe : affiché UNE fois, à transmettre.
  const [dernier, setDernier] = useState<{ email: string; motDePasse: string } | null>(null)
  const [copie, setCopie] = useState(false)

  useEffect(() => {
    if (!admin) return
    listerComptes()
      .then(setComptes)
      .catch((e) => setErreur(e instanceof Error ? e.message : "Chargement impossible"))
      .finally(() => setChargement(false))
  }, [admin])

  async function creer(e: FormEvent) {
    e.preventDefault()
    const candidat = { nom, email, role, motDePasse }
    const refus = validerNouveauCompte(candidat)
    if (refus) {
      setErreurForm(refus)
      return
    }
    setErreurForm(null)
    setCreation(true)
    try {
      const compte = await creerCompte(candidat)
      setComptes((liste) => [...liste, compte].sort((a, b) => a.email.localeCompare(b.email)))
      setDernier({ email: compte.email, motDePasse })
      setNom("")
      setEmail("")
      setRole("telepro")
      setMotDePasse(genererMotDePasse())
    } catch (err) {
      setErreurForm(err instanceof Error ? err.message : "Création impossible")
    } finally {
      setCreation(false)
    }
  }

  async function changer(compte: Compte, nouveau: Role) {
    if (compte.role === nouveau) return
    setEnCours(compte.id)
    setErreur(null)
    try {
      const maj = await changerRole(compte.id, nouveau)
      setComptes((liste) => liste.map((c) => (c.id === maj.id ? maj : c)))
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Changement impossible")
    } finally {
      setEnCours(null)
    }
  }

  async function renommer() {
    if (!renommage) return
    const nom = renommage.nom.trim()
    if (!nom) {
      setErreur("Le nom ne peut pas être vide.")
      return
    }
    setEnCours(renommage.id)
    setErreur(null)
    try {
      const maj = await renommerCompte(renommage.id, nom)
      setComptes((liste) => liste.map((c) => (c.id === maj.id ? maj : c)))
      setRenommage(null)
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Renommage impossible")
    } finally {
      setEnCours(null)
    }
  }

  async function copier(texte: string) {
    try {
      await navigator.clipboard.writeText(texte)
      setCopie(true)
      setTimeout(() => setCopie(false), 1500)
    } catch {
      // presse-papiers refusé : le texte reste sélectionnable à l'écran
    }
  }

  if (!admin) {
    return (
      <div className="mx-8 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        <p className="flex items-center gap-2 font-medium text-slate-900">
          <KeyRound size={16} className="text-slate-400" /> Réservé aux administrateurs
        </p>
        <p className="mt-1">Ton compte est un compte téléprospecteur : il ne peut pas ouvrir de comptes.</p>
      </div>
    )
  }

  return (
    <div className="mx-8 space-y-6">
      {erreur && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p>{erreur}</p>
          <button type="button" onClick={() => setErreur(null)} className="text-xs font-medium text-red-700 underline">
            Fermer
          </button>
        </div>
      )}

      {/* Les comptes existants */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Comptes</h2>
          <span className="text-xs text-slate-500">
            {chargement ? "…" : `${comptes.length} compte${comptes.length > 1 ? "s" : ""}`}
          </span>
        </header>
        {chargement ? (
          <div className="flex items-center gap-2 px-5 py-6 text-sm text-slate-400">
            <Loader2 size={16} className="animate-spin" /> Chargement…
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-2 font-medium">Nom</th>
                <th className="px-5 py-2 font-medium">E-mail</th>
                <th className="px-5 py-2 font-medium">Rôle</th>
                <th className="px-5 py-2 font-medium">Dernière connexion</th>
                <th className="px-5 py-2 font-medium">Créé le</th>
              </tr>
            </thead>
            <tbody>
              {comptes.map((c) => {
                const moi = c.id === session?.user?.id
                return (
                  <tr key={c.id} className="border-t border-slate-100">
                    <td className="px-5 py-2.5 font-medium text-slate-900">
                      {renommage?.id === c.id ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault()
                            void renommer()
                          }}
                          className="flex items-center gap-2"
                        >
                          <input
                            id={`nom-${c.id}`}
                            aria-label={`Nom de ${c.email}`}
                            autoFocus
                            value={renommage.nom}
                            onChange={(e) => setRenommage({ id: c.id, nom: e.target.value })}
                            onKeyDown={(e) => e.key === "Escape" && setRenommage(null)}
                            className="w-44 rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-violet-400 focus:outline-none"
                          />
                          <button type="submit" disabled={enCours === c.id} className="rounded-lg bg-violet-600 px-2 py-1 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-60">
                            {enCours === c.id ? "…" : "OK"}
                          </button>
                          <button type="button" onClick={() => setRenommage(null)} className="text-xs text-slate-500 hover:text-slate-800">
                            Annuler
                          </button>
                        </form>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          {c.nom || <span className="text-slate-400">—</span>}
                          {moi && <span className="text-xs text-slate-400">(toi)</span>}
                          <button
                            type="button"
                            title="Modifier le nom (celui qui signe les e-mails)"
                            aria-label={`Modifier le nom de ${c.email}`}
                            onClick={() => setRenommage({ id: c.id, nom: c.nom })}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          >
                            <PenLine size={13} />
                          </button>
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-slate-700">{c.email}</td>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        {enCours === c.id ? (
                          <Loader2 size={14} className="animate-spin text-slate-400" />
                        ) : c.role === "admin" ? (
                          <ShieldCheck size={14} className="text-violet-600" />
                        ) : (
                          <Headset size={14} className="text-slate-400" />
                        )}
                        <select
                          id={`role-${c.id}`}
                          aria-label={`Rôle de ${c.email}`}
                          value={c.role ?? ""}
                          disabled={enCours === c.id}
                          onChange={(e) => changer(c, e.target.value as Role)}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800 focus:border-violet-400 focus:outline-none"
                        >
                          {c.role === null && <option value="">Sans rôle</option>}
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {LIBELLE_ROLE[r]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-5 py-2.5 text-slate-600">{dateHeure(c.derniereConnexion)}</td>
                    <td className="px-5 py-2.5 text-slate-600">{dateCourte(c.creeLe)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Ouvrir un compte */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <header className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Ouvrir un compte</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Le mot de passe est à transmettre à la personne : il n'est affiché qu'une fois, juste après la création.
          </p>
        </header>

        {dernier && (
          <div className="mx-5 mt-4 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm">
            <p className="font-medium text-violet-900">Compte créé : {dernier.email}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-violet-800">Mot de passe :</span>
              <code className="select-all rounded bg-white px-2 py-0.5 font-mono text-violet-900">{dernier.motDePasse}</code>
              <button
                type="button"
                onClick={() => copier(`${dernier.email}\n${dernier.motDePasse}`)}
                className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-white px-2 py-1 text-xs font-medium text-violet-800 hover:bg-violet-100"
              >
                {copie ? <Check size={13} /> : <Copy size={13} />} {copie ? "Copié" : "Copier identifiants"}
              </button>
            </div>
          </div>
        )}

        <form onSubmit={creer} className="grid gap-4 px-5 py-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Nom</span>
            <input
              id="compte-nom"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Prénom Nom"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">E-mail</span>
            <input
              id="compte-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom@stcbatiment.fr"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
            />
          </label>

          <fieldset className="text-sm">
            <legend className="font-medium text-slate-700">Rôle</legend>
            <div className="mt-1 flex gap-2">
              {ROLES.map((r) => (
                <label
                  key={r}
                  className={
                    "flex flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 " +
                    (role === r ? "border-violet-400 bg-violet-50 text-violet-900" : "border-slate-200 text-slate-700 hover:bg-slate-50")
                  }
                >
                  <input
                    id={`compte-role-${r}`}
                    type="radio"
                    name="role"
                    value={r}
                    checked={role === r}
                    onChange={() => setRole(r)}
                    className="accent-violet-600"
                  />
                  {r === "admin" ? <ShieldCheck size={14} /> : <Headset size={14} />}
                  {LIBELLE_ROLE[r]}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {role === "admin"
                ? "Peut ouvrir des comptes et changer les rôles."
                : "Travaille dans le logiciel, sans accès aux comptes."}
            </p>
          </fieldset>

          <label className="block text-sm">
            <span className="font-medium text-slate-700">Mot de passe</span>
            <div className="mt-1 flex gap-2">
              <input
                id="compte-mot-de-passe"
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm focus:border-violet-400 focus:outline-none"
              />
              <button
                type="button"
                title="Proposer un autre mot de passe"
                onClick={() => setMotDePasse(genererMotDePasse())}
                className="rounded-lg border border-slate-200 px-3 text-slate-600 hover:bg-slate-50"
              >
                <RefreshCw size={14} />
              </button>
            </div>
            <span className="mt-1 block text-xs text-slate-500">Au moins 10 caractères. Proposé sans lettres ambiguës, modifiable.</span>
          </label>

          {erreurForm && <p className="text-sm text-red-600 md:col-span-2">{erreurForm}</p>}

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={creation}
              className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
            >
              {creation ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              Créer le compte
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
