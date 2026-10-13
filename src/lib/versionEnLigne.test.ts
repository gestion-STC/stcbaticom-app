import { describe, expect, it } from "vitest"
import { bundleDe } from "./versionEnLigne"

describe("bundleDe", () => {
  it("lit le bundle principal d'une page publiée", () => {
    expect(bundleDe('<script type="module" crossorigin src="/stcbaticom-app/assets/index-BHB1Q_-J.js"></script>')).toBe("assets/index-BHB1Q_-J.js")
    expect(bundleDe("<html></html>")).toBeNull()
  })
})
