-- Ajoute le SENS de l'appel (entrant / sortant) au journal d'appels.
-- Les appels déjà enregistrés étaient tous des appels SORTANTS (sessions de prospection)
-- → ils prennent la valeur par défaut 'sortant'. (À exécuter UNE FOIS dans SQL Editor.)

alter table public.appels
  add column if not exists sens text not null default 'sortant';
