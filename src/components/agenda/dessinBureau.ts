// LE DESSIN DU BUREAU DE STC BÂTIMENT (Mahdi, 11/11/2026 : « recopie exactement le même design, parce que quand ça
// sera passé sur le logiciel, il faut que ce soit pareil »). Copie des réglages de STC Bâtiment :
// src/components/admin/bureau/dessinChantiers.tsx et src/lib/agendaCouleurs.ts. Ne pas les modifier ici seuls.

export const PILULE_NOIRE = "inline-flex h-[30px] items-center justify-center gap-2 whitespace-nowrap rounded-full bg-[#111113] px-[13px] text-[13px] font-medium text-white hover:bg-[#2A2A2E] disabled:pointer-events-none disabled:opacity-50"
export const PILULE_CLAIRE = "inline-flex h-[30px] items-center justify-center gap-2 whitespace-nowrap rounded-full border-[0.5px] border-[#E4E4E7] bg-white px-[13px] text-[13px] font-medium text-[#111113] hover:bg-[#FAFAFB] disabled:pointer-events-none disabled:opacity-50"
export const PETITE = "!h-[26px] !px-[11px]"
export const ROND_MINI = "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[#3C3C40] hover:bg-[#ECECEE] disabled:pointer-events-none disabled:opacity-50"
export const TITRE_PAGE = "text-[21px] font-semibold tracking-[-0.02em] text-[#111113]"
export const SOUS_TITRE = "mt-1 text-[13px] text-[#6B6B70]"
export const PETIT_GRIS = "text-[11px] text-[#8E8E93]"
export const CADRE = "rounded-[10px] border-[0.5px] border-[#E6E6EA] bg-white"
export const FILET = "border-[#E6E6EA]"
export const FENETRE = "rounded-[14px] border-0 bg-white p-0 text-[13px] text-[#111113] shadow-[0_20px_60px_rgba(17,17,19,.18)]"
export const PIED_FENETRE = "flex flex-row flex-wrap justify-end gap-2 border-t-[0.5px] border-[#E6E6EA] bg-[#FAFAFB] px-[22px] py-3"

/** La teinte d'une personne mêlée de gris : un liseré et une pastille sobres (STC Bâtiment). */
export function adoucir(hex: string, part = 0.35): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const gris = [142, 142, 147]
  const mel = (c: number, k: number) => Math.round(c * (1 - part) + gris[k] * part)
  return "#" + [mel(r, 0), mel(g, 1), mel(b, 2)].map((x) => x.toString(16).padStart(2, "0")).join("")
}

/** Une couleur STABLE par personne, tirée de son identifiant (la couleur dit QUI, jamais QUOI). */
const PALETTE = ["#3b82f6", "#8b5cf6", "#14b8a6", "#f97316", "#d946ef", "#06b6d4", "#65a30d", "#f43f5e", "#f59e0b", "#6366f1"]
export const COULEUR_NON_ATTRIBUE = "#94a3b8"
export function couleurDePersonne(id?: string | null): string {
  if (!id) return COULEUR_NON_ATTRIBUE
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}
