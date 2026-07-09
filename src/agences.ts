// Une agence (entreprise). Reliée en N-N aux gestionnaires (prospects).
export type Agence = {
  id?: string
  nom: string
  adresse: string
  arrondissement: string
  logoUrl: string
  nbLots: number // nombre de lots sous gestion
  nbGestionnaires?: number // calculé pour l'affichage
}
