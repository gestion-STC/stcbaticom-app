// ════════════════════════════════════════════════════════════════════════════
// BANC D'ESSAI DU LOT 7 « boîte mail » (audit du 26/11) : supabase/maj-2026-11-27-f7.sql rejoué dans une base Postgres
// locale (PGlite), avec les VRAIES règles de rattachement (supabase/regles-demarchage.sql).
//   · D71 : une réponse envoyée avant le rattachement du mail reçu suit ce mail quand il reçoit son agence ;
//   · D75 : une demande Mailinblack est rangée sur l'agence du mail retenu, n'est ni une réponse de campagne ni un lead ;
//   · le fichier est rejouable.
// ════════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { beforeAll, describe, expect, it } from "vitest"

const racine = process.cwd()
const lire = (f: string) => readFileSync(join(racine, f), "utf8")
const f7 = lire("supabase/maj-2026-11-27-f7.sql").split("-- ── Contrôle")[0]

const COMPLEMENT = `
alter table public.messages add column if not exists tri text, add column if not exists tri_detail jsonb, add column if not exists compte_id uuid;
create table if not exists public.cmp_campagnes (id uuid primary key default gen_random_uuid(), config jsonb not null default '{}');
create table if not exists public.cmp_inscriptions (id uuid primary key default gen_random_uuid(), campagne_id uuid, contact_ref text, statut text, prochaine_le timestamptz);
create table if not exists public.cmp_evenements (id uuid primary key default gen_random_uuid(), campagne_id uuid, envoi_id uuid, contact_ref text not null, type text not null, le timestamptz not null default now());
create or replace function public.reponse_est_negative(p text) returns boolean language sql immutable as $$ select false $$;
create or replace function public.lead_mail_est_humain(p_objet text) returns boolean language sql immutable as $$
  select coalesce(p_objet, '') !~* '(r[ée]ponse automatique|out of office|absen)' $$;
-- Le dernier envoi de campagne au contact : ici, toujours le même (la vraie fonction lit cmp_envois).
create or replace function public.cmp_dernier_envoi(p_contact text, p_avant timestamptz) returns table (envoi_id uuid, campagne_id uuid)
  language sql stable as $$ select '00000000-0000-0000-0000-0000000000e1'::uuid, '00000000-0000-0000-0000-0000000000c1'::uuid $$;
-- Le lead d'une réponse (la vraie chaîne : leads_depuis_mail → lead_depuis_message → cmp_action_reponse → lead_poser).
create or replace function public.leads_depuis_mail_essai() returns trigger language plpgsql as $$
begin
  if new.sens = 'entrant' and new.agence_id is not null and public.lead_mail_est_humain(new.objet)
     and public.cmp_action_reponse('{}'::jsonb, new.tri, new.corps_text) = 'lead' then
    insert into public.leads_demarchage (agence_id, source, signal) values (new.agence_id, 'mail', 'A répondu à un mail');
  end if;
  return new;
end $$;
`
const APRES = `
create trigger cmp_reponse after insert on public.messages for each row execute function public.cmp_depuis_reponse();
create trigger cmp_reponse_rattachee after update of agence_id on public.messages for each row
  when (old.agence_id is null and new.agence_id is not null) execute function public.cmp_depuis_reponse();
create trigger leads_depuis_mail after insert or update of agence_id on public.messages for each row execute function public.leads_depuis_mail_essai();
`

let db: PGlite
const q = async <T = Record<string, unknown>>(t: string, p: unknown[] = []) => (await db.query<T>(t, p)).rows
const un = async <T = Record<string, unknown>>(t: string, p: unknown[] = []) => (await q<T>(t, p))[0]
const agence = async (nom: string, email = "") => (await un<{ id: string }>(`insert into public.agences (nom, email) values ($1, $2) returning id`, [nom, email])).id

beforeAll(async () => {
  db = new PGlite()
  await db.exec(lire("supabase/tests/socle-demarchage.sql"))
  await db.exec(lire("supabase/regles-demarchage.sql"))
  await db.exec(COMPLEMENT)
  await db.exec(f7)
  await db.exec(APRES)
}, 60_000)

describe("D71 : la réponse suit le mail reçu quand il reçoit son agence", () => {
  it("cas Human Location : adresse sur deux fiches, réponse envoyée avant le rattachement", async () => {
    const a1 = await agence("Human Location 1"), a2 = await agence("Human Location 2")
    await q(`insert into public.contacts (agence_id, prenom, nom, email) values ($1, '', 'P', 'paris@human-location.fr'), ($2, '', 'P', 'paris@human-location.fr')`, [a1, a2])
    const recu = await un<{ id: string; agence_id: string | null }>(`insert into public.messages (sens, de, a, objet, message_id, tri) values ('entrant', 'paris@human-location.fr', 'h@crm.stcbatiment.fr', 'Re: Vos interventions', '<CAO@mail.gmail.com>', 'interesse') returning id, agence_id`)
    expect(recu.agence_id).toBeNull()
    const rep = await un<{ id: string; agence_id: string | null }>(`insert into public.messages (sens, de, a, objet, in_reply_to) values ('sortant', 'h@crm.stcbatiment.fr', 'paris@human-location.fr', 'Re: Vos interventions', '<CAO@mail.gmail.com>') returning id, agence_id`)
    expect(rep.agence_id).toBeNull()
    await q(`update public.messages set agence_id = $1 where id = $2`, [a2, recu.id])
    expect((await un<{ agence_id: string }>(`select agence_id from public.messages where id = $1`, [rep.id])).agence_id).toBe(a2)
  })
  it("une réponse déjà rangée ailleurs n'est pas déplacée", async () => {
    const a1 = await agence("X1"), a2 = await agence("X2")
    const recu = await un<{ id: string }>(`insert into public.messages (sens, de, a, objet, message_id) values ('entrant', 'inconnu@x.fr', 'h@crm.stcbatiment.fr', 'Devis', '<id2@x.fr>') returning id`)
    const rep = await un<{ id: string }>(`insert into public.messages (sens, de, a, objet, in_reply_to, agence_id) values ('sortant', 'h@crm.stcbatiment.fr', 'inconnu@x.fr', 'Re: Devis', '<id2@x.fr>', $1) returning id`, [a1])
    await q(`update public.messages set agence_id = $1 where id = $2`, [a2, recu.id])
    expect((await un<{ agence_id: string }>(`select agence_id from public.messages where id = $1`, [rep.id])).agence_id).toBe(a1)
  })
})

describe("D75 : la demande d'un anti-spam (Mailinblack)", () => {
  it("est rangée sur l'agence du mail retenu, sans réponse de campagne ni lead (cas Diderot Immobilier)", async () => {
    const diderot = await agence("Diderot immobilier"), autre = await agence("DDR Immobilier")
    const objet = "Vos interventions locatives en Île-de-France, un seul interlocuteur"
    await q(`insert into public.messages (sens, de, a, objet, agence_id, created_at) values
      ('sortant', 'horlann@crm.stcbatiment.fr', 'location@ddrimmonilier.fr', $1, $2, now() - interval '1 day'),
      ('sortant', 'horlann@crm.stcbatiment.fr', 'info@diderot-immobilier.fr', $1, $3, now() - interval '20 seconds')`, [objet, autre, diderot])
    const d = await un<{ id: string; agence_id: string | null }>(`insert into public.messages (sens, de, a, objet, tri) values ('entrant', 'diderot_immobilier@invitations.mailinblack.com', 'horlann@crm.stcbatiment.fr', $1, 'anti_spam') returning id, agence_id`, ["Re: " + objet])
    expect(d.agence_id).toBe(diderot)
    expect(Number((await un<{ n: number }>(`select count(*)::int n from public.cmp_evenements where contact_ref = $1`, [diderot])).n)).toBe(0)
    expect(Number((await un<{ n: number }>(`select count(*)::int n from public.leads_demarchage where agence_id = $1`, [diderot])).n)).toBe(0)
  })
  it("dans le doute (plusieurs envois, aucun indice), aucune agence n'est devinée", async () => {
    const a1 = await agence("Alpha"), a2 = await agence("Beta")
    await q(`insert into public.messages (sens, de, a, objet, agence_id, created_at) values
      ('sortant', 'zoe@crm.stcbatiment.fr', 'a@alpha.fr', 'Offre', $1, now() - interval '2 minutes'),
      ('sortant', 'zoe@crm.stcbatiment.fr', 'b@beta.fr', 'Offre', $2, now() - interval '1 minute')`, [a1, a2])
    const d = await un<{ agence_id: string | null }>(`insert into public.messages (sens, de, a, objet, tri) values ('entrant', 'xyz@invitations.mailinblack.com', 'zoe@crm.stcbatiment.fr', 'Re: Offre', 'anti_spam') returning agence_id`)
    expect(d.agence_id).toBeNull()
  })
  it("une vraie réponse reste une réponse et un lead", async () => {
    const g = await agence("Gamma", "contact@gamma.fr")
    await q(`insert into public.messages (sens, de, a, objet, tri) values ('entrant', 'contact@gamma.fr', 'h@crm.stcbatiment.fr', 'Re: Offre', 'interesse')`)
    expect(Number((await un<{ n: number }>(`select count(*)::int n from public.cmp_evenements where contact_ref = $1 and type = 'reponse'`, [g])).n)).toBe(1)
    expect(Number((await un<{ n: number }>(`select count(*)::int n from public.leads_demarchage where agence_id = $1`, [g])).n)).toBe(1)
  })
  it("cmp_action_reponse : « anti_spam » ne fait rien, comme « absent »", async () => {
    expect((await un<{ r: string }>(`select public.cmp_action_reponse('{}'::jsonb, 'anti_spam', '') r`)).r).toBe("rien")
    expect((await un<{ r: string }>(`select public.cmp_action_reponse('{}'::jsonb, 'interesse', '') r`)).r).toBe("lead")
  })
})

describe("le fichier est rejouable", () => {
  it("une deuxième passe ne casse rien", async () => {
    await db.exec(f7)
    expect(Number((await un<{ n: number }>(`select count(*)::int n from pg_trigger where tgname in ('messages_reponses_suivent', 'messages_anti_spam_agence')`)).n)).toBe(2)
  })
})
