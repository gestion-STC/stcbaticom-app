-- ═══════════════════════════════════════════════════════════════════════════
--  13/10/2026 — Deux règles de Mahdi
--
--  1. « À partir du moment où j'appuie sur le bouton Appeler, la date de l'appel
--     doit être marquée sur l'agence et dans sa fiche. »
--     → `appel_lancer` écrit l'appel dès que Ringover l'a pris (résultat « lance »
--       = « Appel lancé, résultat non noté »). Le résultat choisi ensuite COMPLÈTE
--       cette même ligne (`appel_enregistrer(..., p_appel_id)`) : un seul appel
--       dans le fil, jamais deux.
--
--  2. « La seule chose qui fasse foi pour répartir la base, ce sont les secteurs. »
--     → une agence appartient à celui qui démarche son secteur. Fin de « celui qui
--       a appelé le premier garde l'agence » (déclencheur supprimé) et de « les
--       agences déjà attribuées gardent leur propriétaire » (attribuer_secteur
--       écrase toujours). Réalignement une fois de toute la base.
--       Les agences SANS secteur ne bougent pas (Réglages › Secteurs, en bloc).
--
--  À coller en une fois dans l'éditeur SQL du projet Baticom. Rejouable.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1a. Lancer un appel : une ligne écrite tout de suite ──
create or replace function public.appel_lancer(
  p_agence_id uuid,
  p_contact_id uuid default null,
  p_numero text default '',
  p_call_id text default '',
  p_compte_nom text default '',
  p_source text default 'session'
) returns uuid
language plpgsql
as $$
declare
  v_appel uuid;
begin
  if not exists (select 1 from public.agences where id = p_agence_id) then raise exception 'agence introuvable'; end if;
  insert into public.activites (agence_id, contact_id, type, date, compte_id, compte_nom, note, resultat, issue, motif, numero_utilise, call_id, source)
  values (p_agence_id, p_contact_id, 'appel', now(), auth.uid(), coalesce(p_compte_nom, ''), '', 'lance', '', '', coalesce(p_numero, ''), coalesce(p_call_id, ''), coalesce(p_source, 'session'))
  returning id into v_appel;
  return v_appel;
end $$;
grant execute on function public.appel_lancer(uuid, uuid, text, text, text, text) to authenticated;

-- ── 1b. Noter le résultat : complète l'appel lancé s'il y en a un ──
-- (même corps que la version du 12/10, plus p_appel_id ; l'ancienne signature est retirée.)
drop function if exists public.appel_enregistrer(uuid, uuid, text, text, text, text, text, integer, text, timestamptz, timestamptz, text, text, text);
create or replace function public.appel_enregistrer(
  p_agence_id uuid, p_contact_id uuid, p_resultat text, p_issue text default '', p_motif text default '', p_note text default '',
  p_numero text default '', p_duree_s integer default null, p_call_id text default '', p_rappel_le timestamptz default null,
  p_rdv_le timestamptz default null, p_rdv_type text default 'telephone', p_compte_nom text default '', p_source text default 'session',
  p_appel_id uuid default null
) returns jsonb
language plpgsql
as $$
declare
  a public.agences%rowtype;
  v_compte uuid := auth.uid();
  v_appel uuid;
  v_etape text;
  v_tache uuid;
  v_contact text := '';
  v_sommeil_apres constant integer := 6;
  v_sommeil_jours constant integer := 60;
  v_relance_jours integer := coalesce((select valeur::integer from public.parametres where cle = 'relance_interesse_jours' and valeur ~ '^[0-9]+$' and valeur::integer between 1 and 365), 7);
begin
  select * into a from public.agences where id = p_agence_id for update;
  if not found then raise exception 'agence introuvable'; end if;
  if p_resultat not in ('pas_de_reponse','standard','joint','faux_numero') then raise exception 'résultat inconnu : %', p_resultat; end if;
  if p_resultat = 'joint' and p_issue not in ('interesse','rdv','a_rappeler','pas_interesse') then raise exception 'issue inconnue : %', p_issue; end if;
  if p_contact_id is not null then
    select trim(prenom || ' ' || nom) into v_contact from public.contacts where id = p_contact_id and agence_id = p_agence_id;
  end if;

  -- L'appel lancé au clic : on le complète (sa date reste celle du clic).
  if p_appel_id is not null then
    update public.activites set
      contact_id = coalesce(p_contact_id, contact_id), compte_nom = coalesce(nullif(p_compte_nom, ''), compte_nom),
      note = coalesce(p_note, ''), resultat = p_resultat, issue = coalesce(p_issue, ''), motif = coalesce(p_motif, ''),
      numero_utilise = coalesce(nullif(p_numero, ''), numero_utilise), duree_s = p_duree_s, call_id = coalesce(nullif(p_call_id, ''), call_id)
    where id = p_appel_id and agence_id = p_agence_id and type = 'appel' and resultat = 'lance'
    returning id into v_appel;
  end if;
  if v_appel is null then
    insert into public.activites (agence_id, contact_id, type, date, compte_id, compte_nom, note, resultat, issue, motif, numero_utilise, duree_s, call_id, source)
    values (p_agence_id, p_contact_id, 'appel', now(), v_compte, p_compte_nom, coalesce(p_note, ''), p_resultat, coalesce(p_issue, ''), coalesce(p_motif, ''),
            coalesce(p_numero, ''), p_duree_s, coalesce(p_call_id, ''), coalesce(p_source, 'session'))
    returning id into v_appel;
  end if;

  v_etape := a.etape;
  perform set_config('app.source', coalesce(p_source, 'session'), true);

  if p_resultat in ('pas_de_reponse', 'standard') then
    a.tentatives := a.tentatives + 1;
    if a.tentatives >= v_sommeil_apres and a.etape in ('a_prospecter', 'gestionnaire_joint') then
      v_etape := 'endormie';
      a.reveil_le := current_date + v_sommeil_jours;
    end if;
    if p_rappel_le is not null then
      insert into public.activites (agence_id, contact_id, type, date, echeance, compte_id, compte_nom, titre, source)
      values (p_agence_id, p_contact_id, 'tache', now(), p_rappel_le, v_compte, p_compte_nom, 'Rappeler' || case when v_contact <> '' then ' ' || v_contact else '' end, coalesce(p_source, 'session'))
      returning id into v_tache;
    end if;
  elsif p_resultat = 'joint' then
    a.tentatives := 0;
    a.joint_fois := a.joint_fois + 1;
    if p_issue = 'interesse' then
      if a.etape in ('a_prospecter', 'gestionnaire_joint', 'pas_interesse', 'endormie', 'hors_cible') then v_etape := 'interesse'; end if;
      insert into public.activites (agence_id, contact_id, type, date, echeance, compte_id, compte_nom, titre, source)
      values (p_agence_id, p_contact_id, 'tache', now(), (date_trunc('day', now() at time zone 'Europe/Paris') + (v_relance_jours || ' days')::interval + interval '10 hours') at time zone 'Europe/Paris', v_compte, p_compte_nom,
              'Relancer' || case when v_contact <> '' then ' ' || v_contact else '' end, coalesce(p_source, 'session'))
      returning id into v_tache;
    elsif p_issue = 'rdv' then
      if a.etape <> 'client' then v_etape := 'rdv_planifie'; end if;
      insert into public.activites (agence_id, contact_id, type, date, echeance, compte_id, compte_nom, titre, rdv_type, source)
      values (p_agence_id, p_contact_id, 'rdv', now(), coalesce(p_rdv_le, now() + interval '1 day'), v_compte, p_compte_nom,
              'RDV' || case when v_contact <> '' then ' avec ' || v_contact else '' end, coalesce(nullif(p_rdv_type, ''), 'telephone'), coalesce(p_source, 'session'))
      returning id into v_tache;
    elsif p_issue = 'a_rappeler' then
      if a.etape in ('a_prospecter', 'endormie') then v_etape := 'gestionnaire_joint'; end if;
      insert into public.activites (agence_id, contact_id, type, date, echeance, compte_id, compte_nom, titre, source)
      values (p_agence_id, p_contact_id, 'tache', now(), coalesce(p_rappel_le, (date_trunc('day', now() at time zone 'Europe/Paris') + interval '1 day 10 hours') at time zone 'Europe/Paris'), v_compte, p_compte_nom,
              'Rappeler' || case when v_contact <> '' then ' ' || v_contact else '' end, coalesce(p_source, 'session'))
      returning id into v_tache;
    elsif p_issue = 'pas_interesse' then
      if a.etape <> 'client' then v_etape := 'pas_interesse'; a.motif := coalesce(nullif(p_motif, ''), 'autre'); end if;
    end if;
  elsif p_resultat = 'faux_numero' then
    if a.etape <> 'client' then v_etape := 'hors_cible'; end if;
  end if;

  update public.agences set
    tentatives = a.tentatives, joint_fois = a.joint_fois, reveil_le = a.reveil_le,
    motif = case when v_etape = 'pas_interesse' then a.motif else motif end,
    etape = v_etape, derniere_activite_le = now()
  where id = p_agence_id;

  return jsonb_build_object('appel_id', v_appel, 'tache_id', v_tache, 'etape', v_etape, 'tentatives', a.tentatives, 'joint_fois', a.joint_fois);
end $$;
grant execute on function public.appel_enregistrer(uuid, uuid, text, text, text, text, text, integer, text, timestamptz, timestamptz, text, text, text, uuid) to authenticated;

-- ── 2a. Plus de « premier appelant = propriétaire » ──
drop trigger if exists activites_attribuer_agence on public.activites;
drop function if exists public.agence_attribuer_au_premier_appelant();

-- ── 2b. Attribuer un secteur : TOUTES ses agences suivent (p_ecraser gardé pour l'écran, sans effet) ──
create or replace function public.attribuer_secteur(p_secteur text, p_compte_id uuid, p_ecraser boolean default true)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_n integer := 0;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Réservé aux admins.';
  end if;
  update public.secteurs set commercial_id = p_compte_id where code = p_secteur;
  update public.agences
     set commercial_id = p_compte_id
   where secteur = p_secteur and type <> 'apporteur'
     and commercial_id is distinct from p_compte_id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ── 2c. Une agence qui change de secteur (ou qui arrive) prend le démarcheur du secteur ──
create or replace function public.agence_suit_son_secteur() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.secteur is not null and new.type <> 'apporteur'
     and (tg_op = 'INSERT' or new.secteur is distinct from old.secteur) then
    new.commercial_id := (select s.commercial_id from public.secteurs s where s.code = new.secteur);
  end if;
  return new;
end $$;
drop trigger if exists agences_suit_son_secteur on public.agences;
create trigger agences_suit_son_secteur before insert or update of secteur on public.agences
  for each row execute function public.agence_suit_son_secteur();

-- ── 2d. Réalignement, une fois : chaque agence d'un secteur → le démarcheur du secteur ──
update public.agences a
   set commercial_id = s.commercial_id
  from public.secteurs s
 where s.code = a.secteur and a.type <> 'apporteur'
   and a.commercial_id is distinct from s.commercial_id;

-- Contrôle : doit renvoyer 0.
select count(*) as agences_hors_regle
  from public.agences a join public.secteurs s on s.code = a.secteur
 where a.type <> 'apporteur' and a.commercial_id is distinct from s.commercial_id;
