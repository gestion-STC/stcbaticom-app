-- LOT f6 (27/11/2026) : liste des agences et imports. Rien n'est supprimé. Rejouable sans effet.
--   A. Recherche (D59) : agences_recherche cherche aussi le prénom, le nom et l'e-mail de TOUS les contacts présents
--      (pas seulement le contact principal), et une nouvelle colonne contacts_chiffres réunit leurs lignes directes
--      et mobiles. « cadet-rochechouart@century21.fr » trouve enfin son agence.
--   B. Réglages › Secteurs (D65) : « Les N agences sans secteur non attribuées → démarchées par » ne prend plus
--      que les agences sans secteur NON attribuées (avant : aussi celles déjà à quelqu'un, 7 au lieu de 4).
--      L'empreinte de la règle est mise à jour dans sante_demarchage.
--   C. Import d'artisans (D67) : la fiche dont l'e-mail vaut « inconnu » (tout texte sans @) a son e-mail vidé.
-- À COLLER AVANT DE FUSIONNER LA PR : l'écran cherche dans contacts_chiffres, absente avant ce script
-- (sans elle, toute recherche par numéro dans la liste Agences tombe en erreur).
begin;

-- ── A. La recherche voit tous les contacts présents ──
-- (create or replace view : les colonnes existantes gardent leur nom et leur ordre, contacts_chiffres s'ajoute à la fin.)
create or replace view public.agences_recherche with (security_invoker = true) as
select l.*,
       public.texte_plat(concat_ws(' ', l.nom, l.enseigne, l.email, l.adresse, l.secteur_libelle, l.contact_principal,
         (select string_agg(concat_ws(' ', c.prenom, c.nom, c.email), ' ')
            from public.contacts c where c.agence_id = l.id and not c.parti))) as recherche_plat,
       public.chiffres_telephone(l.telephone) as telephone_chiffres,
       public.chiffres_telephone(l.contact_ligne) as contact_ligne_chiffres,
       coalesce((select string_agg(concat_ws(' ', public.chiffres_telephone(c.ligne_directe), public.chiffres_telephone(c.mobile)), ' ')
                   from public.contacts c where c.agence_id = l.id and not c.parti), '') as contacts_chiffres
  from public.agences_liste l;
revoke all on public.agences_recherche from anon;
grant select on public.agences_recherche to authenticated;

-- ── B. Sans secteur : les non attribuées seulement (texte identique à supabase/regles-demarchage.sql) ──
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
  if coalesce(p_secteur, '') <> '' then
    update public.secteurs set commercial_id = p_compte_id where code = p_secteur;
    update public.agences set commercial_id = p_compte_id
     where secteur = p_secteur and type <> 'apporteur' and commercial_id is distinct from p_compte_id;
  else
    update public.agences set commercial_id = p_compte_id
     where coalesce(secteur, '') = '' and type <> 'apporteur' and commercial_id is null;
  end if;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- L'empreinte de la règle redéfinie, dans le contrôle de santé (sinon « règle modifiée »).
do $do$
declare
  v_def text;
  v_nom text;
  v_nouvelle text;
begin
  v_def := pg_get_functiondef('public.sante_demarchage()'::regprocedure);
  foreach v_nom in array array['attribuer_secteur'] loop
    select md5(replace(p.prosrc, chr(13), '')) into v_nouvelle from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname = v_nom;
    if v_def !~ ('\(''' || v_nom || ''', ''[0-9a-f]{32}''\)') then
      raise notice 'sante_demarchage : pas d''empreinte pour %, rien changé pour elle.', v_nom;
    end if;
    v_def := regexp_replace(v_def, '\(''' || v_nom || ''', ''[0-9a-f]{32}''\)', '(''' || v_nom || ''', ''' || v_nouvelle || ''')');
  end loop;
  execute v_def;
end $do$;

-- ── C. Un e-mail d'artisan qui n'est pas une adresse ──
update public.st_sous_traitants set email = '' where email <> '' and email !~ '@';

commit;

-- ── Contrôle (chiffres attendus au 27/11/2026) ──
select 'Recherche « cadet-rochechouart@century21.fr » (attendu : 1 ; avant, 0)' as quoi,
       (select count(*) from public.agences_recherche where recherche_plat like '%cadet-rochechouart@century21.fr%')::text as valeur
union all
select 'E-mails de contacts présents introuvables (attendu : 0 ; avant, 57)',
       (select count(*) from public.contacts c where not c.parti and c.email <> ''
           and not exists (select 1 from public.agences_recherche r where r.id = c.agence_id and r.recherche_plat like '%' || public.texte_plat(c.email) || '%'))::text
union all
select 'Mobiles de contacts présents introuvables (attendu : 0 ; avant, 5)',
       (select count(*) from public.contacts c where not c.parti and public.chiffres_telephone(c.mobile) <> ''
           and not exists (select 1 from public.agences_recherche r where r.id = c.agence_id and r.contacts_chiffres like '%' || public.chiffres_telephone(c.mobile) || '%'))::text
union all
select 'Recherche « porte d''orleans » (attendu : 1)',
       (select count(*) from public.agences_recherche where recherche_plat like '%porte d''orleans%')::text
union all
select 'attribuer_secteur : empreinte du fichier de référence (attendu : cd29f67af19b0117e051e335ed76a608)',
       (select md5(replace(prosrc, chr(13), '')) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'attribuer_secteur')
union all
select 'Agences sans secteur non attribuées, celles que l''écran annonce (attendu : 4)',
       (select count(*) from public.agences where coalesce(secteur, '') = '' and type <> 'apporteur' and commercial_id is null)::text
union all
select 'Fiches artisans avec un e-mail sans @ (attendu : 0 ; avant, 1 : JBTM « inconnu »)',
       (select count(*) from public.st_sous_traitants where email <> '' and email !~ '@')::text
union all
select 'sante_demarchage : règle modifiée attribuer_secteur (attendu : 0)',
       (select count(*) from public.sante_demarchage() where code = 'regle_modifiee' and exemples like '%attribuer_secteur%')::text;
