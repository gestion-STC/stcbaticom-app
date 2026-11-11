// La sécurité (Mahdi, 11/11/2026) : seuls les membres de l'équipe entrent, ni par la base ni par les fonctions serveur.
import sql from "../../supabase/maj-2026-11-11-securite-membres.sql?raw"
import acces from "../../supabase/functions/_shared/acces.ts?raw"
import envoyer from "../../supabase/functions/envoyer-email/index.ts?raw"
import recevoir from "../../supabase/functions/recevoir-email/index.ts?raw"
import synchro from "../../supabase/functions/synchro-clients/index.ts?raw"
import { describe, expect, it } from "vitest"

describe("la sécurité", () => {
  it("la base : membres seulement, clé interne invisible, rien sans connexion", () => {
    expect(sql).toContain("in ('admin', 'telepro')")
    expect(sql).toContain("cle <> 'analyse_passage_cle'")
    expect(sql).toContain("revoke execute on function %s from public, anon")
  })
  it("un compte sans rôle n'est pas un membre", () => expect(acces).toContain('ROLES_MEMBRES = ["admin", "telepro"]'))
  it("envoyer un mail : membre ou serveur", () => expect(envoyer).toContain("!(await estServeur(jetonAppel)) && !(await membre(jetonAppel))"))
  it("un mail reçu doit exister chez Resend", () => expect(recevoir).toContain("api.resend.com/emails/receiving/"))
  it("la synchro : serveur ou clé interne", () => expect(synchro).toContain("estServeur(jetonDe(req))"))
})
