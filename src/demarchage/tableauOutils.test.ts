import { describe, expect, it } from "vitest"
import { bilanProspection, tauxJointParHeure, type AppelLu } from "./tableauOutils"

const appel = (o: Partial<AppelLu>): AppelLu => ({ id: Math.random().toString(36), date: "2026-11-06T09:30:00Z", compteId: "h", compteNom: "Horlann Maunier", resultat: "pas_de_reponse", issue: "", agenceId: "a", agenceNom: "Foncia", ...o })

describe("quand joindre un gestionnaire", () => {
  it("le taux de joints par heure de Paris, seulement les heures assez fournies", () => {
    // 10 h à Paris = 9 h UTC en novembre
    const a10 = [...Array(10)].map((_, i) => appel({ date: "2026-11-03T09:10:00Z", resultat: i < 3 ? "joint" : "standard" }))
    const a14 = [...Array(12)].map((_, i) => appel({ date: "2026-11-03T13:10:00Z", resultat: i < 1 ? "joint" : "pas_de_reponse" }))
    const a17 = [...Array(4)].map(() => appel({ date: "2026-11-03T16:10:00Z", resultat: "joint" }))
    const l = tauxJointParHeure([...a10, ...a14, ...a17, appel({ resultat: "lance", date: "2026-11-03T09:10:00Z" })])
    expect(l).toEqual([{ heure: 10, appels: 10, joints: 3, taux: 30 }, { heure: 14, appels: 12, joints: 1, taux: 8 }])
  })
})

describe("ma base de prospection", () => {
  it("prospection : par étape, travaillées, clients, taux de signature", () => {
    const b = bilanProspection([{ etape: "a_prospecter" }, { etape: "a_prospecter" }, { etape: "interesse" }, { etape: "pas_interesse" }, { etape: "client" }, { etape: "endormie" }])
    expect(b).toMatchObject({ total: 6, travaillees: 4, clients: 1, tauxSignature: 25 })
    expect(b.parEtape.a_prospecter).toBe(2)
    expect(bilanProspection([]).tauxSignature).toBeNull()
  })
})

