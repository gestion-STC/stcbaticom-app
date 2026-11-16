// La sécurité (Mahdi, 11/11/2026) : seuls les membres de l'équipe entrent, ni par la base ni par les fonctions serveur.
import sql from "../../supabase/maj-2026-11-11-securite-membres.sql?raw"
import acces from "../../supabase/functions/_shared/acces.ts?raw"
import envoyer from "../../supabase/functions/envoyer-email/index.ts?raw"
import recevoir from "../../supabase/functions/recevoir-email/index.ts?raw"
import sms from "../../supabase/functions/envoyer-sms/index.ts?raw"
import synchro from "../../supabase/functions/synchro-clients/index.ts?raw"
import { describe, expect, it } from "vitest"

describe("la sécurité", () => {
  it("la base : membres seulement, clé interne invisible, rien sans connexion", () => {
    expect(sql).toContain("in ('admin', 'telepro')")
    expect(sql).toContain("cle <> 'analyse_passage_cle'")
    expect(sql).toContain("revoke execute on function %s from public, anon")
  })
  it("un compte sans rôle n'est pas un membre", () => expect(acces).toContain('ROLES_MEMBRES = ["admin", "telepro"]'))
  it("envoyer un mail : membre ou serveur", () => {
    expect(envoyer).toContain("const serveur = await estServeur(jetonAppel);")
    expect(envoyer).toContain("const appelant = serveur ? null : await membre(jetonAppel);")
    expect(envoyer).toContain('if (!serveur && !appelant) return json({ error: "non autorisé" }, 401);')
  })
  it("envoyer un SMS : membre ou serveur, par Twilio au nom de STC", () => {
    expect(sms).toContain("const serveur = await estServeur(jetonAppel)")
    expect(sms).toContain('if (!serveur && !appelant) return reponse({ error: "non autorisé" }, 401)')
    expect(sms).toContain("api.twilio.com/2010-04-01/Accounts/")
    expect(sms).toContain('Deno.env.get("TWILIO_SMS_FROM")')
    expect(sms).toContain('code: "non_mobile"')
  })
  it("un mail reçu doit exister chez Resend", () => expect(recevoir).toContain("api.resend.com/emails/receiving/"))
  it("la synchro : serveur ou clé interne", () => expect(synchro).toContain("estServeur(jetonDe(req))"))
})
