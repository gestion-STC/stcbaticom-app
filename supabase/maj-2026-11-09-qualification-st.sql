-- ════════════════════════════════════════════════════════════════════════════
-- LA QUALIFICATION DES SOUS-TRAITANTS (Mahdi, 09/11/2026). À coller AVANT de fusionner la PR.
-- 1. Les réponses et la décision, par sous-traitant : hors de la campagne.
-- 2. Le questionnaire, modifiable dans Réglages de la machine (vide : celui d'origine s'applique).
-- 3. La campagne sous-traitants s'arrête au lead : intérêt, puis dossier déposé.
-- Se rejoue sans risque.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.st_qualifications (
  sous_traitant_id uuid primary key references public.st_sous_traitants(id) on delete cascade,
  reponses   jsonb not null default '{}'::jsonb,
  decision   text check (decision in ('Accepté', 'En attente', 'Refusé')),
  decide_par text not null default '',
  decide_le  timestamptz,
  maj_le     timestamptz not null default now()
);
alter table public.st_qualifications enable row level security;
drop policy if exists acces_connecte on public.st_qualifications;
create policy acces_connecte on public.st_qualifications for all to authenticated using (true) with check (true);

create table if not exists public.st_questionnaire (
  id       integer primary key default 1 check (id = 1),
  sections jsonb not null,
  maj_par  text not null default '',
  maj_le   timestamptz not null default now()
);
alter table public.st_questionnaire enable row level security;
drop policy if exists acces_connecte on public.st_questionnaire;
create policy acces_connecte on public.st_questionnaire for all to authenticated using (true) with check (true);

update public.cmp_campagnes
set config = jsonb_set(jsonb_set(jsonb_set(jsonb_set(config,
    '{qualification,etapes}', '[{"id":"p-interet","nom":"Intérêt détecté","qui":"Automatique","type":"Intérêt détecté","delai":0,"validation":"Toute seule"},{"id":"p-dossier","nom":"Dossier déposé","qui":"Le prospect","type":"Dossier et pièces reçus","delai":7,"validation":"Toute seule"}]'::jsonb),
    '{qualification,leadA}', '"p-dossier"'::jsonb),
    '{qualification,gagneA}', '""'::jsonb),
    '{creatifs}', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_array_elements(coalesce(config -> 'creatifs', '[]'::jsonb)) k where k ->> 'id' <> 'f-qualif'))
where origine = 'st' and config -> 'qualification' -> 'etapes' @> '[{"id":"p-form"}]'::jsonb;
