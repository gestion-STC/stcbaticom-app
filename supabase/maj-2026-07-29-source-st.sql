-- Ajoute la SOURCE d'un sous-traitant (d'où il vient : Pages Jaunes, Google Maps, salon…).
-- Additif et idempotent : ne casse rien, réexécutable sans risque.
alter table public.st_sous_traitants
  add column if not exists source text not null default '';
