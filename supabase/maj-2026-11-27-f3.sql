-- Lot f3 (écrans Campagnes, Suivi, Avis), 27/11/2026 : D20.
-- Modifier les étapes d'une campagne qui a déjà des inscrits (ajouter, supprimer, déplacer une action) ne décale plus
-- personne. Chaque inscription retient la POSITION de sa prochaine étape (etape_index) ; à chaque changement des étapes,
-- ce déclencheur la recale sur l'étape elle-même, retrouvée par son identifiant dans l'ancienne liste :
--   · étape toujours là (même déplacée)  -> sa nouvelle position ;
--   · étape supprimée                    -> la suivante encore présente ;
--   · plus rien après                    -> la fin de la séquence (le moteur la termine au passage suivant).
-- Rien n'est bloqué : la modification s'enregistre comme avant. Cas réel : sur « histoires », supprimer le premier
-- « Attendre 7 j » laissait 27 agences sans leur 2e mail ; elles passent de la position 2 à la position 1 (le même mail).
-- Le même calcul existe à l'écran (configCampagne.ts, recalerEtapeIndex) pour l'affichage avant rechargement.
-- Nouvelle fonction, non suivie par sante_demarchage : aucune empreinte à changer. Idempotent, rien supprimé.
-- À coller quand on veut (avant ou après la fusion) : le front ne dépend pas de ce fichier ; plus tôt il est collé,
-- plus tôt une modification d'étapes est sans risque.

begin;

create or replace function public.cmp_recaler_inscriptions() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  with cible as (
    select i.id,
      coalesce((
        select n.o - 1
        from jsonb_array_elements(coalesce(old.etapes, '[]'::jsonb)) with ordinality a(e, o)
        join jsonb_array_elements(coalesce(new.etapes, '[]'::jsonb)) with ordinality n(e, o) on n.e->>'id' = a.e->>'id'
        where a.o - 1 >= i.etape_index
        order by a.o, n.o
        limit 1
      ), jsonb_array_length(coalesce(new.etapes, '[]'::jsonb)))::int as pos
    from cmp_inscriptions i
    where i.campagne_id = new.id
  )
  update cmp_inscriptions i set etape_index = cible.pos
  from cible
  where cible.id = i.id and i.etape_index <> cible.pos;
  return null;
end $$;

revoke all on function public.cmp_recaler_inscriptions() from public, anon, authenticated;

create or replace trigger cmp_campagnes_recaler_inscriptions
  after update of etapes on public.cmp_campagnes
  for each row when (old.etapes is distinct from new.etapes)
  execute function public.cmp_recaler_inscriptions();

commit;

-- Contrôle. Attendu : 1 ligne « déclencheur » = 1 ; puis « histoires » inchangée (le collage ne touche aucune inscription) :
-- desinscrit@2 = 1, en_cours@0 = 30, en_cours@2 = 27, lead@2 = 2 (chiffres du 26/11 ; le moteur a pu avancer depuis).
select 'déclencheur' as quoi, count(*)::text as n from pg_trigger where tgname = 'cmp_campagnes_recaler_inscriptions' and tgrelid = 'public.cmp_campagnes'::regclass
union all
select 'histoires ' || i.statut || '@' || i.etape_index, count(*)::text
from cmp_inscriptions i join cmp_campagnes c on c.id = i.campagne_id
where c.nom = 'Prospection · base existante (histoires)'
group by i.statut, i.etape_index
order by 1;
