-- LES MAILS CLOISONNÉS (Mahdi, 07/11/2026 : « le commercial ne voit que ses mails, le recruteur que les
-- siens, et nous, administrateurs, on voit tout. Comme sur STC Bâtiment »).
-- Un administrateur (ou un compte sans rôle) : les deux boîtes. Un téléprospecteur : la boîte de sa
-- fonction (Réglages › Équipe : Commercial → démarchage, Recrutement → recrutement ; pas posée → les deux).
-- Même règle que src/lib/perimetre.ts. Les fonctions serveur (clé service) ne sont pas concernées.

create or replace function public.mes_espaces() returns text[]
language sql stable security definer set search_path = public as $$
  select case
    when coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'telepro' then array['demarchage', 'recrutement']
    else case (
      select (valeur::jsonb) ->> (auth.uid()::text) from parametres where cle = 'fonctions_comptes'
    )
      when 'commercial' then array['demarchage']
      when 'recrutement' then array['recrutement']
      else array['demarchage', 'recrutement']
    end
  end
$$;
revoke all on function public.mes_espaces() from public, anon;
grant execute on function public.mes_espaces() to authenticated;

drop policy if exists acces_connecte on public.messages;
drop policy if exists messages_lecture on public.messages;
drop policy if exists messages_ajout on public.messages;
drop policy if exists messages_modification on public.messages;
drop policy if exists messages_suppression on public.messages;
create policy messages_lecture on public.messages for select to authenticated
  using (coalesce(espace, 'demarchage') = any (public.mes_espaces()));
create policy messages_ajout on public.messages for insert to authenticated
  with check (coalesce(espace, 'demarchage') = any (public.mes_espaces()));
create policy messages_modification on public.messages for update to authenticated
  using (coalesce(espace, 'demarchage') = any (public.mes_espaces()))
  with check (coalesce(espace, 'demarchage') = any (public.mes_espaces()));
create policy messages_suppression on public.messages for delete to authenticated
  using (coalesce(espace, 'demarchage') = any (public.mes_espaces()));
