// Petites fonctions pures pour la boîte de réception (testées dans messagesUtils.test.ts).

// Extrait l'adresse email d'un champ « De » : « Jean Dupont <jean@ex.fr> » → « jean@ex.fr ».
export function extraireAdresse(brut: string): string {
  const s = (brut || "").trim()
  const m = s.match(/<([^>]+)>/)
  return (m ? m[1] : s).toLowerCase().trim()
}

// Nom à afficher pour un correspondant : le nom s'il est présent, sinon l'adresse.
// « Jean Dupont <jean@ex.fr> » → « Jean Dupont » ; « jean@ex.fr » → « jean@ex.fr ».
export function nomCorrespondant(brut: string): string {
  const s = (brut || "").trim()
  const m = s.match(/^\s*"?([^"<]+?)"?\s*</)
  const nom = m ? m[1].trim() : ""
  return nom || extraireAdresse(s)
}

// Objet d'une réponse : préfixe « Re: » une seule fois (« Re: Re: … » interdit).
export function objetReponse(objet: string): string {
  const o = (objet || "").trim()
  return /^re\s*:/i.test(o) ? o : "Re: " + (o || "(sans objet)")
}

// Date lisible en français : aujourd'hui → « 14:32 », sinon « 9 juil. » (+ année si différente).
export function dateCourte(iso: string, maintenant: Date = new Date()): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  const memeJour =
    d.getDate() === maintenant.getDate() &&
    d.getMonth() === maintenant.getMonth() &&
    d.getFullYear() === maintenant.getFullYear()
  if (memeJour) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === maintenant.getFullYear()
      ? { day: "numeric", month: "short" }
      : { day: "numeric", month: "short", year: "numeric" }
  return d.toLocaleDateString("fr-FR", opts)
}
