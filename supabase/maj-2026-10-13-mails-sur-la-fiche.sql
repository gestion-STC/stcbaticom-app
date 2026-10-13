-- ═══════════════════════════════════════════════════════════════════════════
--  13/10/2026 — Les e-mails de démarchage n'apparaissaient plus sur la fiche
--
--  Depuis la refonte du 09/10, un e-mail envoyé depuis une fiche ou la session
--  était bien PARTI et journalisé (table messages), mais sans agence : la
--  fonction envoyer-email cherche encore l'ancienne table prospects. Le fil de
--  la fiche lit messages.agence_id → rien. 17 e-mails du 09/10 au 13/10.
--
--  1. Filet en base : tout message de démarchage arrivé sans agence est rattaché
--     par son adresse (contact de l'agence d'abord, puis e-mail de l'agence),
--     seulement s'il n'y a qu'UNE agence possible.
--     (Le front rattache désormais lui-même l'e-mail à l'agence ouverte.)
--  2. Les 17 e-mails orphelins : rattachés à l'agence appelée à la même minute
--     (vérifié un par un : adresse et appel concordent quand les deux existent).
--
--  À coller en une fois dans l'éditeur SQL du projet Baticom. Rejouable.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.messages_rattacher_agence() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_adresse text;
  v_agences uuid[];
begin
  if new.agence_id is not null or coalesce(new.espace, 'demarchage') <> 'demarchage' then return new; end if;
  -- L'adresse de l'autre côté : le destinataire pour un envoi, l'expéditeur pour une réponse.
  v_adresse := lower(trim(split_part(split_part(case when new.sens = 'sortant' then new.a else new.de end, ' · ', 1), ',', 1)));
  if v_adresse ~ '<.+>' then v_adresse := substring(v_adresse from '<([^>]+)>'); end if;
  if v_adresse is null or position('@' in v_adresse) = 0 then return new; end if;

  select array_agg(distinct c.agence_id) into v_agences from public.contacts c where lower(trim(c.email)) = v_adresse;
  if coalesce(array_length(v_agences, 1), 0) = 0 then
    select array_agg(distinct g.id) into v_agences from public.agences g
     where g.type <> 'apporteur' and position(v_adresse in lower(coalesce(g.email, ''))) > 0;
  end if;
  if array_length(v_agences, 1) = 1 then new.agence_id := v_agences[1]; end if;
  return new;
end $$;

drop trigger if exists messages_rattacher_agence on public.messages;
create trigger messages_rattacher_agence before insert on public.messages
  for each row execute function public.messages_rattacher_agence();

-- Les 17 e-mails orphelins (09/10 → 13/10), message → agence.
update public.messages m set agence_id = v.agence_id::uuid
  from (values
    ('8721c8be-83f7-4440-82bd-905358571507', '25108ebc-b3d0-412d-8f32-e4c921013508'), -- Domo Gestion
    ('9b083baf-72be-4b72-aedd-ac4d06c910e3', '76423bfb-87d0-49fa-82ac-67bf05cc6f31'), -- Elysée Navarre
    ('9020f9a8-257a-4c98-8dff-ef227f224e76', 'b0489d1f-6643-43e1-abf4-8606ab930b9e'), -- sadone
    ('abc02d33-b81d-4c7e-b4f6-9f2365788fa5', 'e2f62b4c-1127-4441-9e0b-12ed1e65556e'), -- gessim
    ('40eb5b8d-85bc-455f-a340-9efb499f9185', 'c126f128-b7f4-4309-9d11-8d524c979bb5'), -- C21 Cadet-Rochechouart
    ('1f02a932-5f46-4ace-bd0a-bfb225c522a8', 'f076780f-8db8-45d7-89ab-7e4b8f36eadf'), -- C21 Chaumont Laumière
    ('ecb9eabd-124f-477a-b8df-443259c6ef3b', '3249fdc8-6bbd-4f39-97f9-eb72d783b013'), -- CODACI & SAMCOGER
    ('087d4323-6ca1-469b-9e18-fbcb0ef05998', '35f7a50d-a740-4ba0-a6af-3889e29773fd'), -- C21 Michel Bizot
    ('cc6713ee-6d61-4e9d-9e6d-6a3bf96f39c0', 'ea11cae3-827b-4333-90d0-0ca4fbc3d9aa'), -- C21 Pyrénées (adp.location@)
    ('986f9ecd-e299-4696-80d2-4bfa521b440f', '5993a9dd-fa96-42f8-96e6-34a96b7d02e0'), -- C21 Wilson Sarcelles
    ('63a44f92-6fc9-4cb1-997c-938ac1722d1f', 'e84d8944-758f-4c3b-8033-6a943b53d560'), -- C21 Lutèce
    ('ca2cab27-a74c-4f8a-8f09-1807ccc4bcc6', '287a0071-0159-4bd5-9113-ff200f6bab1f'), -- ERA Chaumontel
    ('08052632-da48-489a-95a0-83458a331a3f', 'ce7c6237-6a95-4902-a318-502fb2e5d67c'), -- C21 Farré
    ('f2ebe58f-15a7-432c-853b-33ebb26132ec', '7be36174-5546-4198-84c8-cffa90df3b56'), -- C21 Odéon Saint-Sulpice
    ('08ead4bf-3a0d-4a98-a9cd-6cb5a014abb2', 'f11bc32e-dfe6-4e22-bad4-24ab13167353'), -- C21 Flandre Crimée
    ('bedf5653-688f-41bf-8472-19cfbd7d1028', 'e2050196-e3c5-4bc9-b4fa-4df77e23e2cf'), -- C21 Olympiades
    ('ea2c4979-de78-4810-abe6-2b5ad158c6e2', '02421b18-c8bf-43e4-9e9e-75dd77217ad9')  -- C21 Tour Eiffel
  ) as v(message_id, agence_id)
 where m.id = v.message_id::uuid and m.agence_id is null;

-- Contrôle : doit renvoyer 0 (aucun e-mail de démarchage envoyé depuis le 09/10 sans agence).
select count(*) as mails_sans_agence
  from public.messages
 where espace = 'demarchage' and sens = 'sortant' and agence_id is null and created_at >= '2026-10-09';
