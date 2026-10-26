import { useEffect, useState, type FormEvent } from "react"
import type { Session } from "@supabase/supabase-js"
import { KeyRound, Loader2, Plus, RefreshCw, Copy, Check, ShieldCheck, Headset, PenLine, Phone, X } from "lucide-react"
import { chargerFonctions, FONCTIONS, LIBELLE_FONCTION, poserFonction, type Fonction, type FonctionsParCompte } from "../lib/fonctionsComptes"
import { attribuerNumero, chargerNumerosComplet, enregistrerNumerosComplet, libererNumero, numerosDe, type NumeroEmission } from "../lib/numerosEmission"
import {
  ROLES,
  LIBELLE_ROLE,
  estAdmin,
  listerComptes,
  creerCompte,
  changerRole,
  renommerCompte,
  nouveauMotDePasse,
  validerNouveauCompte,
  genererMotDePasse,
  type Compte,
  type Role,
} from "../lib/comptes"
import { Bandeau, Bouton, Carte, Champ, Chargement, Etiquette, Pastille, Selecteur, Tableau, Td, Th, TitreCarte, Tr } from "../ui"

// « Comptes » (Mahdi, 07/10/2026 ; rangé dans Réglages › Équipe et passé à la trousse le 24/10) : ouvrir des comptes et donner un rôle.
// Visible et utilisable par les administrateurs seulement ; la fonction serveur
// refuse de toute façon un téléprospecteur.
//
// Le numéro Ringover de chaque compte (Mahdi, 14/10) : Ringover fait sonner le PROPRIÉTAIRE
// du numéro qui appelle. Chaque téléprospecteur a donc son propre numéro, réglé ici (à la
// création ou ensuite) ; la session de call n'appelle qu'avec les numéros de la personne connectée.

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
  // Ce que fait chaque personne (12/10/2026) : commercial, recrutement, direction.
  // Seuls les commerciaux apparaissent au classement du démarchage.
  const [fonctions, setFonctions] = useState<FonctionsParCompte>({})
  // Le compte dont on est en train de modifier le nom (celui qui signe les e-mails).
  const [renommage, setRenommage] = useState<{ id: string; nom: string } | null>(null)
  // Les numéros Ringover (la réserve, avec le compte de chacun). null = pas encore lue : on n'écrit rien.
  const [numeros, setNumeros] = useState<NumeroEmission[] | null>(null)
  const [ajoutNumero, setAjoutNumero] = useState<{ id: string; numero: string } | null>(null)

  // Formulaire de création
  const [nom, setNom] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<Role>("telepro")
  const [numeroRingover, setNumeroRingover] = useState("")
  const [motDePasse, setMotDePasse] = useState(() => genererMotDePasse())
  const [creation, setCreation] = useState(false)
  const [erreurForm, setErreurForm] = useState<string | null>(null)
  // Le dernier compte créé, avec son mot de passe : affiché UNE fois, à transmettre.
  const [dernier, setDernier] = useState<{ email: string; motDePasse: string; mode: "cree" | "reinitialise" } | null>(null)
  const [copie, setCopie] = useState(false)

  useEffect(() => {
    if (!admin) return
    chargerFonctions().then(setFonctions).catch(() => undefined)
    chargerNumerosComplet().then(setNumeros).catch((e) => setErreur(`Numéros Ringover illisibles : ${e instanceof Error ? e.message : "erreur"}`))
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
    if (numeroRingover.trim() && !numeros) {
      setErreurForm("La liste des numéros Ringover n'est pas lue : recharge la page avant de créer le compte.")
      return
    }
    // Vérifié AVANT de créer le compte : un numéro incomplet ou déjà pris ne doit pas laisser un compte à moitié réglé.
    if (numeroRingover.trim() && numeros) {
      try { attribuerNumero(numeros, numeroRingover, "verification") } catch (err) { setErreurForm(err instanceof Error ? err.message : String(err)); return }
    }
    setErreurForm(null)
    setCreation(true)
    try {
      const compte = await creerCompte(candidat)
      setComptes((liste) => [...liste, compte].sort((a, b) => a.email.localeCompare(b.email)))
      if (numeroRingover.trim() && numeros) {
        try {
          const suite = attribuerNumero(numeros, numeroRingover, compte.id)
          await enregistrerNumerosComplet(suite)
          setNumeros(suite)
        } catch (err) {
          setErreur(`Compte créé, mais le numéro Ringover n'a pas été enregistré : ${err instanceof Error ? err.message : "erreur"}. Règle-le dans la liste ci-dessus.`)
        }
      }
      setNumeroRingover("")
      setDernier({ email: compte.email, motDePasse, mode: "cree" })
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

  async function changerFonction(compte: Compte, valeur: string) {
    setEnCours(compte.id)
    setErreur(null)
    try {
      setFonctions(await poserFonction(compte.id, valeur ? (valeur as Fonction) : null))
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Fonction non enregistrée")
    } finally {
      setEnCours(null)
    }
  }

  // Un mot de passe perdu ne se retrouve pas : on en pose un nouveau, affiché une fois.
  async function reinitialiser(compte: Compte) {
    const motDePasse = genererMotDePasse()
    setEnCours(compte.id)
    setErreur(null)
    try {
      await nouveauMotDePasse(compte.id, motDePasse)
      setDernier({ email: compte.email, motDePasse, mode: "reinitialise" })
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Nouveau mot de passe impossible")
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

  async function majNumeros(compte: Compte, calcul: (l: NumeroEmission[]) => NumeroEmission[]) {
    if (!numeros) return
    setEnCours(compte.id)
    setErreur(null)
    try {
      const suite = calcul(numeros)
      await enregistrerNumerosComplet(suite)
      setNumeros(suite)
      setAjoutNumero(null)
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Numéro non enregistré")
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
      <Carte className="max-w-xl p-5">
        <p className="flex items-center gap-2 text-corps font-medium text-encre">
          <KeyRound size={16} className="text-encre-3" /> Réservé aux administrateurs
        </p>
        <p className="mt-1 text-legende text-encre-2">Ton compte est un compte téléprospecteur : il ne peut pas ouvrir de comptes.</p>
      </Carte>
    )
  }

  return (
    <div className="space-y-6">
      {erreur ? (
        <Bandeau role="alerte" action={<Bouton taille="sm" variante="discret" onClick={() => setErreur(null)}>Fermer</Bouton>}>
          {erreur}
        </Bandeau>
      ) : null}

      {/* Les comptes existants */}
      <Carte>
        <TitreCarte droite={<span className="chiffres text-legende text-encre-2">{chargement ? "…" : `${comptes.length} compte${comptes.length > 1 ? "s" : ""}`}</span>}>
          Comptes
        </TitreCarte>
        {chargement ? (
          <Chargement />
        ) : (
          <Tableau className="pb-2">
            <thead>
              <tr>
                <Th>Nom</Th>
                <Th>E-mail</Th>
                <Th>Rôle</Th>
                <Th title="Ce que fait la personne. Seuls les commerciaux sont au classement du démarchage.">Fonction</Th>
                <Th title="Ringover fait sonner le propriétaire du numéro : chacun appelle avec le sien.">Numéro Ringover</Th>
                <Th>Dernière connexion</Th>
                <Th>Créé le</Th>
                <Th>Mot de passe</Th>
              </tr>
            </thead>
            <tbody>
              {comptes.map((c) => {
                const moi = c.id === session?.user?.id
                return (
                  <Tr key={c.id}>
                    <Td className="font-medium text-encre">
                      {renommage?.id === c.id ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault()
                            void renommer()
                          }}
                          className="flex items-center gap-2"
                        >
                          <Champ
                            id={`nom-${c.id}`}
                            aria-label={`Nom de ${c.email}`}
                            autoFocus
                            value={renommage.nom}
                            onChange={(e) => setRenommage({ id: c.id, nom: e.target.value })}
                            onKeyDown={(e) => e.key === "Escape" && setRenommage(null)}
                            className="w-44"
                          />
                          <Bouton type="submit" taille="sm" variante="plein" chargement={enCours === c.id}>OK</Bouton>
                          <Bouton taille="sm" variante="discret" onClick={() => setRenommage(null)}>Annuler</Bouton>
                        </form>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          {c.nom || <span className="text-encre-3">—</span>}
                          {moi && <span className="text-colonne font-normal text-encre-2">(toi)</span>}
                          <Bouton
                            taille="icone"
                            variante="discret"
                            className="h-7 w-7"
                            title="Modifier le nom (celui qui signe les e-mails)"
                            aria-label={`Modifier le nom de ${c.email}`}
                            onClick={() => setRenommage({ id: c.id, nom: c.nom })}
                            icone={<PenLine />}
                          />
                        </span>
                      )}
                    </Td>
                    <Td className="text-encre">{c.email}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        {enCours === c.id ? (
                          <Loader2 size={14} className="animate-spin text-encre-3" />
                        ) : c.role === "admin" ? (
                          <ShieldCheck size={14} className="text-signature" />
                        ) : (
                          <Headset size={14} className="text-encre-3" />
                        )}
                        <Selecteur
                          id={`role-${c.id}`}
                          aria-label={`Rôle de ${c.email}`}
                          value={c.role ?? ""}
                          disabled={enCours === c.id}
                          onChange={(e) => changer(c, e.target.value as Role)}
                          className="w-44"
                        >
                          {c.role === null && <option value="">Sans rôle</option>}
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {LIBELLE_ROLE[r]}
                            </option>
                          ))}
                        </Selecteur>
                      </div>
                    </Td>
                    <Td>
                      <Selecteur
                        id={`fonction-${c.id}`}
                        aria-label={`Fonction de ${c.email}`}
                        value={fonctions[c.id] ?? ""}
                        disabled={enCours === c.id}
                        onChange={(e) => void changerFonction(c, e.target.value)}
                        className="w-40"
                      >
                        <option value="">À préciser</option>
                        {FONCTIONS.map((f) => (
                          <option key={f} value={f}>
                            {LIBELLE_FONCTION[f]}
                          </option>
                        ))}
                      </Selecteur>
                    </Td>
                    <Td>
                      {numeros === null ? (
                        <span className="text-colonne text-encre-3">…</span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {numerosDe(numeros, c.id).map((n) => (
                            <span key={n.numero} className="chiffres inline-flex items-center gap-1 rounded-full bg-fond-3 px-2 py-0.5 text-colonne text-encre">
                              <Phone size={11} className="text-encre-2" /> {n.numero}{n.pause ? " (en pause)" : ""}
                              <button type="button" title="Retirer ce numéro de ce compte" aria-label={`Retirer ${n.numero} de ${c.email}`} disabled={enCours === c.id} onClick={() => void majNumeros(c, (l) => libererNumero(l, n.numero))} className="rounded-full p-0.5 text-encre-3 hover:bg-fond-4 hover:text-encre">
                                <X size={11} />
                              </button>
                            </span>
                          ))}
                          {numerosDe(numeros, c.id).length === 0 && (c.role === "telepro" || fonctions[c.id] === "commercial") ? (
                            <span title="Sans numéro à lui, ce compte ne peut pas appeler depuis la session.">
                              <Pastille role="probleme">pas de numéro</Pastille>
                            </span>
                          ) : null}
                          {ajoutNumero?.id === c.id ? (
                            <form onSubmit={(e) => { e.preventDefault(); void majNumeros(c, (l) => attribuerNumero(l, ajoutNumero.numero, c.id)) }} className="flex items-center gap-1">
                              <Champ autoFocus aria-label={`Numéro Ringover de ${c.email}`} value={ajoutNumero.numero} onChange={(e) => setAjoutNumero({ id: c.id, numero: e.target.value })} onKeyDown={(e) => e.key === "Escape" && setAjoutNumero(null)} placeholder="01 89 …" list="numeros-libres" className="chiffres w-36" />
                              <Bouton type="submit" taille="sm" variante="plein" disabled={enCours === c.id}>OK</Bouton>
                              <Bouton taille="sm" variante="discret" onClick={() => setAjoutNumero(null)}>Annuler</Bouton>
                            </form>
                          ) : (
                            <Bouton taille="sm" icone={<Plus />} onClick={() => setAjoutNumero({ id: c.id, numero: "" })}>numéro</Bouton>
                          )}
                        </div>
                      )}
                    </Td>
                    <Td className="chiffres text-encre-2">{dateHeure(c.derniereConnexion)}</Td>
                    <Td className="chiffres text-encre-2">{dateCourte(c.creeLe)}</Td>
                    <Td>
                      <Bouton
                        taille="sm"
                        title="Poser un nouveau mot de passe (l'ancien ne se relit pas)"
                        aria-label={`Nouveau mot de passe pour ${c.email}`}
                        disabled={enCours === c.id}
                        onClick={() => void reinitialiser(c)}
                        icone={<KeyRound />}
                      >
                        Nouveau
                      </Bouton>
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
          </Tableau>
        )}
      </Carte>

      <datalist id="numeros-libres">
        {(numeros ?? []).filter((n) => !n.compteId).map((n) => <option key={n.numero} value={n.numero} />)}
      </datalist>

      {/* Ouvrir un compte */}
      <Carte>
        <TitreCarte>Ouvrir un compte</TitreCarte>
        <p className="px-5 text-legende text-encre-2">
          Le mot de passe est à transmettre à la personne : il n'est affiché qu'une fois, juste après la création.
        </p>

        {dernier && (
          <div className="mx-5 mt-4">
            <Bandeau
              role="ok"
              action={
                <Bouton taille="sm" icone={copie ? <Check /> : <Copy />} onClick={() => copier(`${dernier.email}\n${dernier.motDePasse}`)}>
                  {copie ? "Copié" : "Copier identifiants"}
                </Bouton>
              }
            >
              <p className="font-medium">
                {dernier.mode === "cree" ? "Compte créé : " : "Nouveau mot de passe pour "}
                {dernier.email}
              </p>
              <p className="mt-0.5">
                Mot de passe : <code className="select-all rounded-3 bg-fond px-2 py-0.5 font-mono text-encre">{dernier.motDePasse}</code>
              </p>
            </Bandeau>
          </div>
        )}

        <form onSubmit={creer} className="grid gap-4 px-5 py-4 md:grid-cols-2">
          <Etiquette texte="Nom">
            <Champ id="compte-nom" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Prénom Nom" />
          </Etiquette>
          <Etiquette texte="E-mail">
            <Champ id="compte-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@stcbatiment.fr" />
          </Etiquette>

          <fieldset>
            <legend className="mb-1 text-legende font-medium text-encre">Rôle</legend>
            <div className="flex gap-2">
              {ROLES.map((r) => (
                <label
                  key={r}
                  className={
                    "flex flex-1 cursor-pointer items-center gap-2 rounded-6 border px-3 py-2 text-legende transition-colors " +
                    (role === r ? "border-action bg-fond-3 text-encre" : "border-trait text-encre-2 hover:bg-fond-3")
                  }
                >
                  <input id={`compte-role-${r}`} type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="accent-action" />
                  {r === "admin" ? <ShieldCheck size={14} /> : <Headset size={14} />}
                  {LIBELLE_ROLE[r]}
                </label>
              ))}
            </div>
            <p className="mt-1 text-colonne text-encre-2">
              {role === "admin" ? "Peut ouvrir des comptes et changer les rôles." : "Travaille dans le logiciel, sans accès aux comptes."}
            </p>
          </fieldset>

          <Etiquette texte="Mot de passe" aide="Au moins 10 caractères. Proposé sans lettres ambiguës, modifiable.">
            <div className="flex gap-2">
              <Champ id="compte-mot-de-passe" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} className="font-mono" />
              <Bouton taille="icone" title="Proposer un autre mot de passe" aria-label="Proposer un autre mot de passe" onClick={() => setMotDePasse(genererMotDePasse())} icone={<RefreshCw />} />
            </div>
          </Etiquette>

          <Etiquette
            texte="Numéro Ringover"
            aide="Le numéro de SON compte Ringover (créé dans Ringover avant). Ringover fait sonner le propriétaire du numéro : sans le sien, il ne pourra pas appeler depuis la session. Il devra ouvrir Ringover sur son ordinateur, connecté avec son compte."
          >
            <Champ id="compte-numero-ringover" value={numeroRingover} onChange={(e) => setNumeroRingover(e.target.value)} placeholder="01 89 …" list="numeros-libres" className="chiffres" />
          </Etiquette>

          {erreurForm && <p className="text-legende text-alerte md:col-span-2">{erreurForm}</p>}

          <div className="md:col-span-2">
            <Bouton type="submit" variante="plein" chargement={creation} icone={<Plus />}>
              Créer le compte
            </Bouton>
          </div>
        </form>
      </Carte>
    </div>
  )
}
