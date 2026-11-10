// LE MENU : le même que le bureau de STC Bâtiment (Mahdi, 10/11/2026), mesures et comportement compris, pour pouvoir
// y être intégré. Un rail d'icônes (60 px) et le panneau de la rubrique ouverte (196 px) ; au survol d'une icône, sa
// rubrique passe par-dessus ; à la première page de la session, les grands titres ; recherche : Ctrl K.
// Les styles (classes .mb-*) sont ceux du logiciel STC Bâtiment. La carte : src/lib/carteMenu.ts.
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { commercial } from "../data";
import { compterNonLus, EVENEMENT_LUS, type Espace } from "../lib/messagesDb";
import { seDeconnecter } from "../lib/auth";
import { initialesDe, nomAffiche, roleDeSession, LIBELLE_ROLE } from "../lib/comptes";
import { menuPour, type EntreeMenu, type GroupeMenu, type PageId } from "../lib/carteMenu";
import "./menuBureau.css";

export type { PageId };

type Rubrique = { cle: string; titre: string; icone: string; enBas?: boolean; groupes: GroupeMenu[] };

const CLE_REPLIE = "baticom-menu-replie";
const lireReplie = () => { try { return window.sessionStorage.getItem(CLE_REPLIE) === "1"; } catch { return false; } };
const ecrireReplie = (r: boolean) => { try { if (r) window.sessionStorage.setItem(CLE_REPLIE, "1"); else window.sessionStorage.removeItem(CLE_REPLIE); } catch { /* le menu marche quand même */ } };
const sansAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const ICONES: Record<string, string> = {
  "": "M4 14a8 8 0 0 1 16 0M12 14l4-4M3 18h18",
  Prospecter: "M3 11l18-8-8 18-2-8z",
  Suivre: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  Contacts: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 21a6 6 0 0 0-5-6",
  Analyser: "M4 19V9M10 19V5M16 19v-7M22 19H2",
};
const ICONE_REGLAGES = "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0";

function Icone({ trace, taille = 18, couleur = "#6B6B70" }: { trace: string; taille?: number; couleur?: string }) {
  return <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke={couleur} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={trace} /></svg>;
}

const QUATRE_CARRES = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B6B70" strokeWidth={1.7} aria-hidden="true">
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </svg>
);

function Palette({ ecrans, fermer, aller }: { ecrans: (EntreeMenu & { rubrique: string })[]; fermer: () => void; aller: (id: PageId) => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const resultats = useMemo(() => { const m = sansAccents(q.trim()); return ecrans.filter((r) => !m || sansAccents(`${r.titre} ${r.rubrique}`).includes(m)); }, [q, ecrans]);
  const clavier = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); fermer(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, resultats.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter" && resultats[sel]) { e.preventDefault(); aller(resultats[sel].id); }
  };
  return (
    <div className="mb-palette-fond" onMouseDown={fermer}>
      <div className="mb-palette" role="dialog" aria-label="Aller à un écran" onMouseDown={(e) => e.stopPropagation()} onKeyDown={clavier}>
        <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} placeholder="Aller à un écran…" aria-label="Rechercher un écran" />
        <div className="mb-palette-liste" role="listbox">
          {resultats.length === 0 ? <div className="mb-palette-vide">Aucun écran ne correspond.</div> : null}
          {resultats.map((r, i) => <button key={r.id} type="button" role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => aller(r.id)}><span>{r.titre}</span><span className="mb-rub">{r.rubrique}</span></button>)}
        </div>
        <div className="mb-palette-pied">Entrée pour ouvrir · Échap pour fermer</div>
      </div>
    </div>
  );
}

export default function Sidebar({ active, espaces, onNavigate, session }: {
  active: PageId;
  espaces: Espace[]; // les bases du compte connecté
  onNavigate: (id: PageId) => void;
  session?: Session | null;
}) {
  const role = roleDeSession(session);
  const nom = session ? nomAffiche(session) : commercial.prenom;
  const libelleRole = role ? LIBELLE_ROLE[role] : commercial.role;
  const initiales = session ? initialesDe(nom) : commercial.initiales;
  const email = session?.user?.email ?? "";

  // Pastilles « non lus » des deux boîtes : toutes les 60 s, à la lecture d'un mail, et au retour sur l'onglet.
  const [nonLus, setNonLus] = useState<Record<Espace, number>>({ demarchage: 0, recrutement: 0 });
  useEffect(() => {
    let annule = false;
    const maj = () => Promise.all([compterNonLus("demarchage"), compterNonLus("recrutement")]).then(([d, r]) => { if (!annule) setNonLus({ demarchage: d, recrutement: r }); });
    void maj();
    const t = setInterval(maj, 60_000);
    window.addEventListener(EVENEMENT_LUS, maj);
    window.addEventListener("focus", maj);
    return () => { annule = true; clearInterval(t); window.removeEventListener(EVENEMENT_LUS, maj); window.removeEventListener("focus", maj); };
  }, [active]);
  const badge = (id: PageId) => (id === "messages" ? espaces.reduce((n, e) => n + nonLus[e], 0) : 0);

  const rubriques = useMemo<Rubrique[]>(() => [
    ...menuPour(espaces).map((g) => ({ cle: g.titre || "accueil", titre: g.titre || "Accueil", icone: ICONES[g.titre] ?? ICONES[""], groupes: [{ ...g, titre: "" }] })),
    { cle: "reglages", titre: "Réglages", icone: ICONE_REGLAGES, enBas: true, groupes: [{ titre: "", entrees: [{ id: "parametrage" as PageId, titre: "Réglages", espace: null }] }] },
  ], [espaces]);
  const enHaut = rubriques.filter((r) => !r.enBas), enBas = rubriques.filter((r) => r.enBas);
  const courante = rubriques.find((r) => r.groupes.some((g) => g.entrees.some((e) => e.id === active))) ?? rubriques[0];
  const ecrans = useMemo(() => rubriques.flatMap((r) => r.groupes.flatMap((g) => g.entrees.map((e) => ({ ...e, rubrique: r.titre })))), [rubriques]);

  const [accueil, setAccueil] = useState(() => !lireReplie());
  const [pop, setPop] = useState(false);
  const [palette, setPalette] = useState(false);
  const replier = () => { ecrireReplie(true); setAccueil(false); };
  const voirTitres = () => { ecrireReplie(false); setAccueil(true); setPop(false); };

  useEffect(() => {
    const touche = (e: globalThis.KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); } };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, []);
  useEffect(() => {
    if (!pop) return;
    const dehors = (e: MouseEvent) => { if (!(e.target as Element | null)?.closest?.(".mb-pied")) setPop(false); };
    document.addEventListener("mousedown", dehors);
    return () => document.removeEventListener("mousedown", dehors);
  }, [pop]);

  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const lien = (e: EntreeMenu, role_?: string) => {
    const n = badge(e.id);
    return <button key={e.id} type="button" role={role_} className="mb-lien" aria-current={e.id === active ? "page" : undefined} onClick={() => onNavigate(e.id)}><span className="mb-lien-txt">{e.titre}</span>{n ? <span className="mb-badge">{n}</span> : null}</button>;
  };
  const liste = (r: Rubrique, role_?: string) => r.groupes.map((g, i) => <div key={g.titre || i}>{g.titre ? <div className="mb-groupe">{g.titre}</div> : null}{g.entrees.map((e) => lien(e, role_))}</div>);
  const pied = (
    <div className="mb-pied">
      {pop ? <div className="mb-pop" role="menu">{email ? <div className="mb-pop-mail">{email}</div> : null}<button type="button" role="menuitem" className="mb-pop-sortie" onClick={() => { setPop(false); void seDeconnecter(); }}>Déconnexion</button></div> : null}
      <div className="mb-moi-ligne">
        <button type="button" className="mb-moi" aria-expanded={pop} aria-haspopup="menu" onClick={() => setPop((p) => !p)}>
          <span className="mb-avatar">{initiales}</span>
          <span className="mb-moi-txt"><span className="mb-moi-nom">{nom}</span><span className="mb-moi-role">{libelleRole}</span></span>
        </button>
      </div>
    </div>
  );
  const boutonRail = (r: Rubrique) => {
    const estCourante = r.cle === courante?.cle;
    return (
      <div className="mb-sec" key={r.cle}>
        <button type="button" className="mb-sec-btn" aria-label={r.titre} aria-current={estCourante ? "page" : undefined} onClick={() => onNavigate(r.groupes[0].entrees[0].id)}><Icone trace={r.icone} couleur={estCourante ? "#111113" : "#6B6B70"} /></button>
        <div className="mb-fly" role="menu" aria-label={r.titre}><div className="mb-titre">{r.titre}</div>{liste(r, "menuitem")}</div>
      </div>
    );
  };
  const grandTitre = (r: Rubrique) => <button key={r.cle} type="button" className="mb-grand" aria-current={r.cle === courante?.cle ? "page" : undefined} onClick={() => { onNavigate(r.groupes[0].entrees[0].id); replier(); }}><Icone trace={r.icone} taille={16} />{r.titre}</button>;

  return (
    <nav className="mb-racine" aria-label="Menu">
      {accueil ? <div className="mb-accueil">{enHaut.map(grandTitre)}{enBas.length ? <div className="mb-sep" /> : null}{enBas.map(grandTitre)}{pied}</div> : null}
      <div className="mb-rail">
        <button type="button" className="mb-carres" title="Toutes les rubriques" aria-label="Afficher les grands titres" onClick={voirTitres}>{QUATRE_CARRES}</button>
        {enHaut.map(boutonRail)}
        <span className="flex-1" />
        {enBas.map(boutonRail)}
      </div>
      <div className="mb-panneau">
        <div className="mb-titre">{courante?.titre}</div>
        <button type="button" className="mb-cherche" onClick={() => setPalette(true)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8E8E93" strokeWidth={2} aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <span className="flex-1">Rechercher</span>
          <kbd className="mb-kbd">{mac ? "⌘K" : "Ctrl K"}</kbd>
        </button>
        <div className="mb-liste">{courante ? liste(courante) : null}</div>
        {!accueil ? pied : null}
      </div>
      {palette ? <Palette ecrans={ecrans} fermer={() => setPalette(false)} aller={(id) => { setPalette(false); onNavigate(id); }} /> : null}
    </nav>
  );
}
