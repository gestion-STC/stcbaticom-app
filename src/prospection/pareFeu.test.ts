import { describe, expect, it } from "vitest"
import { clesContact, sansDejaSollicites, domaineBloque } from "./pareFeu"
import ecran from "./pareFeu.ts?raw"
import serveur from "../../supabase/functions/_shared/campagnes/pareFeu.ts?raw"

const k = (id: string, email = "", mobile = "", telephone = "") => ({ id, email, mobile, telephone })

it("reconnaît un domaine bloqué", () => { expect(domaineBloque("a@Concurrent.fr", ["concurrent.fr"])).toBe(true); expect(domaineBloque("a@autre.fr", ["concurrent.fr"])).toBe(false) })

describe("le pare-feu des campagnes", () => {
  it("le serveur a la même copie que l'écran", () => {
    const n = (s: string) => s.replace(/\r\n/g, "\n")
    expect(n(serveur)).toBe(n(ecran))
  })
  it("reconnaît un numéro, quelle que soit son écriture", () => {
    expect(clesContact(k("a", "", "+33 6 12 34 56 78"))).toEqual(["t:0612345678"])
    expect(clesContact(k("a", "", "0033612345678"))).toEqual(["t:0612345678"])
    expect(clesContact(k("a", "", "06.12.34.56.78"))).toEqual(["t:0612345678"])
  })
  it("ne confond pas la casse d'un mail", () => expect(clesContact(k("a", " Jean@X.fr "))).toEqual(["m:jean@x.fr"]))
  it("bloque une personne déjà sollicitée dans une autre campagne, même sur une autre base", () => {
    expect(sansDejaSollicites([k("agence", "jean@x.fr")], new Set(), [k("artisan", "JEAN@x.fr")])).toEqual([])
    expect(sansDejaSollicites([k("a", "", "", "0612345678")], new Set(), [k("b", "", "+33612345678")])).toEqual([])
  })
  it("laisse continuer ceux qui sont déjà dans cette campagne", () => {
    const moi = k("a", "jean@x.fr")
    expect(sansDejaSollicites([moi], new Set(["a"]), [moi])).toEqual([moi])
  })
  it("ne fait entrer qu'une fiche quand deux fiches sont la même personne", () => {
    expect(sansDejaSollicites([k("a", "x@y.fr"), k("b", "x@y.fr"), k("c", "z@y.fr")], new Set(), []).map((x) => x.id)).toEqual(["a", "c"])
  })
  it("laisse passer les contacts sans lien", () => expect(sansDejaSollicites([k("a", "a@y.fr")], new Set(), [k("b", "b@y.fr")])).toHaveLength(1))
})
