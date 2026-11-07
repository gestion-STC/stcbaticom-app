import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { commercial } from "../data";
import { compterNonLus, EVENEMENT_LUS, type Espace } from "../lib/messagesDb";
import { seDeconnecter } from "../lib/auth";
import {
  initialesDe,
  nomAffiche,
  roleDeSession,
  LIBELLE_ROLE,
} from "../lib/comptes";
import LogoBaticom from "./LogoBaticom";
import { menuPour, type PageId } from "../lib/carteMenu";

export type { PageId };

// UN SEUL MENU (Mahdi, 07/11/2026 : « unifie-moi tout ça », « pas de sélecteur en haut ») : plus de
// rail Développement / Recrutement. Le menu montre les pages des bases du compte, rangées par ce
// qu'on y fait ; Réglages en bas. La carte : src/lib/carteMenu.ts ; le périmètre : src/lib/perimetre.ts.

function Lien({
  actif,
  titre,
  badge,
  onClick,
}: {
  actif: boolean;
  titre: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={actif ? "page" : undefined}
      className={
        "flex h-[30px] w-full items-center rounded-4 px-2 text-left text-legende transition-colors " +
        (actif
          ? "bg-fond-4 font-medium text-encre"
          : "text-[#3c3c40] hover:bg-fond-3 hover:text-encre")
      }
    >
      <span className="flex-1 truncate">{titre}</span>
      {badge ? (
        <span className="chiffres rounded-full bg-encre px-1.5 text-[10px] font-medium leading-4 text-white">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export default function Sidebar({
  active,
  espaces,
  onNavigate,
  session,
}: {
  active: PageId;
  espaces: Espace[]; // les bases du compte connecté
  onNavigate: (id: PageId) => void;
  session?: Session | null;
}) {
  // Qui est connecté : nom et rôle du compte, sinon le profil par défaut (mode démo).
  const role = roleDeSession(session);
  const nom = session ? nomAffiche(session) : commercial.prenom;
  const libelleRole = role ? LIBELLE_ROLE[role] : commercial.role;
  const initiales = session ? initialesDe(nom) : commercial.initiales;

  // Pastilles « non lus » des DEUX boîtes, rafraîchies toutes les 60 s
  // (et quand on change de page, pour qu'elles retombent après lecture).
  const [nonLus, setNonLus] = useState<Record<Espace, number>>({
    demarchage: 0,
    recrutement: 0,
  });
  useEffect(() => {
    let annule = false;
    const maj = () =>
      Promise.all([
        compterNonLus("demarchage"),
        compterNonLus("recrutement"),
      ]).then(
        ([d, r]) => !annule && setNonLus({ demarchage: d, recrutement: r }),
      );
    maj();
    const t = setInterval(maj, 60_000);
    // Un mail ouvert (ou remis non lu) : la pastille se recompte tout de
    // suite, sans attendre la minute (12/10/2026). Et au retour sur l'onglet,
    // pour voir sans délai un mail arrivé pendant qu'on était ailleurs.
    window.addEventListener(EVENEMENT_LUS, maj);
    window.addEventListener("focus", maj);
    return () => {
      annule = true;
      clearInterval(t);
      window.removeEventListener(EVENEMENT_LUS, maj);
      window.removeEventListener("focus", maj);
    };
  }, [active]);

  const badge = (id: PageId) =>
    id === "messages" ? espaces.reduce((n, e) => n + nonLus[e], 0) : 0;

  return (
    <nav
      className="flex h-screen w-60 shrink-0 flex-col border-r-[0.5px] border-trait bg-fond px-2.5 pb-3.5 pt-4"
      aria-label="Menu"
    >
      <div className="px-2 pb-4">
        <LogoBaticom className="text-[19px]" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {menuPour(espaces).map((g, i) => (
          <div key={g.titre || i}>
            {g.titre ? (
              <p className="px-2 pb-1 pt-3.5 text-colonne text-encre-2">
                {g.titre}
              </p>
            ) : null}
            {g.entrees.map((e) => (
              <Lien
                key={e.id}
                actif={e.id === active}
                titre={e.titre}
                badge={badge(e.id)}
                onClick={() => onNavigate(e.id)}
              />
            ))}
          </div>
        ))}
      </div>
      <Lien
        actif={active === "parametrage"}
        titre="Réglages"
        onClick={() => onNavigate("parametrage")}
      />

      <div className="mt-2 flex items-center gap-2 border-t-[0.5px] border-trait pt-2.5">
        <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-fond-4 text-colonne font-semibold text-encre">
          {initiales}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-legende font-medium text-encre">{nom}</p>
          <p className="text-colonne text-encre-2">{libelleRole}</p>
        </div>
        <button
          type="button"
          onClick={seDeconnecter}
          title="Se déconnecter"
          aria-label="Se déconnecter"
          className="rounded-full p-2 text-encre-2 transition-colors hover:bg-fond-3 hover:text-encre"
        >
          <LogOut size={15} />
        </button>
      </div>
    </nav>
  );
}
