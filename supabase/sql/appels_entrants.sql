-- Table des événements d'appel poussés par le webhook Ringover.
-- Le logiciel s'y abonne en temps réel (Supabase Realtime) pour afficher
-- la bannière « Appel entrant » avec le vrai numéro, à la seconde.
-- (À exécuter UNE FOIS dans Supabase → SQL Editor. Ré-exécutable sans risque.)

create table if not exists public.appels_entrants (
  id bigint generated always as identity primary key,
  call_id text not null default '',
  evenement text not null default '',   -- ringing / answered / hangup…
  de text not null default '',          -- numéro appelant
  vers text not null default '',        -- numéro appelé (ton numéro Ringover)
  direction text not null default '',   -- in / out
  brut jsonb,                           -- payload complet (diagnostic)
  cree_le timestamptz not null default now()
);

-- Active la diffusion temps réel des insertions vers le logiciel.
do $$ begin
  alter publication supabase_realtime add table public.appels_entrants;
exception when duplicate_object then null; -- déjà activé : rien à faire
end $$;
