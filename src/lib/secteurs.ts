// Filtrage par SECTEUR (= le champ « arrondissement » du prospect : « 75015 », « Lyon »…).
// Sert à cibler une session d'appels (ou un créneau) sur un secteur précis.

type AvecSecteur = { arrondissement?: string }

// Liste des secteurs présents dans la base, dédoublonnés et triés (tri numérique :
// « 75002 » avant « 75015 », et alphabétique pour « Lyon », « Marseille »…).
export function secteursDisponibles(prospects: AvecSecteur[]): string[] {
  const set = new Set<string>()
  for (const p of prospects) {
    const s = (p.arrondissement ?? "").trim()
    if (s) set.add(s)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "fr", { numeric: true, sensitivity: "base" }))
}

// Vrai si le prospect appartient au secteur choisi. Secteur vide = « tous » (toujours vrai).
export function memeSecteur(p: AvecSecteur, secteur: string): boolean {
  if (!secteur) return true
  return (p.arrondissement ?? "").trim() === secteur
}
