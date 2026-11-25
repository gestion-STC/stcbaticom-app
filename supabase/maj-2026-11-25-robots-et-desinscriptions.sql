-- Robots de sécurité et désinscriptions (25/11/2026).
-- Constat : les passerelles de sécurité des boîtes mail (Microsoft, Mimecast…) ouvrent TOUS les liens d'un mail pour
-- les vérifier. Elles ouvraient la plaquette ET le lien de désinscription dans la même seconde : 7 faux leads et
-- 7 agences désinscrites sans l'avoir demandé sur la prospection du 19 au 24/11.
-- Ce fichier (rien n'est supprimé) :
--   1. marque les clics de robots dans cmp_evenements (colonne robot) ; ils ne font ni lead ni taux ;
--   2. site_noter_clic : un clic sur un lien suivi est noté une seule fois, et marqué robot si un AUTRE lien du même
--      contact a été ouvert dans les 5 secondes (une personne ne fait pas ça, un robot si) ;
--   3. une agence désinscrite voit ses leads ouverts fermés, et un clic ne peut plus en faire un lead ;
--   4. le déclencheur des leads ignore les événements de robots.

alter table public.cmp_evenements add column if not exists robot boolean not null default false;

create or replace function public.site_noter_clic(p_lien uuid, p_quand timestamptz, p_titre text, p_note text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  l record;
  d record;
begin
  select id, agence_id, contact_id into l from public.liens_suivis where id = p_lien;
  if l.agence_id is null then return 'sans_agence'; end if;
  perform pg_advisory_xact_lock(hashtext('clic:' || l.agence_id::text));
  if exists (select 1 from public.liens_suivis x
              where x.agence_id = l.agence_id and x.id <> l.id
                and x.dernier_clic_le between p_quand - interval '5 seconds' and p_quand + interval '5 seconds') then
    if not exists (select 1 from public.cmp_evenements e where e.contact_ref = l.agence_id::text and e.robot and e.le > p_quand - interval '30 seconds') then
      select * into d from public.cmp_dernier_envoi(l.agence_id::text, p_quand);
      if d.envoi_id is not null then
        insert into public.cmp_evenements (campagne_id, envoi_id, contact_ref, type, le, robot)
        values (d.campagne_id, d.envoi_id, l.agence_id::text, 'clic', p_quand, true);
      end if;
    end if;
    return 'robot';
  end if;
  if exists (select 1 from public.activites a
              where a.agence_id = l.agence_id and a.type = 'note' and a.source = 'site' and a.titre = p_titre
                and a.date between p_quand - interval '30 seconds' and p_quand + interval '30 seconds') then
    return 'doublon';
  end if;
  insert into public.activites (agence_id, contact_id, type, titre, note, date, compte_nom, source)
  values (l.agence_id, l.contact_id, 'note', p_titre, p_note, p_quand, 'Site STC Bâtiment', 'site');
  update public.agences set dernier_signal_le = p_quand, dernier_signal = p_titre where id = l.agence_id;
  return 'ok';
end $function$;
revoke all on function public.site_noter_clic(uuid, timestamptz, text, text) from public, anon, authenticated;

create or replace function public.leads_fermer_si_desinscrit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.ne_plus_ecrire_le is not null and old.ne_plus_ecrire_le is null then
    update public.leads_demarchage set statut = 'traite', traite_le = now(), resultat = 'desinscrit'
     where agence_id = new.id and statut = 'a_traiter';
  end if;
  return new;
end $function$;
create or replace trigger leads_fermer_si_desinscrit after update of ne_plus_ecrire_le on public.agences
  for each row execute function public.leads_fermer_si_desinscrit();

create or replace function public.lead_poser(p_agence uuid, p_contact uuid, p_source text, p_signal text, p_detail text, p_quand timestamp with time zone DEFAULT now())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a record;
  v uuid;
begin
  select type, etape, ne_plus_ecrire_le into a from public.agences where id = p_agence;
  if not found or (a.type = 'apporteur' and public.cmp_campagne_qui_decide(p_agence::text) is null) or a.etape in ('client', 'hors_cible') then return null; end if;
  -- Désinscrite : un clic ou une page ouverte ne fait plus un lead (une réponse écrite ou un compte ouvert, si).
  if a.ne_plus_ecrire_le is not null and p_source in ('plaquette', 'page_compte', 'campagne') then return null; end if;
  update public.leads_demarchage set dernier_signal_le = greatest(dernier_signal_le, p_quand), contact_id = coalesce(contact_id, p_contact)
   where agence_id = p_agence and statut = 'a_traiter' returning id into v;
  if v is not null then return v; end if;
  if exists (select 1 from public.leads_demarchage where agence_id = p_agence and statut = 'traite' and traite_le > p_quand - interval '3 days') then return null; end if;
  insert into public.leads_demarchage (agence_id, contact_id, source, signal, detail, cree_le, dernier_signal_le)
  values (p_agence, p_contact, p_source, p_signal, coalesce(p_detail, ''), p_quand, p_quand)
  on conflict (agence_id) where statut = 'a_traiter' do update set dernier_signal_le = excluded.dernier_signal_le
  returning id into v;
  return v;
end $function$;

create or replace trigger cmp_lead_evenement after insert on public.cmp_evenements
  for each row when (not new.robot) execute function public.cmp_lead_depuis_evenement();

select 'robots et désinscriptions : en place' as etat,
  (select count(*) from information_schema.columns where table_name = 'cmp_evenements' and column_name = 'robot') as colonne_robot,
  (select count(*) from pg_proc where proname in ('site_noter_clic', 'leads_fermer_si_desinscrit')) as fonctions;
