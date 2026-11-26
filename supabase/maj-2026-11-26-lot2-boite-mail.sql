-- ════════════════════════════════════════════════════════════════════════════
-- LOT 2 — BOÎTE MAIL (26/11/2026)
--
-- Un mail envoyé qui rebondit est marqué « non remis » dans la boîte (avant : l'écran disait « E-mail envoyé »,
-- seule une note sur la fiche agence le signalait). Deux colonnes, remplies par resend-evenements :
--   · messages.non_remis_le    : quand le rebond est arrivé ;
--   · messages.non_remis_motif : ce que le serveur destinataire a répondu.
-- Le passé : les 35 rebonds déjà notés sur les fiches (activités « E-mail rebondi (adresse injoignable) »).
--
-- Idempotent, ne supprime rien. À passer AVANT la mise en ligne de l'écran (l'écran sait toutefois s'en passer).
-- ════════════════════════════════════════════════════════════════════════════
begin;

alter table public.messages add column if not exists non_remis_le timestamptz;
alter table public.messages add column if not exists non_remis_motif text;

-- Le passé : la note de rebond posée sur la fiche porte l'identifiant du message (activites.message_id).
update public.messages m
   set non_remis_le = a.date,
       non_remis_motif = coalesce(nullif(trim(split_part(a.note, ' · ', 2)), ''), 'adresse injoignable')
  from (
    select distinct on (message_id) message_id, date, note
      from public.activites
     where titre = 'E-mail rebondi (adresse injoignable)' and message_id is not null
     order by message_id, date
  ) a
 where m.id = a.message_id and m.sens = 'sortant' and m.non_remis_le is null;

commit;

-- Contrôle : attendu 35 messages non remis (les 35 rebonds notés), 0 rebond noté sans marque.
select
  (select count(*) from public.messages where non_remis_le is not null) as messages_non_remis,
  (select count(*) from public.activites a join public.messages m on m.id = a.message_id
    where a.titre = 'E-mail rebondi (adresse injoignable)' and m.non_remis_le is null) as rebonds_sans_marque;
