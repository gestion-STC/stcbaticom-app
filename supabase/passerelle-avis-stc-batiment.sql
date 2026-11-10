-- ════════════════════════════════════════════════════════════════════════════
-- ⚠⚠ À COLLER DANS STC BÂTIMENT (projet yytpxonzlhdevddpkjzy), PAS DANS BATICOM ⚠⚠
--
-- LA PASSERELLE DES AVIS (Mahdi, 11/11/2026) : Baticom vient lire ici, en lecture seule, à qui demander un avis :
--   · les locataires dont le chantier est terminé (étape « Fin de chantier » ou « Livré »), un par ordre de service ;
--   · les sous-traitants actifs, avec la date de leur dernier chantier.
-- Même clé que la passerelle des clients signés (passerelle_cles, nom = 'baticom'). Rien n'est écrit ici. Rejouable.
-- ════════════════════════════════════════════════════════════════════════════
do $$ begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'ordres_service') then
    raise exception 'MAUVAIS PROJET : ce SQL se colle dans STC Bâtiment, pas dans Baticom.';
  end if;
end $$;

create or replace function public.avis_pour_baticom(p_cle text)
returns table(ref text, public text, nom text, personne text, email text, telephone text, fin_le timestamptz, detail text)
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select 'os:' || o.id, 'locataires', coalesce(nullif(trim(o.nom_locataire), ''), 'Locataire'), coalesce(trim(o.nom_locataire), ''),
         lower(trim(coalesce(o.email_locataire, ''))), trim(coalesce(o.telephone_locataire, '')), o.statut_pipeline_at, coalesce(o.adresse, '')
    from public.ordres_service o
   where exists (select 1 from public.passerelle_cles k where k.nom = 'baticom' and k.cle = p_cle)
     and not coalesce(o.archive, false)
     and o.statut_pipeline in ('fin_chantier', 'livre')
     and (coalesce(o.email_locataire, '') <> '' or coalesce(o.telephone_locataire, '') <> '')
  union all
  select 'st:' || s.id, 'sous_traitants_actifs', coalesce(s.nom, ''), '', lower(trim(coalesce(s.email, ''))), trim(coalesce(s.telephone, '')),
         (select max(c.date_fin)::timestamptz from public.chantiers c where c.sous_traitant_id = s.id), ''
    from public.sous_traitants s
   where exists (select 1 from public.passerelle_cles k where k.nom = 'baticom' and k.cle = p_cle)
     and coalesce(s.actif, false)
$$;
revoke all on function public.avis_pour_baticom(text) from public;
grant execute on function public.avis_pour_baticom(text) to anon, authenticated;
