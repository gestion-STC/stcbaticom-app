// RELAIS (fusion dans STC Bâtiment) : l'ancienne adresse instantly-evenements transmet tout à commercial-instantly-evenements du projet STC.
// Méthode, paramètres, corps et en-têtes utiles intacts ; réponse renvoyée telle quelle. Voir ../_relais/relais.ts.
import { configDepuis, relayer } from "../_relais/relais.ts"

const cfg = configDepuis((k) => Deno.env.get(k))
Deno.serve((req: Request) => relayer(req, "commercial-instantly-evenements", cfg))
