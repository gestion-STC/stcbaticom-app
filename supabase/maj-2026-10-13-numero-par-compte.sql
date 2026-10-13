-- ═══════════════════════════════════════════════════════════════════════════
--  13/10/2026 — Un numéro d'appel par personne
--
--  Ringover fait sonner le PROPRIÉTAIRE du numéro avec lequel on appelle. Les deux numéros
--  étaient utilisés par tout le monde : un appel de Mahdi pouvait sonner chez Horlann.
--    · 01 84 80 61 28 → Mahdi      · 01 89 70 86 23 → Horlann
--  (modifiable ensuite dans Réglages › Numéros d'appel, colonne « Utilisé par »).
--  Chaque agence prend le numéro de la personne qui la démarche (une seule fois).
--
--  À coller en une fois dans l'éditeur SQL du projet Baticom. Rejouable.
-- ═══════════════════════════════════════════════════════════════════════════

update public.parametres
   set valeur = '[{"numero":"+33 1 84 80 61 28","pause":false,"compteId":"b3a3dd4d-de08-4370-b794-227b8ddf0ba5"},{"numero":"33 1 89 70 86 23","pause":false,"compteId":"46fd93e4-fcd0-4b5e-bac0-5ba1f92babdd"}]',
       maj_le = now()
 where cle = 'numeros_emission';

update public.agences set numero_emission = '+33 1 84 80 61 28'
 where commercial_id = 'b3a3dd4d-de08-4370-b794-227b8ddf0ba5' and numero_emission <> '' and numero_emission <> '+33 1 84 80 61 28';
update public.agences set numero_emission = '33 1 89 70 86 23'
 where commercial_id = '46fd93e4-fcd0-4b5e-bac0-5ba1f92babdd' and numero_emission <> '' and numero_emission <> '33 1 89 70 86 23';

-- Contrôle : chaque personne n'a plus que SON numéro sur ses agences.
select case commercial_id when 'b3a3dd4d-de08-4370-b794-227b8ddf0ba5' then 'Mahdi' when '46fd93e4-fcd0-4b5e-bac0-5ba1f92babdd' then 'Horlann' else 'non attribuées' end as qui,
       numero_emission, count(*)
  from public.agences where numero_emission <> '' group by 1, 2 order by 1, 2;
