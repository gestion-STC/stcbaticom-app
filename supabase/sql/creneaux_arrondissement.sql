-- Ajoute le SECTEUR ciblé (arrondissement) à un créneau d'appel.
-- Permet à un créneau programmé de n'appeler qu'un secteur précis ("" = tous).
-- (À exécuter UNE FOIS dans Supabase → SQL Editor. Ré-exécutable sans risque.)

alter table public.creneaux
  add column if not exists arrondissement text not null default '';
