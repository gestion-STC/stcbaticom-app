// Ancien exécuteur des règles d'envoi (système d'avant les campagnes), appelable sans aucune clé : NEUTRALISÉ le
// 11/11/2026 (sécurité). Aucune tâche planifiée ne l'appelait plus.
Deno.serve(() => new Response("Fonction retirée.", { status: 410 }))
