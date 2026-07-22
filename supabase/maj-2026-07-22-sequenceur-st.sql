-- ============================================================================
--  Recrutement sous-traitants — séquenceur e-mail + SMS + suivi du tunnel
--  (base ST → séquence → clic sur le lien → dépôt du dossier sur le site)
--
--  À exécuter UNE FOIS dans Supabase → SQL Editor (copier/coller → Run).
--  Ré-exécutable sans risque (create ... if not exists, drop policy if exists).
--  RLS = accès réservé à l'utilisateur CONNECTÉ (comme le reste, depuis le Lot 5).
--  Les fonctions serveur (lien-st, sequenceur-st) utilisent la clé service_role
--  et passent au-dessus de RLS : pas de policy « anon » nécessaire ici.
-- ============================================================================

-- 1) Les séquences (une séquence = un scénario de relance nommé) ---------------
create table if not exists public.st_sequences (
  id       uuid primary key default gen_random_uuid(),
  nom      text not null default 'Séquence',
  actif    boolean not null default false,   -- séquence utilisée pour démarrer les nouveaux ST
  cree_le  timestamptz not null default now()
);

-- 2) Les étapes d'une séquence (chaque étape = 1 action : SMS OU e-mail) -------
create table if not exists public.st_etapes (
  id           uuid primary key default gen_random_uuid(),
  sequence_id  uuid not null references public.st_sequences(id) on delete cascade,
  ordre        integer not null default 0,          -- position dans la séquence
  canal        text not null default 'email',       -- 'email' | 'sms'
  delai_jours  integer not null default 0,          -- envoi à J+delai après le démarrage
  objet        text not null default '',            -- objet (e-mail uniquement)
  contenu      text not null default '',            -- corps e-mail (HTML) ou texte du SMS
  actif        boolean not null default true,
  cree_le      timestamptz not null default now()
);
create index if not exists st_etapes_seq_idx on public.st_etapes(sequence_id, ordre);

-- 3) La base des sous-traitants à recruter ------------------------------------
create table if not exists public.st_sous_traitants (
  id              uuid primary key default gen_random_uuid(),
  entreprise      text not null default '',
  contact         text not null default '',
  email           text not null default '',
  telephone       text not null default '',
  metier          text not null default '',
  zone            text not null default '',          -- ville / département / secteur
  statut          text not null default 'a_contacter', -- a_contacter | en_sequence | depose | exclu
  sequence_id     uuid references public.st_sequences(id) on delete set null,
  etape_courante  integer not null default 0,         -- index de la PROCHAINE étape à envoyer
  demarre_le      timestamptz,                         -- date d'entrée en séquence
  token           text not null unique default replace(gen_random_uuid()::text, '-', ''), -- lien tracké
  dernier_clic_le timestamptz,                         -- dernière visite du lien (impression)
  nb_clics        integer not null default 0,
  depose_le       timestamptz,                         -- date de dépôt du dossier (conversion)
  dossier_id      uuid,                                -- id du dossier dans dossiers_st (site)
  cree_le         timestamptz not null default now()
);
create index if not exists st_st_statut_idx on public.st_sous_traitants(statut);
create index if not exists st_st_email_idx  on public.st_sous_traitants(lower(email));
create index if not exists st_st_token_idx  on public.st_sous_traitants(token);

-- 4) Journal des envois (anti-doublon : jamais deux fois la même étape) --------
create table if not exists public.st_envois (
  id                uuid primary key default gen_random_uuid(),
  sous_traitant_id  uuid not null references public.st_sous_traitants(id) on delete cascade,
  etape_id          uuid not null references public.st_etapes(id) on delete cascade,
  canal             text not null default 'email',
  envoye_le         timestamptz not null default now(),
  statut            text not null default 'envoye',   -- 'envoye' | 'erreur'
  erreur            text not null default ''
);
create index if not exists st_envois_st_idx on public.st_envois(sous_traitant_id);
-- Un même ST ne reçoit chaque étape qu'une seule fois (si l'envoi a réussi).
create unique index if not exists st_envois_unique_idx
  on public.st_envois(sous_traitant_id, etape_id) where statut = 'envoye';

-- 5) Journal des clics sur le lien tracké (les « impressions ») ----------------
create table if not exists public.st_clics (
  id                uuid primary key default gen_random_uuid(),
  sous_traitant_id  uuid not null references public.st_sous_traitants(id) on delete cascade,
  clique_le         timestamptz not null default now(),
  user_agent        text not null default ''
);
create index if not exists st_clics_st_idx on public.st_clics(sous_traitant_id);

-- 6) Pilotage (une seule ligne) : volume voulu, cadence, plage, marche/arrêt ---
create table if not exists public.st_pilotage (
  id             integer primary key default 1 check (id = 1),
  actif          boolean not null default false,        -- Lancer / Arrêter global
  objectif_hebdo integer not null default 2,            -- nb de ST à recruter par semaine
  plafond_jour   integer not null default 20,           -- nb max d'envois par jour
  heure_min      time not null default '09:00',
  heure_max      time not null default '18:00',
  jours          integer[] not null default '{1,2,3,4,5}', -- 1=lundi … 7=dimanche
  sequence_id    uuid references public.st_sequences(id) on delete set null,
  maj_le         timestamptz not null default now()
);
insert into public.st_pilotage (id) values (1) on conflict (id) do nothing;

-- 7) Sécurité (RLS) : accès réservé à l'utilisateur connecté -------------------
do $$
declare t text;
begin
  foreach t in array array[
    'st_sequences','st_etapes','st_sous_traitants','st_envois','st_clics','st_pilotage'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "acces_connecte" on public.%I', t);
    execute format(
      'create policy "acces_connecte" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
