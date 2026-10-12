-- ═══════════════════════════════════════════════════════════════════════════
-- LE COMPTEUR DE CLICS D'UNE FICHE = LE JOURNAL, À L'UNITÉ (12/10/2026)
--
-- Mesuré ce soir : le journal st_clics est complet (247 clics, tous rattachés),
-- mais 5 fiches affichaient moins de clics que lui. Cause : la fonction lien-st
-- lisait nb_clics puis écrivait nb_clics + 1 ; deux clics dans la même seconde
-- (double-clic, deux liens ouverts ensemble) écrivaient tous deux la même valeur.
--
-- Désormais c'est la BASE qui tient le compteur : à chaque clic enregistré, elle
-- recompte les clics de la fiche dans le journal. Le compteur ne peut plus
-- diverger, même avec cent clics simultanés.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.st_clic_vers_fiche()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.destination = 'stop' then
    return new;
  end if;
  update public.st_sous_traitants s
     set nb_clics = (select count(*) from public.st_clics c
                      where c.sous_traitant_id = new.sous_traitant_id and c.destination <> 'stop'),
         dernier_clic_le = greatest(coalesce(s.dernier_clic_le, new.clique_le), new.clique_le)
   where s.id = new.sous_traitant_id;
  return new;
end;
$$;

drop trigger if exists st_clics_vers_fiche on public.st_clics;
create trigger st_clics_vers_fiche
  after insert on public.st_clics
  for each row execute function public.st_clic_vers_fiche();

-- Rattrapage : toutes les fiches reprennent le compte exact du journal.
update public.st_sous_traitants s
   set nb_clics = j.n
  from (select sous_traitant_id, count(*)::int as n
          from public.st_clics where destination <> 'stop'
         group by sous_traitant_id) j
 where j.sous_traitant_id = s.id and s.nb_clics is distinct from j.n;

-- Vérification : doit afficher 0.
select count(*) as fiches_en_ecart
  from public.st_sous_traitants s
  left join (select sous_traitant_id, count(*)::int as n from public.st_clics
              where destination <> 'stop' group by sous_traitant_id) j on j.sous_traitant_id = s.id
 where coalesce(s.nb_clics, 0) <> coalesce(j.n, 0);
