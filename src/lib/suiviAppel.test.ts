import { describe, it, expect } from "vitest"
import {
  prochaineEtape,
  dureeLisible,
  texteEtape,
  doitContinuer,
  DELAI_ABANDON_MS,
} from "./suiviAppel"

const base = { vuActif: false, sondageOk: true, actif: false, depuisMs: 0 }

describe("prochaineEtape", () => {
  it("juste apres le lancement : on attend que TON telephone sonne", () => {
    expect(prochaineEtape(base)).toBe("attente")
  })

  it("l'appel est en ligne", () => {
    expect(prochaineEtape({ ...base, actif: true })).toBe("en_cours")
  })

  it("a ete en ligne puis ne l'est plus : termine", () => {
    expect(prochaineEtape({ ...base, vuActif: true, actif: false })).toBe("termine")
  })

  it("une verification RATEE ne doit pas faire croire que l'appel est fini", () => {
    // le piege : une coupure reseau afficherait « termine » alors qu'on parle encore
    expect(prochaineEtape({ ...base, vuActif: true, sondageOk: false })).toBe("en_cours")
    expect(prochaineEtape({ ...base, vuActif: false, sondageOk: false })).toBe("attente")
  })

  it("jamais vu en ligne apres 2 minutes : on cesse de pretendre suivre", () => {
    expect(prochaineEtape({ ...base, depuisMs: DELAI_ABANDON_MS })).toBe("sans_suivi")
    expect(prochaineEtape({ ...base, depuisMs: DELAI_ABANDON_MS - 1 })).toBe("attente")
  })

  it("un appel en ligne prime sur le delai d'abandon", () => {
    expect(prochaineEtape({ ...base, actif: true, depuisMs: 600_000 })).toBe("en_cours")
  })
})

describe("dureeLisible", () => {
  it("affiche les secondes seules sous une minute", () => {
    expect(dureeLisible(0)).toBe("0 s")
    expect(dureeLisible(45_000)).toBe("45 s")
  })

  it("affiche minutes et secondes au-dela, secondes sur deux chiffres", () => {
    expect(dureeLisible(65_000)).toBe("1 min 05 s")
    expect(dureeLisible(750_000)).toBe("12 min 30 s")
  })

  it("ne rend jamais de duree negative", () => {
    expect(dureeLisible(-5000)).toBe("0 s")
  })
})

describe("doitContinuer", () => {
  it("continue tant que l'appel n'est pas conclu", () => {
    expect(doitContinuer("attente")).toBe(true)
    expect(doitContinuer("en_cours")).toBe(true)
  })

  it("s'arrete une fois l'appel termine ou abandonne", () => {
    expect(doitContinuer("termine")).toBe(false)
    expect(doitContinuer("sans_suivi")).toBe(false)
  })
})

describe("texteEtape", () => {
  it("donne un texte pour chaque etape", () => {
    for (const e of ["attente", "en_cours", "termine", "sans_suivi"] as const) {
      expect(texteEtape(e).length).toBeGreaterThan(10)
    }
  })

  it("dit clairement quoi faire quand le suivi est indisponible", () => {
    expect(texteEtape("sans_suivi")).toContain("à la main")
  })
})
