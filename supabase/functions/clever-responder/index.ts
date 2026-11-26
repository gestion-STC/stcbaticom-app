// Ancien relais Ringover (code secret écrit en clair dans l'historique du dépôt), neutralisé le 26/11/2026.
// Le relais en usage est « ringover-webhook » (code secret rangé dans parametres.ringover_webhook_cle).
// Même modèle que debug-resend : tout appel reçoit 410, rien n'est lu ni écrit.
Deno.serve(() => new Response("Gone", { status: 410 }))
