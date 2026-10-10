-- ============================================================================
--  À COLLER DANS LE PROJET **STC BÂTIMENT** (yytpxonzlhdevddpkjzy), pas Baticom.
--
--  La passerelle « clients signés » (10/10/2026) : STC Baticom vient lire ici,
--  en LECTURE SEULE, la liste des gestionnaires qui ont envoyé au moins un
--  ordre de service, avec la date et le numéro du premier. Rien n'est écrit
--  dans STC Bâtiment. L'accès est protégé par une clé partagée, rangée dans
--  une table privée que seul le serveur lit.
-- ============================================================================

-- 1) La clé partagée (la même est posée en secret côté Baticom).
create table if not exists public.passerelle_cles (
  nom      text primary key,
  cle      text not null,
  cree_le  timestamptz not null default now()
);
alter table public.passerelle_cles enable row level security;   -- aucune policy : personne ne la lit par l'API
insert into public.passerelle_cles (nom, cle) values ('baticom', '__CLE_PASSERELLE__')
on conflict (nom) do update set cle = excluded.cle;

-- 2) La fonction de lecture : un gestionnaire = une ligne, avec son premier OS.
create or replace function public.clients_pour_baticom(p_cle text)
returns table (
  gestionnaire_id uuid, societe text, nom text, email text, telephone text, telephone_fixe text, telephone_portable text,
  premier_os_le timestamptz, premier_os_numero text, dernier_os_le timestamptz, nb_os bigint, noms_agence text, codes_postaux text
)
language sql security definer set search_path = public, pg_temp as $$
  select g.id, coalesce(g.societe, ''), coalesce(g.nom, ''), lower(coalesce(g.email, '')), coalesce(g.telephone, ''), coalesce(g.telephone_fixe, ''), coalesce(g.telephone_portable, ''),
         min(o.created_at), (array_agg(o.numero order by o.created_at) filter (where o.numero is not null))[1], max(o.created_at), count(o.id),
         string_agg(distinct nullif(trim(o.nom_agence), ''), ' | '), string_agg(distinct nullif(trim(o.code_postal), ''), ' | ')
    from public.gestionnaires g
    join public.ordres_service o on o.gestionnaire_id = g.id and coalesce(o.archive, false) = false
   where exists (select 1 from public.passerelle_cles k where k.nom = 'baticom' and k.cle = p_cle)
   group by g.id, g.societe, g.nom, g.email, g.telephone, g.telephone_fixe, g.telephone_portable
$$;
revoke all on function public.clients_pour_baticom(text) from public;
grant execute on function public.clients_pour_baticom(text) to anon, authenticated, service_role;

-- Contrôle (doit renvoyer une vingtaine de lignes avec la bonne clé, zéro avec une mauvaise)
-- select societe, email, premier_os_le::date, nb_os from public.clients_pour_baticom('__CLE_PASSERELLE__') order by premier_os_le;
