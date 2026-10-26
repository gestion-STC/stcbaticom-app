import { useState } from "react"
import type { Session } from "@supabase/supabase-js"
import SecteursReglage from "./demarchage/SecteursReglage"
import ObjectifsReglage from "./demarchage/ObjectifsReglage"
import EmailsManager from "./EmailsManager"
import NumerosManager from "./NumerosManager"
import ReglagesRecrutement from "./recrutement/ReglagesRecrutement"
import ContratsModeles from "./recrutement/ContratsModeles"
import ExclusionsST from "./recrutement/ExclusionsST"
import Comptes from "./Comptes"
import { estAdmin } from "../lib/comptes"

// LES RÉGLAGES, RANGÉS PAR RUBRIQUE (Mahdi, 24/10/2026 : « c'est le bordel, on comprend rien »).
// Avant : cinq onglets côte à côte (dont un « Objectifs et script » et un « Modèles d'e-mail »
// qui mélangeaient tout), et les comptes sur une page à part. Maintenant, un menu à gauche en
// quatre rubriques, une page par sujet :
//   · Mon compte — ce qui est à MOI : mes signatures ;
//   · Démarchage — ce qui règle les appels : objectif et règles, script, secteurs, modèles d'e-mail ;
//   · Recrutement — la machine, les contrats DocuSign, la liste d'exclusion ;
//   · Équipe — les comptes (administrateurs seulement) et les numéros Ringover.
// Aucun réglage n'a changé : seulement leur place.
type Section = "signatures" | "regles" | "script" | "secteurs" | "modeles" | "machine" | "contrats" | "exclusions" | "comptes" | "numeros"

type Rubrique = { titre: string; sections: { id: Section; label: string; admin?: boolean }[] }
const RUBRIQUES: Rubrique[] = [
  { titre: "Mon compte", sections: [{ id: "signatures", label: "Mes signatures" }] },
  {
    titre: "Démarchage",
    sections: [
      { id: "regles", label: "Objectif et règles d'appel" },
      { id: "script", label: "Script d'appel" },
      { id: "secteurs", label: "Secteurs" },
      { id: "modeles", label: "Modèles d'e-mail" },
    ],
  },
  {
    titre: "Recrutement",
    sections: [
      { id: "machine", label: "Machine de recrutement" },
      { id: "contrats", label: "Contrats à faire signer" },
      { id: "exclusions", label: "Liste d'exclusion" },
    ],
  },
  {
    titre: "Équipe",
    sections: [
      { id: "comptes", label: "Comptes", admin: true },
      { id: "numeros", label: "Numéros Ringover" },
    ],
  },
]

export default function Parametrage({ session, sectionInitiale }: { session: Session | null; sectionInitiale?: Section }) {
  const admin = estAdmin(session)
  const rubriques = RUBRIQUES.map((r) => ({ ...r, sections: r.sections.filter((s) => !s.admin || admin) })).filter((r) => r.sections.length)
  const [section, setSection] = useState<Section>(sectionInitiale ?? "regles")
  const titre = RUBRIQUES.flatMap((r) => r.sections).find((s) => s.id === section)?.label ?? ""

  return (
    <div className="flex min-h-full">
      {/* Le filet descend jusqu'en bas ; le menu, lui, reste en place quand la page défile. */}
      <nav aria-label="Rubriques des réglages" className="w-56 shrink-0 border-r border-trait bg-fond">
        <div className="sticky top-0 px-3 py-6">
          <p className="mb-3 px-2 text-sous-titre font-semibold text-encre">Réglages</p>
          {rubriques.map((r) => (
            <div key={r.titre} className="mb-3">
              <p className="px-2 pb-1 pt-2 text-colonne text-encre-2">{r.titre}</p>
              {r.sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-current={s.id === section ? "page" : undefined}
                  onClick={() => setSection(s.id)}
                  className={
                    "flex h-[30px] w-full items-center rounded-6 px-2 text-left text-legende transition-colors " +
                    (s.id === section ? "bg-fond-4 font-medium text-encre" : "text-encre-2 hover:bg-fond-3 hover:text-encre")
                  }
                >
                  {s.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </nav>

      <div className="page min-w-0 flex-1">
        <h1 className="mb-6 text-section font-semibold tracking-[-0.015em] text-encre">{titre}</h1>
        {section === "signatures" && <EmailsManager partie="signatures" />}
        {section === "regles" && <ObjectifsReglage partie="regles" />}
        {section === "script" && <ObjectifsReglage partie="script" />}
        {section === "secteurs" && <SecteursReglage />}
        {section === "modeles" && <EmailsManager partie="modeles" />}
        {section === "machine" && <ReglagesRecrutement />}
        {section === "contrats" && <ContratsModeles />}
        {section === "exclusions" && <ExclusionsST />}
        {section === "comptes" && admin && <Comptes session={session} />}
        {section === "numeros" && <NumerosManager />}
      </div>
    </div>
  )
}
