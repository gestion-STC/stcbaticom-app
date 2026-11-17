import { describe, expect, it } from "vitest"
import { messageDictee } from "./useDictee"

describe("dictée : les pannes sont expliquées", () => {
  it("dit quoi faire selon la panne", () => {
    expect(messageDictee("not-allowed")).toContain("autorise le micro")
    expect(messageDictee("network")).toContain("Google")
    expect(messageDictee("audio-capture")).toContain("Aucun micro")
    expect(messageDictee(undefined)).toContain("raison inconnue")
  })
})
