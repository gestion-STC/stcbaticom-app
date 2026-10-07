// Signature e-mail STC Bâtiment — le même format que dans le logiciel STC
// (format V3 validé par Mahdi le 09/08/2026) : filet gris fin, logo complet
// « rénover | innover » (128 px), nom · Gestion, le fixe de l'entreprise,
// l'adresse e-mail, le site, l'adresse postale en pied.
//
// Mahdi, 07/10/2026 : « remplace la signature des mails après call par la
// signature qu'on utilise sur STC Bâtiment, et mets mon nom sur la signature
// de mon compte ». La signature est donc construite POUR LE COMPTE CONNECTÉ
// (son nom), plus de HTML collé commun à tout le monde.
//
// Téléphones : le fixe toujours ; un mobile seulement s'il est donné (celui de
// la personne). Jamais de mobile par défaut (règle STC Bâtiment du 06/10/2026).
//
// Adresse e-mail : celle du CRM, car c'est là que reviennent les réponses (boîte
// de réception, webhook Resend). Pas l'adresse personnelle du compte.

const LOGO_URL = "https://stcbatiment.com/stc-logo-email.png"
export const ADRESSE_CRM = "contact@crm.stcbatiment.fr"
export const FIXE_STC = "01 84 80 61 28"
const F = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif"

export interface SignataireStc {
  /** Nom affiché (« Mahdi Souissi »). Vide → « L'équipe STC ». */
  nom: string
  /** Adresse affichée et cliquable. Défaut : l'adresse du CRM. */
  email?: string
  /** Mobile de la personne, si elle en a un à montrer. Sinon rien. */
  mobile?: string | null
}

/** « Mahdi Souissi » → « Mahdi » ; « contact » → « contact ». Sert à {{commercial}}. */
export function prenomDe(nom: string): string {
  return nom.trim().split(/\s+/)[0] || ""
}

const lienTel = (numero: string) => "tel:+33" + numero.replace(/\s/g, "").replace(/^0/, "")

export function signatureStc(s: SignataireStc): string {
  const nom = s.nom.trim() || "L'équipe STC"
  const email = (s.email || ADRESSE_CRM).trim()
  const mobile = s.mobile ? s.mobile.replace(/[.\s]/g, " ").trim() : null
  const segMobile = mobile
    ? `&nbsp;&middot;&nbsp;
    <a href="${lienTel(mobile)}" style="color:#444;text-decoration:none;">${mobile}</a> <span style="color:#999;">(SMS / WhatsApp)</span>`
    : ""
  return `
<div style="margin-top:30px;border-top:1px solid #ececec;padding-top:16px;font-family:${F};">
  <img src="${LOGO_URL}" alt="STC B&acirc;timent - r&eacute;nover | innover" width="128" style="display:block;margin:0 0 12px;max-width:128px;height:auto;" />
  <p style="margin:0;font-size:13.5px;color:#1a1a1a;font-weight:600;font-family:${F};">${nom} <span style="font-weight:400;color:#b0b0b0;">&middot;</span> <span style="font-weight:400;color:#6b6b6b;">Gestion</span></p>
  <p style="margin:4px 0 0;font-size:12.5px;color:#444;line-height:1.7;font-family:${F};">
    <a href="${lienTel(FIXE_STC)}" style="color:#444;text-decoration:none;">${FIXE_STC}</a>${segMobile}<br>
    <a href="mailto:${email}" style="color:#444;text-decoration:none;">${email}</a>
    &nbsp;&middot;&nbsp;
    <a href="https://stcbatiment.fr" style="color:#D32F2F;text-decoration:none;">stcbatiment.fr</a>
  </p>
  <p style="margin:14px 0 0;font-size:11px;color:#b0b0b0;font-family:${F};">STC B&acirc;timent &middot; 7 rue Oscar Niemeyer, 78280 Guyancourt</p>
</div>`
}
