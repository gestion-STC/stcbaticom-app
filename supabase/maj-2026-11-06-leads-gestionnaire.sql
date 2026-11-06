-- ════════════════════════════════════════════════════════════════════════════
-- LEADS : ON LES TRAVAILLE JUSQU'À AVOIR LE GESTIONNAIRE (Mahdi, 06/11/2026)
--
-- « On laisse les leads dans Leads tant qu'on n'a pas eu le gestionnaire ; quand on l'a eu,
-- ils passent dans la base (intéressé, RDV, pas intéressé, à rappeler) et dans la machine
-- à relance comme tout le monde. »
--   · Gestionnaire joint (ou passée apporteur) : le lead est traité, avec son issue.
--   · Pas de réponse, standard : un essai de plus, le lead RESTE à traiter (plus de « retombé »).
--   · Faux numéro : l'agence sort en hors cible, ce qui ferme le lead (leads_suivre_agence).
--   · La file : un lead essayé il y a moins de 2 h passe après les autres (pas de rappel en boucle).
-- Ré-exécutable. À coller après maj-2026-11-06-leads.sql.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.leads_demarchage add column if not exists dernier_essai_le timestamptz;

create or replace function public.leads_suivre_appel() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  l record;
begin
  if new.type <> 'appel' or new.sens <> 'sortant' or new.resultat in ('', 'lance') then return new; end if;
  if tg_op = 'UPDATE' and old.resultat is not distinct from new.resultat and old.issue is not distinct from new.issue then return new; end if;
  -- L'issue notée après coup sur un appel « joint » : le lead fermé par cet appel la reçoit.
  if new.resultat in ('joint', 'apporteur') and tg_op = 'UPDATE' then
    update public.leads_demarchage set resultat = coalesce(nullif(new.issue, ''), new.resultat)
     where agence_id = new.agence_id and statut = 'traite' and traite_le >= new.date - interval '2 minutes';
  end if;
  select * into l from public.leads_demarchage where agence_id = new.agence_id and statut = 'a_traiter';
  if not found or new.date < l.cree_le - interval '2 minutes' then return new; end if;
  if new.resultat in ('joint', 'apporteur') then
    update public.leads_demarchage
       set statut = 'traite', traite_le = now(), traite_par = new.compte_id, resultat = coalesce(nullif(new.issue, ''), new.resultat), dernier_essai_le = new.date
     where id = l.id;
  else
    update public.leads_demarchage set tentatives = l.tentatives + 1, dernier_essai_le = new.date where id = l.id;
  end if;
  return new;
end $$;

create or replace function public.leads_a_traiter(p_proprietaire text default 'tous')
returns table (rang integer, lead jsonb, agence jsonb)
language sql
stable
security invoker
set search_path to 'public'
as $$
  select (row_number() over (order by coalesce(d.dernier_essai_le > now() - interval '2 hours', false), d.cree_le, d.id))::integer,
         jsonb_build_object('id', d.id, 'source', d.source, 'signal', d.signal, 'detail', d.detail, 'cree_le', d.cree_le,
                            'dernier_signal_le', d.dernier_signal_le, 'tentatives', d.tentatives, 'contact_id', d.contact_id,
                            'dernier_essai_le', d.dernier_essai_le),
         to_jsonb(l)
    from public.leads_demarchage d
    join public.agences_liste l on l.id = d.agence_id
   where d.statut = 'a_traiter'
     and (coalesce(p_proprietaire, 'tous') = 'tous'
          or (p_proprietaire = 'non_attribuees' and l.commercial_id is null)
          or l.commercial_id::text = p_proprietaire)
$$;
grant execute on function public.leads_a_traiter(text) to authenticated;
