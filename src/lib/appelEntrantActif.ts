// Petit « drapeau » partagé entre composants : un appel ENTRANT est-il en cours ?
//
// TelephoneRingover le lève à chaque fois qu'il voit un appel entrant (sondage ou
// webhook). Sessions de call le consulte avant de composer en mode auto, pour ne
// JAMAIS lancer un appel par-dessus quelqu'un qui est en train de t'appeler.
//
// Pas d'événement « fin d'appel » requis : le drapeau expire tout seul 15 s après
// la dernière observation (il est ré-observé toutes les ~5 s tant que ça dure).

let dernierVu = 0

// À appeler à chaque observation d'un appel entrant (sonnerie ou conversation).
export function marquerEntrantActif(): void {
  dernierVu = Date.now()
}

// Vrai si un appel entrant a été observé il y a moins de 15 s.
export function entrantActif(): boolean {
  return Date.now() - dernierVu < 15000
}
