-- ============================================================================
--  À COLLER DANS LE PROJET **STCBATICOM** (ifvrmsiwlwppinfdmeao).
--
--  Le tri des leads (Mahdi, 12/10/2026) : les leads encore dans la session de call
--  du recrutement ont TOUS été appelés sous l'ancienne version. On les range
--  (suivi = 'archive') pour qu'ils ne ressortent plus dans « Leads à appeler » :
--  Adam n'appellera pas des leads périmés. Ils restent visibles sur leur fiche
--  (« Archivé (ancienne version) ») et un clic les remet dans les leads.
--  Ré-exécutable sans danger (la seconde fois, 0 ligne).
-- ============================================================================
do $$ begin
  if to_regclass('public.st_sous_traitants') is null or to_regclass('public.st_appels') is null then
    raise exception 'MAUVAIS PROJET : ce SQL se colle dans STCBATICOM (ifvrmsiwlwppinfdmeao).';
  end if;
end $$;

-- 1) Le suivi accepte « archive »
alter table public.st_sous_traitants drop constraint if exists st_sous_traitants_suivi_connu;
alter table public.st_sous_traitants add constraint st_sous_traitants_suivi_connu
  check (suivi in ('', 'a_rappeler', 'va_deposer', 'pas_interesse', 'hors_cible', 'injoignable', 'archive'));

-- 2) Les leads d'aujourd'hui (exactement ce que la file « Leads à appeler » montre) → archivés
with ranges as (
  update public.st_sous_traitants
     set suivi = 'archive', suivi_le = now(), suivi_motif = 'appelé sous l''ancienne version, avant le 12/10/2026'
   where depose_le is null and desinscrit_le is null and statut <> 'desinscrit'
     and (bareme_vu_le is not null or candidature_clic_le is not null or nb_clics > 0)
     and telephone <> '' and telephone_invalide = false
     and suivi = '' and rappel_le is null
  returning id
)
select count(*) as leads_archives from ranges;
