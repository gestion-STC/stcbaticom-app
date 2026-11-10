-- ════════════════════════════════════════════════════════════════════════════
-- À COLLER DANS BATICOM (projet ifvrmsiwlwppinfdmeao).
-- LA PASSERELLE DES AVIS (Mahdi, 11/11/2026) : les locataires et sous-traitants actifs venus de STC Bâtiment.
-- Chaque ligne garde sa référence STC (un locataire = un ordre de service : il n'est sollicité qu'une fois par chantier)
-- et la date de fin du chantier. Rejouable.
-- ════════════════════════════════════════════════════════════════════════════
do $$ begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'avis_contacts') then
    raise exception 'MAUVAIS PROJET : ce SQL se colle dans Baticom.';
  end if;
end $$;

alter table public.avis_contacts add column if not exists ref_stc text;
alter table public.avis_contacts add column if not exists fin_le timestamptz;
alter table public.avis_contacts add column if not exists maj_le timestamptz not null default now();
create unique index if not exists avis_contacts_ref_stc on public.avis_contacts (ref_stc);
