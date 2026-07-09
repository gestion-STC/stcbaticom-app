-- Numéro d'émission par prospect (rotation intelligente des numéros Ringover).
-- Chaque prospect garde le MÊME numéro d'appel à chaque fois (il reconnaît l'appelant),
-- et le volume se répartit entre plusieurs numéros pour éviter le signalement « spam ».
--
-- À exécuter une fois dans Supabase : SQL Editor → coller → Run.
-- (Aucune donnée supprimée : on ajoute seulement une colonne, vide par défaut.)

alter table public.prospects
  add column if not exists numero_emission text default '';
