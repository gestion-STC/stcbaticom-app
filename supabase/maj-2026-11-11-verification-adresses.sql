-- ════════════════════════════════════════════════════════════════════════════
-- LA VÉRIFICATION DES ADRESSES AVANT L'ENVOI (Mahdi, 11/11/2026)
-- Un verdict par adresse : valide, douteux (le domaine accepte tout), invalide, attente. Écrit par les fonctions serveur
-- (moteur, campagnes-ia) ; lu par l'écran de la campagne. À coller en entier dans l'éditeur SQL de Supabase. Rejouable.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.cmp_verifications (
  email text primary key,
  statut text not null check (statut in ('valide', 'douteux', 'invalide', 'attente')),
  source text not null default 'local' check (source in ('local', 'instantly')),
  motif text not null default '',
  verifie_le timestamptz not null default now()
);
alter table public.cmp_verifications enable row level security;
drop policy if exists lecture_connecte on public.cmp_verifications;
create policy lecture_connecte on public.cmp_verifications for select to authenticated using (true);
revoke insert, update, delete on public.cmp_verifications from anon, authenticated;
