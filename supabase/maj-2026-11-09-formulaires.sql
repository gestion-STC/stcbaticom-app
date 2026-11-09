-- ════════════════════════════════════════════════════════════════════════════
-- LE MOTEUR DE CAMPAGNES, ÉTAPE 3 (Mahdi, 09/11/2026) : les réponses aux formulaires.
-- À coller AVANT de fusionner la PR. Se rejoue sans risque.
-- Un prospect écrit par la fonction serveur formulaire-campagne (lien signé) ; un commercial directement, au téléphone.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.cmp_reponses (
  id          uuid primary key default gen_random_uuid(),
  campagne_id uuid not null references public.cmp_campagnes(id) on delete cascade,
  creatif_id  text not null,
  contact_ref text not null,
  reponses    jsonb not null default '{}',
  rempli_par  text not null default 'prospect',
  cree_le     timestamptz not null default now()
);
create index if not exists cmp_reponses_contact on public.cmp_reponses (contact_ref, cree_le desc);
create index if not exists cmp_reponses_campagne on public.cmp_reponses (campagne_id);
alter table public.cmp_reponses enable row level security;
drop policy if exists acces_connecte on public.cmp_reponses;
create policy acces_connecte on public.cmp_reponses for all to authenticated using (true) with check (true);
