-- ============================================================================
--  À COLLER DANS LE PROJET **STCBATICOM** (ifvrmsiwlwppinfdmeao), après le SQL « Contrats DocuSign ».
--
--  Mahdi, 11/10 : « les modèles de contrats sont déjà enregistrés dans DocuSign ».
--  Le pack de contrats ne pointe donc plus vers des PDF déposés ici, mais vers
--  des MODÈLES DocuSign (template_id). Les valeurs saisies à l'envoi sont gardées.
-- ============================================================================
do $$ begin
  if to_regclass('public.st_contrats_modeles') is null then
    raise exception 'MAUVAIS PROJET ou SQL précédent manquant : coller d abord « Contrats DocuSign » dans STCBATICOM.';
  end if;
end $$;

alter table public.st_contrats_modeles
  add column if not exists template_id text not null default '',
  alter column chemin set default '';
alter table public.st_contrats_modeles drop constraint if exists st_contrats_modeles_chemin_key;
create unique index if not exists st_contrats_modeles_chemin_uniq on public.st_contrats_modeles (chemin) where chemin <> '';
create unique index if not exists st_contrats_modeles_template_uniq on public.st_contrats_modeles (template_id) where template_id <> '';

alter table public.st_contrats
  add column if not exists valeurs jsonb not null default '{}'::jsonb,   -- ce qui a été saisi à l'envoi (raison sociale, SIRET…)
  add column if not exists signataire_nom text not null default '',
  add column if not exists signataire_email text not null default '';

-- Contrôle
select id, nom, template_id, ordre, actif from public.st_contrats_modeles order by ordre;
