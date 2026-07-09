// Validité d'un numéro de téléphone (pour prévenir avant d'appeler dans le vide).

// Ne garde que les chiffres.
export function chiffresTel(tel: string): string {
  return (tel || "").replace(/\D/g, "")
}

// Clé de COMPARAISON de deux numéros, quel que soit leur format (0X…, +33…, 33…, 0033…).
// On ramène tout au « numéro national sans préfixe » (ex. 07 83 09 23 47, +33 7 83 09 23 47
// et 33783092347 donnent tous « 783092347 »). Sert à reconnaître un appelant.
export function cleComparaison(tel: string): string {
  let d = chiffresTel(tel)
  if (d.startsWith("00")) d = d.slice(2)
  if (d.length === 11 && d.startsWith("33")) d = d.slice(2) // +33 X… → X…
  else if (d.length === 10 && d.startsWith("0")) d = d.slice(1) // 0X… → X…
  return d
}

// Vrai si le numéro est « composable » : assez de chiffres pour être un vrai numéro.
// France = 10 chiffres (0X XX XX XX XX) · international / +33 = 11 à 15 (E.164).
// Moins de 10 chiffres = incomplet/incorrect → on prévient l'utilisateur.
export function numeroValide(tel: string): boolean {
  const d = chiffresTel(tel)
  return d.length >= 10 && d.length <= 15
}

// Met un numéro au format lisible « 07 69 81 12 15 » (groupes de 2 chiffres).
// Les écritures internationales (+33…, 0033…, 33 0X…) sont ramenées en « 0… ». Vide → "".
export function formaterTelephone(tel: string): string {
  let d = chiffresTel(tel)
  if (!d) return ""
  if (d.startsWith("00")) d = d.slice(2) // 0033… → 33…
  if (d.length === 12 && d.startsWith("330")) d = d.slice(2) // +33 0X… (double préfixe) → 0X…
  else if (d.length === 11 && d.startsWith("33")) d = "0" + d.slice(2) // +33 X… → 0X…
  return (d.match(/.{1,2}/g) ?? []).join(" ")
}
