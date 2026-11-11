import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react"
import type { Session } from "@supabase/supabase-js"
import { Check, ChevronRight, Copy, KeyRound, Loader2, Mail, Phone, RefreshCw, Search, X } from "lucide-react"
import { chargerFonctions, FONCTIONS, LIBELLE_FONCTION, poserFonction, type Fonction, type FonctionsParCompte } from "../lib/fonctionsComptes"
import { attribuerNumero, chargerNumerosComplet, enregistrerNumerosComplet, libererNumero, numerosDe, type NumeroEmission } from "../lib/numerosEmission"
import {
  ROLES,
  LIBELLE_ROLE,
  estAdmin,
  initialesDe,
  listerComptes,
  creerCompte,
  changerRole,
  renommerCompte,
  nouveauMotDePasse,
  poserAdresseDediee,
  validerNouveauCompte,
  genererMotDePasse,
  type Compte,
  type Role,
} from "../lib/comptes"
import { DOMAINES_RECEPTION, validerAdresseDediee } from "../lib/boitesMail"
import { CADRE, FENETRE, PETIT_GRIS, PETITE, PIED_FENETRE, PILULE_CLAIRE, PILULE_NOIRE, ROND_MINI, SOUS_TITRE, TITRE_PAGE, bascule } from "./agenda/dessinBureau"

// ════════════════════════════════════════════════════════════════════════════
// RÉGLAGES › ÉQUIPE (Mahdi, 07/10/2026 ; redessinée le 11/11/2026 comme la page des comptes du bureau de
// STC Bâtiment, src/pages/admin/AdminAdminsPage.tsx : « quand ce sera passé sur le logiciel, il faut que
// ce soit pareil »). La liste de l'équipe en rangées (nom, adresse, ce que la personne voit, état) ; un clic
// ouvre la fiche de la personne à droite : informations, Ringover, adresse e-mail dédiée, compte d'accès.
//
// Tout ce que faisait l'ancienne page reste : ouvrir un compte, le rôle (administrateur / téléprospecteur,
// tenu par le serveur), le nom qui signe les e-mails, un nouveau mot de passe (affiché une fois), la fonction
// (commercial / recrutement / direction), les numéros Ringover de chacun (Ringover fait sonner le
// PROPRIÉTAIRE du numéro : chacun appelle avec le sien).
// Nouveau (11/11/2026) : l'ADRESSE E-MAIL DÉDIÉE (prenom@crm.stcbatiment.fr, le champ email_reception de
// STC Bâtiment) : les mails reçus à cette adresse arrivent dans SA boîte, ses mails du démarchage partent
// d'elle. Réservé aux administrateurs ; le serveur le revérifie.
// ════════════════════════════════════════════════════════════════════════════

const CHAMP = "h-[34px] w-full rounded-[8px] border-[0.5px] border-[#E4E4E7] bg-white px-3 text-[13px] text-[#111113] outline-none placeholder:text-[#A1A1A6] focus:border-[#111113] disabled:bg-[#F6F6F7] disabled:text-[#6B6B70]"
const LIBELLE = "mb-1 block text-[11px] text-[#8E8E93]"
const TITRE_BLOC = "text-[13px] font-semibold text-[#111113]"
const BANDEAU = "flex flex-wrap items-center gap-3 rounded-[10px] bg-[#F6F6F7] px-3.5 py-2.5 text-[13px]"
const DOMAINE = DOMAINES_RECEPTION[0]

type Onglet = "tous" | Role
type Identifiants = { email: string; motDePasse: string; mode: "cree" | "reinitialise" }

const dateCourte = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—"
const dateHeure = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "jamais"

function Avatar({ nom, grand = false }: { nom: string; grand?: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[#F2F2F4] font-semibold text-[#3C3C40] ${grand ? "h-10 w-10 text-[13px]" : "h-9 w-9 text-[12px]"}`}>
      {initialesDe(nom)}
    </span>
  )
}

function Point({ couleur }: { couleur: string }) {
  return <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: couleur }} />
}

function Bloc({ titre, children, droite }: { titre: string; children: ReactNode; droite?: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className={TITRE_BLOC}>{titre}</h3>
        {droite}
      </div>
      {children}
    </section>
  )
}

/** Le mot de passe, affiché UNE fois, à transmettre (il ne se relit pas ensuite). */
function BandeauIdentifiants({ id, onFermer }: { id: Identifiants; onFermer: () => void }) {
  const [copie, setCopie] = useState(false)
  async function copier() {
    try {
      await navigator.clipboard.writeText(`${id.email}\n${id.motDePasse}`)
      setCopie(true)
      setTimeout(() => setCopie(false), 1500)
    } catch {
      // presse-papiers refusé : le texte reste sélectionnable
    }
  }
  return (
    <div className={BANDEAU}>
      <Point couleur="#1F8A4C" />
      <span className="min-w-0 flex-1">
        {id.mode === "cree" ? "Compte créé : " : "Nouveau mot de passe pour "}
        <span className="font-medium">{id.email}</span> · mot de passe{" "}
        <code className="select-all rounded-[6px] bg-white px-1.5 py-0.5 font-mono text-[12px]">{id.motDePasse}</code>
        <span className="ml-1.5 text-[#8E8E93]">(affiché une seule fois)</span>
      </span>
      <button type="button" className={`${PILULE_CLAIRE} ${PETITE}`} onClick={() => void copier()}>
        {copie ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copie ? "Copié" : "Copier"}
      </button>
      <button type="button" className={`${PILULE_CLAIRE} ${PETITE}`} onClick={onFermer}>Fermer</button>
    </div>
  )
}

export default function Comptes({ session }: { session: Session | null }) {
  const admin = estAdmin(session)
  const moi = session?.user?.id ?? ""
  const [comptes, setComptes] = useState<Compte[]>([])
  const [chargement, setChargement] = useState(admin)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState<string | null>(null)
  // Ce que fait chaque personne (12/10/2026) : seuls les commerciaux sont au classement du démarchage.
  const [fonctions, setFonctions] = useState<FonctionsParCompte>({})
  // Les numéros Ringover (la réserve, avec le compte de chacun). null = pas encore lue : on n'écrit rien.
  const [numeros, setNumeros] = useState<NumeroEmission[] | null>(null)
  const [recherche, setRecherche] = useState("")
  const [onglet, setOnglet] = useState<Onglet>("tous")
  const [ouvertId, setOuvertId] = useState<string | null>(null)
  const [creation, setCreation] = useState(false)
  const [identifiants, setIdentifiants] = useState<Identifiants | null>(null)
  const [aReinitialiser, setAReinitialiser] = useState<Compte | null>(null)

  useEffect(() => {
    if (!admin) return
    chargerFonctions().then(setFonctions).catch(() => undefined)
    chargerNumerosComplet().then(setNumeros).catch((e) => setErreur(`Numéros Ringover illisibles : ${e instanceof Error ? e.message : "erreur"}`))
    listerComptes()
      .then(setComptes)
      .catch((e) => setErreur(e instanceof Error ? e.message : "Chargement impossible"))
      .finally(() => setChargement(false))
  }, [admin])

  const nbAdmins = comptes.filter((c) => c.role === "admin").length
  const nbTelepro = comptes.filter((c) => c.role === "telepro").length
  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return comptes.filter((c) => (onglet === "tous" || c.role === onglet) && (!q || `${c.nom} ${c.email} ${c.emailReception ?? ""}`.toLowerCase().includes(q)))
  }, [comptes, recherche, onglet])
  const ouvert = comptes.find((c) => c.id === ouvertId) ?? null

  const remplacer = (maj: Compte) => setComptes((l) => l.map((c) => (c.id === maj.id ? { ...c, ...maj } : c)))

  async function agir(compte: Compte, action: () => Promise<void>, refus: string) {
    setEnCours(compte.id)
    setErreur(null)
    try {
      await action()
    } catch (err) {
      setErreur(err instanceof Error ? err.message : refus)
    } finally {
      setEnCours(null)
    }
  }

  const changer = (c: Compte, role: Role) => c.role !== role && agir(c, async () => remplacer(await changerRole(c.id, role)), "Changement impossible")
  const changerFonction = (c: Compte, v: string) => agir(c, async () => setFonctions(await poserFonction(c.id, v ? (v as Fonction) : null)), "Fonction non enregistrée")
  const renommer = (c: Compte, nom: string) => {
    if (!nom.trim()) return setErreur("Le nom ne peut pas être vide.")
    if (nom.trim() === c.nom) return
    return agir(c, async () => remplacer(await renommerCompte(c.id, nom)), "Renommage impossible")
  }
  const poserAdresse = (c: Compte, saisie: string) => {
    const v = validerAdresseDediee(saisie)
    if (!v.ok) return setErreur(v.erreur)
    if ((v.adresse ?? null) === (c.emailReception ?? null)) return
    return agir(c, async () => remplacer(await poserAdresseDediee(c.id, v.adresse ?? "")), "Adresse non enregistrée")
  }
  const majNumeros = (c: Compte, calcul: (l: NumeroEmission[]) => NumeroEmission[]) => {
    if (!numeros) return
    return agir(c, async () => {
      const suite = calcul(numeros)
      await enregistrerNumerosComplet(suite)
      setNumeros(suite)
    }, "Numéro non enregistré")
  }
  // Un mot de passe perdu ne se retrouve pas : on en pose un nouveau, affiché une fois.
  const reinitialiser = (c: Compte) => {
    const motDePasse = genererMotDePasse()
    setAReinitialiser(null)
    return agir(c, async () => {
      await nouveauMotDePasse(c.id, motDePasse)
      setIdentifiants({ email: c.email, motDePasse, mode: "reinitialise" })
    }, "Nouveau mot de passe impossible")
  }

  if (!admin) {
    return (
      <div className={`${CADRE} max-w-xl p-5`}>
        <p className="flex items-center gap-2 text-[13px] font-medium"><KeyRound className="h-4 w-4 text-[#8E8E93]" /> Réservé aux administrateurs</p>
        <p className={`${SOUS_TITRE}`}>Ton compte est un compte téléprospecteur : il ne peut pas ouvrir de comptes.</p>
      </div>
    )
  }

  return (
    <div className="text-[13px] text-[#111113]">
      {/* En-tête : le titre, le comptage, UNE action noire (STC). */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className={TITRE_PAGE}>Équipe</h1>
          <p className={SOUS_TITRE}>
            {chargement ? "…" : <><span className="tabular-nums">{nbTelepro}</span> téléprospecteur{nbTelepro > 1 ? "s" : ""} · <span className="tabular-nums">{nbAdmins}</span> administrateur{nbAdmins > 1 ? "s" : ""}</>}
          </p>
        </div>
        <button type="button" className={PILULE_NOIRE} onClick={() => setCreation(true)}>Nouveau compte</button>
      </div>

      <div className="mt-4 space-y-2">
        {identifiants && <BandeauIdentifiants id={identifiants} onFermer={() => setIdentifiants(null)} />}
        {erreur && (
          <div className={BANDEAU}>
            <Point couleur="#C9302C" />
            <span className="min-w-0 flex-1 text-[#C9302C]">{erreur}</span>
            <button type="button" className={`${PILULE_CLAIRE} ${PETITE}`} onClick={() => setErreur(null)}>Fermer</button>
          </div>
        )}
      </div>

      {/* La recherche et les familles de comptes, en pilules. */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-b-[0.5px] border-[#E6E6EA] pb-2.5">
        <label className="flex min-w-[220px] flex-1 items-center gap-2">
          <Search className="h-[13px] w-[13px] shrink-0 text-[#8E8E93]" strokeWidth={2} />
          <input aria-label="Rechercher une personne" placeholder="Nom, adresse de connexion ou adresse dédiée…" value={recherche} onChange={(e) => setRecherche(e.target.value)}
            className="h-7 min-w-0 flex-1 border-0 bg-transparent text-[13px] outline-none placeholder:text-[#A1A1A6]" />
        </label>
        <button type="button" aria-pressed={onglet === "tous"} className={bascule(onglet === "tous")} onClick={() => setOnglet("tous")}>Tout le monde</button>
        <button type="button" aria-pressed={onglet === "telepro"} className={bascule(onglet === "telepro")} onClick={() => setOnglet("telepro")}>
          Téléprospecteurs<span className={`ml-1.5 tabular-nums ${onglet === "telepro" ? "text-white/70" : "text-[#8E8E93]"}`}>{nbTelepro}</span>
        </button>
        <button type="button" aria-pressed={onglet === "admin"} className={bascule(onglet === "admin")} onClick={() => setOnglet("admin")}>
          Administrateurs<span className={`ml-1.5 tabular-nums ${onglet === "admin" ? "text-white/70" : "text-[#8E8E93]"}`}>{nbAdmins}</span>
        </button>
      </div>
      <p className={`${PETIT_GRIS} mt-2`}>
        {onglet === "telepro"
          ? "Un téléprospecteur ne voit dans la boîte des gestionnaires que ses mails : ceux de son adresse dédiée et de ses agences."
          : onglet === "admin"
            ? "Un administrateur voit tous les mails, ouvre les comptes et change les rôles."
            : "Un clic sur une personne ouvre sa fiche : rôle, numéro Ringover, adresse e-mail dédiée, mot de passe."}
      </p>

      {/* Les comptes en LIGNES, comme STC : nom et adresse de connexion, adresse dédiée, Ringover, état. */}
      <div className="mt-3 divide-y-[0.5px] divide-[#E6E6EA] rounded-[10px] border-[0.5px] border-[#E6E6EA] bg-white">
        {chargement ? (
          <div className="flex items-center justify-center gap-2 py-12 text-[#8E8E93]"><Loader2 className="h-4 w-4 animate-spin" /> Lecture des comptes…</div>
        ) : visibles.length === 0 ? (
          <p className="py-12 text-center text-[#8E8E93]">{recherche.trim() ? "Aucune personne ne correspond" : "Aucun compte"}</p>
        ) : (
          visibles.map((c) => {
            const nums = numeros ? numerosDe(numeros, c.id) : []
            const sansNumero = numeros !== null && nums.length === 0 && (c.role === "telepro" || fonctions[c.id] === "commercial")
            return (
              <div key={c.id} role="button" tabIndex={0} onClick={() => setOuvertId(c.id)} onKeyDown={(e) => e.key === "Enter" && setOuvertId(c.id)}
                className="group flex min-w-0 cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-[#FAFAFB] lg:flex-nowrap">
                <Avatar nom={c.nom || c.email} />
                <div className="min-w-0 flex-1 basis-[160px]">
                  <p className="truncate font-medium">{c.nom || <span className="text-[#8E8E93]">Sans nom</span>}{c.id === moi && <span className="ml-1.5 font-normal text-[#8E8E93]">(toi)</span>}</p>
                  <p className="truncate text-[12px] text-[#6B6B70]">{c.email}</p>
                </div>
                <div className="w-52 shrink-0 truncate">
                  {c.role !== "admin" || c.emailReception ? (
                    c.emailReception
                      ? <span className="inline-flex items-center gap-1.5 text-[#3C3C40]"><Mail className="h-3.5 w-3.5 text-[#8E8E93]" strokeWidth={1.7} />{c.emailReception}</span>
                      : <span className="text-[#B26A00]">Pas d'adresse dédiée</span>
                  ) : <span className="text-[#8E8E93]">Voit tous les mails</span>}
                </div>
                <div className="w-32 shrink-0 truncate tabular-nums">
                  {nums.length ? <span className="inline-flex items-center gap-1.5 text-[#3C3C40]"><Phone className="h-3.5 w-3.5 text-[#8E8E93]" strokeWidth={1.7} />{nums[0].numero}{nums.length > 1 ? ` +${nums.length - 1}` : ""}</span>
                    : sansNumero ? <span className="text-[#B26A00]">Pas de numéro</span> : <span className="text-[#C7C7CC]">—</span>}
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-3">
                  <button type="button" className={`${PILULE_CLAIRE} ${PETITE} opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100`}
                    onClick={(e) => { e.stopPropagation(); setAReinitialiser(c) }}>Mot de passe</button>
                  <span className="inline-flex w-[118px] items-center gap-1.5 whitespace-nowrap text-[11px] text-[#6B6B70]">
                    <Point couleur={c.role ? (c.role === "admin" ? "#111113" : "#2F6FE0") : "#C7C7CC"} />
                    {c.role ? LIBELLE_ROLE[c.role] : "Sans rôle"}
                  </span>
                  <ChevronRight className="h-4 w-4 text-[#C7C7CC]" />
                </div>
              </div>
            )
          })
        )}
      </div>

      <datalist id="numeros-libres">
        {(numeros ?? []).filter((n) => !n.compteId).map((n) => <option key={n.numero} value={n.numero} />)}
      </datalist>

      {ouvert && (
        <FichePersonne
          c={ouvert} moi={moi} fonctions={fonctions} numeros={numeros} occupe={enCours === ouvert.id}
          onFermer={() => setOuvertId(null)}
          onRenommer={(nom) => void renommer(ouvert, nom)}
          onRole={(r) => void changer(ouvert, r)}
          onFonction={(f) => void changerFonction(ouvert, f)}
          onAdresse={(a) => void poserAdresse(ouvert, a)}
          onNumero={(calcul) => void majNumeros(ouvert, calcul)}
          onMotDePasse={() => setAReinitialiser(ouvert)}
        />
      )}

      {aReinitialiser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#111113]/20 p-4" onClick={() => setAReinitialiser(null)}>
          <div role="dialog" aria-label="Nouveau mot de passe" className={`${FENETRE} w-full max-w-[420px] overflow-hidden`} onClick={(e) => e.stopPropagation()}>
            <div className="px-[22px] pb-3 pt-[18px]">
              <p className="text-[13px] font-semibold">Nouveau mot de passe</p>
              <p className={`${PETIT_GRIS} mt-1 text-[12px]`}>
                Pour {aReinitialiser.nom || aReinitialiser.email}. L'ancien ne marchera plus ; le nouveau s'affiche une seule fois, à lui transmettre.
              </p>
            </div>
            <div className={PIED_FENETRE}>
              <button type="button" className={PILULE_CLAIRE} onClick={() => setAReinitialiser(null)}>Annuler</button>
              <button type="button" className={PILULE_NOIRE} onClick={() => void reinitialiser(aReinitialiser)}>Poser un nouveau mot de passe</button>
            </div>
          </div>
        </div>
      )}

      {creation && (
        <NouveauCompte
          numeros={numeros}
          onFermer={() => setCreation(false)}
          onCree={(compte, motDePasse, suiteNumeros, refusSuite) => {
            setComptes((l) => [...l, compte].sort((a, b) => a.email.localeCompare(b.email)))
            if (suiteNumeros) setNumeros(suiteNumeros)
            setIdentifiants({ email: compte.email, motDePasse, mode: "cree" })
            if (refusSuite) setErreur(refusSuite)
            setCreation(false)
          }}
        />
      )}
    </div>
  )
}

// ── La fiche d'une personne, à droite (le « Sheet » de STC) ──────────────────────
function FichePersonne({ c, moi, fonctions, numeros, occupe, onFermer, onRenommer, onRole, onFonction, onAdresse, onNumero, onMotDePasse }: {
  c: Compte
  moi: string
  fonctions: FonctionsParCompte
  numeros: NumeroEmission[] | null
  occupe: boolean
  onFermer: () => void
  onRenommer: (nom: string) => void
  onRole: (r: Role) => void
  onFonction: (f: string) => void
  onAdresse: (a: string) => void
  onNumero: (calcul: (l: NumeroEmission[]) => NumeroEmission[]) => void
  onMotDePasse: () => void
}) {
  const [ajout, setAjout] = useState("")
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === "Escape" && onFermer()
    window.addEventListener("keydown", f)
    return () => window.removeEventListener("keydown", f)
  }, [onFermer])
  const nums = numeros ? numerosDe(numeros, c.id) : []
  const prenom = (c.nom || c.email).trim().split(/\s+/)[0]

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Fiche de ${c.nom || c.email}`}>
      <div className="absolute inset-0 bg-[#111113]/20" onClick={onFermer} />
      <aside className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-[0_20px_60px_rgba(17,17,19,.18)] sm:max-w-lg">
        <div className="flex items-center gap-3 border-b-[0.5px] border-[#E6E6EA] px-6 py-4">
          <Avatar nom={c.nom || c.email} grand />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-semibold tracking-[-0.01em]">{c.nom || c.email}</p>
            <p className={`${PETIT_GRIS} truncate`}>{c.role ? LIBELLE_ROLE[c.role] : "Sans rôle"}{c.id === moi ? " · toi" : ""}</p>
          </div>
          {occupe && <Loader2 className="h-4 w-4 animate-spin text-[#8E8E93]" />}
          <button type="button" aria-label="Fermer" className={ROND_MINI} onClick={onFermer}><X className="h-3.5 w-3.5" strokeWidth={1.7} /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-6 py-6">
          <Bloc titre="Informations">
            <div className="space-y-3">
              <label className="block">
                <span className={LIBELLE}>Nom (celui qui signe les e-mails)</span>
                <input key={`nom-${c.id}-${c.nom}`} className={CHAMP} defaultValue={c.nom} placeholder="Prénom Nom"
                  onBlur={(e) => onRenommer(e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
              </label>
              <label className="block">
                <span className={LIBELLE}>E-mail de connexion</span>
                <input className={CHAMP} value={c.email} disabled readOnly />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className={LIBELLE}>Rôle</span>
                  <select className={CHAMP} value={c.role ?? ""} disabled={occupe} onChange={(e) => onRole(e.target.value as Role)}>
                    {c.role === null && <option value="">Sans rôle</option>}
                    {ROLES.map((r) => <option key={r} value={r}>{LIBELLE_ROLE[r]}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className={LIBELLE}>Fonction</span>
                  <select className={CHAMP} value={fonctions[c.id] ?? ""} disabled={occupe} onChange={(e) => onFonction(e.target.value)}>
                    <option value="">À préciser</option>
                    {FONCTIONS.map((f) => <option key={f} value={f}>{LIBELLE_FONCTION[f]}</option>)}
                  </select>
                </label>
              </div>
              <p className={PETIT_GRIS}>
                {c.role === "admin" ? "Administrateur : voit tous les mails, ouvre les comptes et change les rôles." : "Téléprospecteur : travaille dans le logiciel, sans accès aux comptes ; ne voit que ses mails."}
                {" "}Seuls les « Commercial » sont au classement du démarchage.
              </p>
            </div>
          </Bloc>

          {/* L'adresse e-mail dédiée (comme STC Bâtiment, option B du 09/08) */}
          <Bloc titre="Adresse e-mail dédiée">
            <div className={`${CADRE} space-y-2 p-3`}>
              <p className="text-[12px] text-[#6B6B70]">
                Les e-mails envoyés à cette adresse (sur <strong className="font-medium text-[#111113]">@{DOMAINE}</strong>) arrivent dans la boîte de {prenom}, et ses mails
                aux gestionnaires partent d'elle (les réponses lui reviennent). Laisser vide = pas d'adresse dédiée : ses mails partent de contact@.
              </p>
              <input key={`er-${c.id}-${c.emailReception ?? ""}`} className={CHAMP} defaultValue={c.emailReception ?? ""} placeholder={`prenom@${DOMAINE}`} disabled={occupe}
                aria-label="Adresse e-mail dédiée" onBlur={(e) => onAdresse(e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
              <p className={PETIT_GRIS}>Le recrutement garde son adresse commune, recrutement@{DOMAINE}.</p>
            </div>
          </Bloc>

          <Bloc titre="Ringover">
            <div className="space-y-2">
              <p className={PETIT_GRIS}>Ringover fait sonner le propriétaire du numéro : {prenom} n'appelle qu'avec les siens, depuis Ringover ouvert sur son ordinateur avec son compte.</p>
              {numeros === null ? <p className={PETIT_GRIS}>…</p> : (
                <div className="flex flex-wrap gap-1.5">
                  {nums.map((n) => (
                    <span key={n.numero} className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-[#F2F2F4] pl-2.5 pr-1 tabular-nums">
                      <Phone className="h-3 w-3 text-[#8E8E93]" strokeWidth={1.8} />{n.numero}{n.pause ? " (en pause)" : ""}
                      <button type="button" title="Retirer ce numéro de ce compte" aria-label={`Retirer ${n.numero}`} disabled={occupe} onClick={() => onNumero((l) => libererNumero(l, n.numero))} className={ROND_MINI}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  {nums.length === 0 && <span className="text-[#B26A00]">Aucun numéro : il ne peut pas appeler depuis la session.</span>}
                </div>
              )}
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (ajout.trim()) { onNumero((l) => attribuerNumero(l, ajout, c.id)); setAjout("") } }}>
                <input className={`${CHAMP} tabular-nums`} value={ajout} onChange={(e) => setAjout(e.target.value)} placeholder="01 89 … — un de ses numéros Ringover" list="numeros-libres" aria-label="Ajouter un numéro Ringover" disabled={numeros === null} />
                <button type="submit" className={PILULE_CLAIRE} disabled={!ajout.trim() || occupe || numeros === null}>Ajouter</button>
              </form>
            </div>
          </Bloc>

          <Bloc titre="Compte d'accès">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-[12px]">
                <p><span className={LIBELLE}>Dernière connexion</span><span className="tabular-nums">{dateHeure(c.derniereConnexion)}</span></p>
                <p><span className={LIBELLE}>Créé le</span><span className="tabular-nums">{dateCourte(c.creeLe)}</span></p>
              </div>
              <button type="button" className={`${PILULE_CLAIRE} w-full`} onClick={onMotDePasse} disabled={occupe}>
                <KeyRound className="h-3.5 w-3.5" strokeWidth={1.8} /> Poser un nouveau mot de passe
              </button>
              <p className={PETIT_GRIS}>Un mot de passe perdu ne se relit pas : on en pose un nouveau, affiché une fois, à transmettre.</p>
            </div>
          </Bloc>
        </div>
      </aside>
    </div>
  )
}

// ── Ouvrir un compte (la fenêtre « Nouveau compte ») ─────────────────────────────
function NouveauCompte({ numeros, onFermer, onCree }: {
  numeros: NumeroEmission[] | null
  onFermer: () => void
  onCree: (compte: Compte, motDePasse: string, suiteNumeros: NumeroEmission[] | null, refusSuite: string | null) => void
}) {
  const [nom, setNom] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<Role>("telepro")
  const [numeroRingover, setNumeroRingover] = useState("")
  const [adresse, setAdresse] = useState("")
  const [motDePasse, setMotDePasse] = useState(() => genererMotDePasse())
  const [envoi, setEnvoi] = useState(false)
  const [refus, setRefus] = useState<string | null>(null)

  async function creer(e: FormEvent) {
    e.preventDefault()
    const candidat = { nom, email, role, motDePasse }
    const r = validerNouveauCompte(candidat)
    if (r) return setRefus(r)
    const a = validerAdresseDediee(adresse)
    if (!a.ok) return setRefus(a.erreur)
    if (numeroRingover.trim() && !numeros) return setRefus("La liste des numéros Ringover n'est pas lue : recharge la page avant de créer le compte.")
    // Vérifié AVANT de créer le compte : un numéro incomplet ou déjà pris ne doit pas laisser un compte à moitié réglé.
    if (numeroRingover.trim() && numeros) {
      try { attribuerNumero(numeros, numeroRingover, "verification") } catch (err) { return setRefus(err instanceof Error ? err.message : String(err)) }
    }
    setRefus(null)
    setEnvoi(true)
    try {
      let compte = await creerCompte(candidat)
      const manques: string[] = []
      let suite: NumeroEmission[] | null = null
      if (numeroRingover.trim() && numeros) {
        try {
          suite = attribuerNumero(numeros, numeroRingover, compte.id)
          await enregistrerNumerosComplet(suite)
        } catch (err) {
          suite = null
          manques.push(`le numéro Ringover (${err instanceof Error ? err.message : "erreur"})`)
        }
      }
      if (a.adresse) {
        try { compte = { ...compte, ...(await poserAdresseDediee(compte.id, a.adresse)) } } catch (err) { manques.push(`l'adresse dédiée (${err instanceof Error ? err.message : "erreur"})`) }
      }
      onCree(compte, motDePasse, suite, manques.length ? `Compte créé, mais pas enregistré : ${manques.join(" ; ")}. Réglez-le dans sa fiche.` : null)
    } catch (err) {
      setRefus(err instanceof Error ? err.message : "Création impossible")
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#111113]/20 p-4" onClick={onFermer}>
      <form role="dialog" aria-label="Nouveau compte" onSubmit={creer} className={`${FENETRE} flex max-h-full w-full max-w-[480px] flex-col overflow-hidden`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-[22px] pb-2 pt-[18px]">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold">Nouveau compte</p>
            <p className={`${PETIT_GRIS} mt-0.5`}>Le mot de passe est à transmettre à la personne : il ne s'affiche qu'une fois, juste après la création.</p>
          </div>
          <button type="button" aria-label="Fermer" className={ROND_MINI} onClick={onFermer}><X className="h-3.5 w-3.5" strokeWidth={1.7} /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-[22px] py-3">
          <label className="block"><span className={LIBELLE}>Nom complet</span>
            <input id="compte-nom" className={CHAMP} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Prénom Nom" autoFocus />
          </label>
          <label className="block"><span className={LIBELLE}>E-mail de connexion *</span>
            <input id="compte-email" type="email" required className={CHAMP} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@stcbatiment.fr" />
          </label>
          <div>
            <span className={LIBELLE}>Rôle</span>
            <div className="flex gap-2">
              {ROLES.map((r) => (
                <button key={r} type="button" aria-pressed={role === r} className={bascule(role === r)} onClick={() => setRole(r)}>{LIBELLE_ROLE[r]}</button>
              ))}
            </div>
            <p className={`${PETIT_GRIS} mt-1`}>{role === "admin" ? "Peut ouvrir des comptes et changer les rôles ; voit tous les mails." : "Travaille dans le logiciel, sans accès aux comptes ; ne voit que ses mails."}</p>
          </div>
          <label className="block"><span className={LIBELLE}>Adresse e-mail dédiée (facultatif)</span>
            <input className={CHAMP} value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder={`prenom@${DOMAINE}`} />
          </label>
          <label className="block"><span className={LIBELLE}>Numéro Ringover (facultatif)</span>
            <input id="compte-numero-ringover" className={`${CHAMP} tabular-nums`} value={numeroRingover} onChange={(e) => setNumeroRingover(e.target.value)} placeholder="01 89 … — créé dans Ringover avant" list="numeros-libres" />
          </label>
          <div>
            <span className={LIBELLE}>Mot de passe généré (au moins 10 caractères, sans lettres ambiguës)</span>
            <div className="flex gap-2">
              <input id="compte-mot-de-passe" className={`${CHAMP} font-mono`} value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
              <button type="button" className={PILULE_CLAIRE} title="Proposer un autre mot de passe" onClick={() => setMotDePasse(genererMotDePasse())}>
                <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.8} /> Générer
              </button>
            </div>
          </div>
          {refus && <p className="text-[12px] text-[#C9302C]">{refus}</p>}
        </div>
        <div className={PIED_FENETRE}>
          <button type="button" className={PILULE_CLAIRE} onClick={onFermer}>Annuler</button>
          <button type="submit" className={PILULE_NOIRE} disabled={envoi}>{envoi && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Créer le compte</button>
        </div>
      </form>
    </div>
  )
}
