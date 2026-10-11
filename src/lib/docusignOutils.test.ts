// Les outils purs de la brique DocuSign (serveur), vérifiés ici :
// la clé PKCS#1 enveloppée en PKCS#8 doit être acceptée par WebCrypto et
// correspondre octet pour octet à l'export de référence (clé de TEST jetable, 1024 bits).
import { describe, expect, it } from "vitest"
import { base64VersOctets, compterPagesPdf, octetsVersBase64, pemVersPkcs8Der } from "../../supabase/functions/_shared/docusign"

const PEM_PKCS1 = "-----BEGIN RSA PRIVATE KEY-----\nMIICXAIBAAKBgQDIFnE40ZDgz+Zuig+tFuktBQXV8qnts1heCnyy6/4S135pFgB4\nn0dOixu8qavWWZLyTWwOkCWyS+57oBvRbpq9SoqnOIuaIPg0W1njr06yWFZr2U5A\n6JgvjsWHmui4zV147ErP42D8NZz9iNDkGmCG/RkLR2QYspK4zZLtfIYO/QIDAQAB\nAoGABiuTAEKOKjCfFYeSZi8Pr8C45lkeXmMqdXPzVn0qj6AvmMQB7bZTt5tYlp/Q\n2cJXYrt6epR9ZRssVomgcfvsL54oXpL2MqfksXrAXKM44QeDO02dXDlXNMamEBU0\nwYGfSoTtgydHN40E9EZTxIKtsUOCWpMy+O5RYvcvIFRmjoECQQD4z324Jr6e9/7K\n/DhbkgtaoIVT44ADbF8FqRHipyVYFDtxWmEa9hyH0VhhuFhKh+wVIiPWszPuKiP7\nUJhilZKdAkEAzd6JebWYPAjm+OOCl5ELxU8xyFdkt6RjvpYY1iuy0wwq1P9emH1D\nNieyatvkTDXXbcbCQYAb9WO7YiUBr40P4QJBANVa581vu+oJcr2RRqqPM5lFKM9k\nuDM3TMxHzIR1G/rJbqem/rnl7VUx2P4C3AMdRv5gRicniBJkpHIvDF0NMakCQFPV\ni6ZEjPnlpik0fLm8F08CMQOkkx81kmjKNtMAeJH5IngahisS14v2HnHlmdJvGotZ\npUGHKduEAYq2Bzm1+AECQFAfBji6Mu8o6au5z7RcQJx7Cs4gujO0WjfDmZQkEcSG\nREx2bJUEMcrqh3UHgyynn82DfenwJ4jEo+9IoHgu3bM=\n-----END RSA PRIVATE KEY-----\n"
const PKCS8_ATTENDU = "MIICdgIBADANBgkqhkiG9w0BAQEFAASCAmAwggJcAgEAAoGBAMgWcTjRkODP5m6KD60W6S0FBdXyqe2zWF4KfLLr/hLXfmkWAHifR06LG7ypq9ZZkvJNbA6QJbJL7nugG9Fumr1Kiqc4i5og+DRbWeOvTrJYVmvZTkDomC+OxYea6LjNXXjsSs/jYPw1nP2I0OQaYIb9GQtHZBiykrjNku18hg79AgMBAAECgYAGK5MAQo4qMJ8Vh5JmLw+vwLjmWR5eYyp1c/NWfSqPoC+YxAHttlO3m1iWn9DZwldiu3p6lH1lGyxWiaBx++wvnihekvYyp+SxesBcozjhB4M7TZ1cOVc0xqYQFTTBgZ9KhO2DJ0c3jQT0RlPEgq2xQ4JakzL47lFi9y8gVGaOgQJBAPjPfbgmvp73/sr8OFuSC1qghVPjgANsXwWpEeKnJVgUO3FaYRr2HIfRWGG4WEqH7BUiI9azM+4qI/tQmGKVkp0CQQDN3ol5tZg8COb444KXkQvFTzHIV2S3pGO+lhjWK7LTDCrU/16YfUM2J7Jq2+RMNddtxsJBgBv1Y7tiJQGvjQ/hAkEA1VrnzW+76glyvZFGqo8zmUUoz2S4MzdMzEfMhHUb+slup6b+ueXtVTHY/gLcAx1G/mBGJyeIEmSkci8MXQ0xqQJAU9WLpkSM+eWmKTR8ubwXTwIxA6STHzWSaMo20wB4kfkieBqGKxLXi/YeceWZ0m8ai1mlQYcp24QBirYHObX4AQJAUB8GOLoy7yjpq7nPtFxAnHsKziC6M7RaN8OZlCQRxIZETHZslQQxyuqHdQeDLKefzYN96fAniMSj70igeC7dsw=="

describe("pemVersPkcs8Der", () => {
  it("donne le DER PKCS#8 de référence, et WebCrypto l'importe et signe", async () => {
    const obtenu = pemVersPkcs8Der(PEM_PKCS1)
    expect(octetsVersBase64(obtenu)).toBe(PKCS8_ATTENDU)
    const cle = await crypto.subtle.importKey("pkcs8", obtenu, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"])
    expect(cle.type).toBe("private")
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cle, new TextEncoder().encode("bonjour"))
    expect(signature.byteLength).toBe(128)
  })
  it("laisse passer une clé déjà en PKCS#8 et refuse l'inconnu", () => {
    const pem8 = "-----BEGIN PRIVATE KEY-----\n" + PKCS8_ATTENDU + "\n-----END PRIVATE KEY-----"
    expect(octetsVersBase64(pemVersPkcs8Der(pem8))).toBe(PKCS8_ATTENDU)
    expect(() => pemVersPkcs8Der("-----BEGIN CERTIFICATE-----\nAA==\n-----END CERTIFICATE-----")).toThrow()
  })
  it("base64 aller-retour", () => {
    expect(octetsVersBase64(base64VersOctets("U1RDIEJhdGltZW50"))).toBe("U1RDIEJhdGltZW50")
  })
})

describe("compterPagesPdf", () => {
  it("compte les objets /Type /Page sans compter /Pages", () => {
    const pdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj << /Type /Pages /Count 2 >>\n2 0 obj << /Type /Page >>\n3 0 obj <</Type/Page>>\n")
    expect(compterPagesPdf(pdf)).toBe(2)
    expect(compterPagesPdf(new TextEncoder().encode("%PDF-1.4"))).toBe(1)
  })
})
