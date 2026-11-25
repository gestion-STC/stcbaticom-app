-- CAMPAGNES FIABLES (25/11/2026). Additif : rien n'est supprimé. À lancer une fois, après fusion.
--   1. lead_poser : un signal plus fort remplace le signal d'un lead déjà ouvert (avant : seule la date changeait).
--   2. Les mails déjà partis chez Instantly (email_sent reçu, message rangé) reçoivent leur confirmation « delivre » :
--      sans elle, l'écran les compterait « en attente chez Instantly ».
--   3. Les demandes d'avis aux sous-traitants actuels, parties du démarchage sans agence (alerte « mail_sans_agence »),
--      sont rangées au recrutement.

-- 1. La force d'un signal : compte ouvert > réponse écrite, formulaire, lead posé à la main > page « Créer un compte »
--    > plaquette, campagne (clic, ouverture).
create or replace function public.lead_force(p_source text) returns integer
 language sql immutable set search_path to 'public'
as $$
  select case p_source when 'compte' then 5 when 'mail' then 4 when 'formulaire' then 4 when 'manuel' then 4 when 'page_compte' then 3 else 1 end
$$;

-- Repart de la version du 25/11 (maj-2026-11-25-robots-et-desinscriptions.sql) ; seul change le lead déjà ouvert.
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
  -- Lead déjà ouvert : la date du dernier signal avance ; un signal PLUS FORT remplace aussi le signal et la source
  -- (une plaquette puis un compte ouvert : le commercial doit voir « compte ouvert »).
  update public.leads_demarchage l set
      dernier_signal_le = greatest(l.dernier_signal_le, p_quand),
      contact_id = coalesce(l.contact_id, p_contact),
      signal = case when public.lead_force(p_source) > public.lead_force(l.source) then p_signal else l.signal end,
      detail = case when public.lead_force(p_source) > public.lead_force(l.source) then coalesce(p_detail, '') else l.detail end,
      source = case when public.lead_force(p_source) > public.lead_force(l.source) then p_source else l.source end
   where l.agence_id = p_agence and l.statut = 'a_traiter' returning l.id into v;
  if v is not null then return v; end if;
  if exists (select 1 from public.leads_demarchage where agence_id = p_agence and statut = 'traite' and traite_le > p_quand - interval '3 days') then return null; end if;
  insert into public.leads_demarchage (agence_id, contact_id, source, signal, detail, cree_le, dernier_signal_le)
  values (p_agence, p_contact, p_source, p_signal, coalesce(p_detail, ''), p_quand, p_quand)
  on conflict (agence_id) where statut = 'a_traiter' do update set
      dernier_signal_le = greatest(leads_demarchage.dernier_signal_le, excluded.dernier_signal_le),
      signal = case when public.lead_force(excluded.source) > public.lead_force(leads_demarchage.source) then excluded.signal else leads_demarchage.signal end,
      detail = case when public.lead_force(excluded.source) > public.lead_force(leads_demarchage.source) then excluded.detail else leads_demarchage.detail end,
      source = case when public.lead_force(excluded.source) > public.lead_force(leads_demarchage.source) then excluded.source else leads_demarchage.source end
  returning id into v;
  return v;
end $function$;

-- 2. Les confirmations « parti » des mails Instantly déjà rangés (email_sent reçu avant cette mise à jour).
insert into public.cmp_evenements (campagne_id, envoi_id, contact_ref, type, le)
select e.campagne_id, e.id, e.contact_ref, 'delivre', m.created_at
  from public.cmp_envois e
  join public.cmp_campagnes c on c.id = e.campagne_id
  join lateral (select x.created_at from public.messages x where x.sens = 'sortant' and x.message_id = e.fournisseur_id order by x.created_at limit 1) m on true
 where e.canal in ('mail', 'newsletter') and e.statut = 'envoye' and not e.test
   and c.base_id not in ('locataires', 'clients_gestionnaires', 'sous_traitants_actifs') and coalesce(c.origine, '') <> 'st'
   and not exists (select 1 from public.cmp_evenements v where v.envoi_id = e.id and v.type = 'delivre');

-- 3. Les demandes d'avis aux sous-traitants actuels (et leurs réponses) : au recrutement, sur la fiche du sous-traitant.
update public.messages m set
    espace = 'recrutement',
    sous_traitant_id = coalesce(m.sous_traitant_id, (select s.id from public.st_sous_traitants s where lower(s.email) = lower(case when m.sens = 'sortant' then m.a else m.de end) limit 1))
 where m.espace = 'demarchage' and m.agence_id is null
   and lower(case when m.sens = 'sortant' then m.a else m.de end) in (select lower(k.email) from public.cmp_contacts k where k.base_id = 'sous_traitants_actifs' and coalesce(k.email, '') <> '');

select 'campagnes fiables : en place' as etat,
  (select count(*) from pg_proc where proname = 'lead_force') as fonction_force_du_signal,
  (select count(*) from public.cmp_evenements where type = 'delivre') as confirmations_parti,
  (select count(*) from public.messages where espace = 'demarchage' and sens = 'sortant' and agence_id is null and created_at >= '2026-10-09') as mails_sans_agence_restants;
