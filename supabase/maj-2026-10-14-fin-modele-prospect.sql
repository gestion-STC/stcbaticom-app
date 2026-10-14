-- ═══════════════════════════════════════════════════════════════════════════
--  FIN DE L'ANCIEN MODÈLE « PROSPECT » (14/10/2026)
--
--  ⚠ À coller SEULEMENT APRÈS avoir redéployé envoyer-email et recevoir-email
--  (la nouvelle version ne lit plus ces tables ; l'ancienne échouerait sans elles).
--
--  Depuis la refonte du 09/10, tout vit sur les AGENCES. Les deux dernières tables de
--  l'ancien modèle rejoignent les 7 autres dans le schéma « archive » : rien n'est effacé,
--  on peut toujours les relire (archive.prospects, archive.emails_envoyes).
--    · prospects      : 2 789 fiches, plus écrites depuis le 09/10 ;
--    · emails_envoyes : 95 en-têtes de l'ancien moteur, le dernier le 08/10.
--  La colonne messages.prospect_id (plus écrite par personne) est retirée.
-- ═══════════════════════════════════════════════════════════════════════════

create schema if not exists archive;
alter table if exists public.prospects set schema archive;
alter table if exists public.emails_envoyes set schema archive;
alter table public.messages drop column if exists prospect_id;

-- Contrôle : 2 lignes « archive », 0 colonne prospect_id restante.
select table_schema, table_name from information_schema.tables where table_name in ('prospects', 'emails_envoyes')
union all
select 'reste', 'messages.prospect_id' from information_schema.columns where table_schema = 'public' and table_name = 'messages' and column_name = 'prospect_id';
