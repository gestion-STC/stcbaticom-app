// ════════════════════════════════════════════════════════════════════════════
// LE BANC D'ESSAI DES LEADS (06/11/2026)
//
// Les vraies règles (socle + regles-demarchage.sql + maj-2026-11-06-leads.sql + leads-gestionnaire)
// dans une base Postgres locale (PGlite). Un lead naît d'un signal fort ou de deux ouvertures de
// plaquette en 7 jours ; il reste dans Leads jusqu'à ce qu'on ait eu le gestionnaire.
// ════════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { beforeAll, describe, expect, it } from "vitest"

const sql = (f: string) => readFileSync(join(process.cwd(), f), "utf8")
const MAHDI = "b3a3dd4d-de08-4370-b794-227b8ddf0ba5"
let db: PGlite
const q = async <T = Record<string, unknown>>(t: string, p: unknown[] = []) => (await db.query<T>(t, p)).rows
const un = async <T = Record<string, unknown>>(t: string, p: unknown[] = []) => (await q<T>(t, p))[0]

beforeAll(async () => {
  db = new PGlite()
  await db.exec(sql("supabase/tests/socle-demarchage.sql"))
  await db.exec(sql("supabase/regles-demarchage.sql"))
  await db.exec(`
    insert into public.secteurs (code, libelle, zone, commercial_id) values ('75005', 'Paris 5', 'Paris', '${MAHDI}');
    insert into public.parametres (cle, valeur) values ('relance_interesse_jours', '10'), ('repos_appel_jours', '5');
    select set_config('request.jwt.claims', '{"sub":"${MAHDI}","role":"authenticated","app_metadata":{"role":"admin"},"user_metadata":{"nom":"Mahdi"}}', false);
  `)
  await db.exec(sql("supabase/maj-2026-11-06-leads.sql"))
  await db.exec(sql("supabase/maj-2026-11-06-leads-gestionnaire.sql"))
}, 60_000)

let n = 0
const agence = async (etape = "a_prospecter") => {
  n++
  const r = await un<{ id: string }>(`insert into public.agences (nom, telephone, secteur) values ($1, $2, '75005') returning id`, [`Agence ${n}`, `01 46 ${String(n).padStart(2, "0")} 00 00`])
  if (etape !== "a_prospecter") await q(`update public.agences set etape = $2, motif = case when $2 = 'pas_interesse' then 'autre' else motif end where id = $1`, [r.id, etape])
  return r.id
}
const signal = (id: string, titre: string, ilYa = "0 minutes") =>
  q(`insert into public.activites (agence_id, type, titre, note, date, source, compte_nom) values ($1, 'note', $2, '', now() - $3::interval, 'site', 'Site')`, [id, titre, ilYa])
const mail = (id: string | null, objet: string) => q(`insert into public.messages (sens, espace, objet, agence_id) values ('entrant', 'demarchage', $2, $1)`, [id, objet])
const leads = (id: string) => q<{ statut: string; source: string; signal: string; tentatives: number; resultat: string }>(`select statut, source, signal, tentatives, resultat from public.leads_demarchage where agence_id = $1 order by cree_le`, [id])
const appel = (id: string, resultat: string, issue = "") =>
  un(`select public.appel_enregistrer(p_agence_id := $1, p_contact_id := null, p_resultat := $2, p_issue := $3, p_motif := case when $3 = 'pas_interesse' then 'autre' else '' end,
       p_rappel_le := null, p_rdv_le := case when $3 = 'rdv' then now() + interval '2 days' else null end, p_compte_nom := 'Mahdi', p_appel_id := null::uuid)`, [id, resultat, issue])

describe("un lead naît d'un signal", () => {
  it("compte ouvert, page « Créer un compte » : tout de suite", async () => {
    const a = await agence(), b = await agence()
    await signal(a, "Compte ouvert sur STC Bâtiment")
    await signal(b, "Page « Créer un compte » ouverte")
    expect((await leads(a)).map((l) => l.source)).toEqual(["compte"])
    expect((await leads(b)).map((l) => l.source)).toEqual(["page_compte"])
  })
  it("la plaquette : à la 2e ouverture en 7 jours, pas à la 1re", async () => {
    const a = await agence(), b = await agence()
    await signal(a, "Plaquette ouverte")
    expect(await leads(a)).toEqual([])
    await signal(a, "Plaquette ouverte")
    expect((await leads(a))[0]).toMatchObject({ source: "plaquette", signal: "A ouvert la plaquette 2 fois" })
    await signal(b, "Plaquette ouverte", "9 days")
    await signal(b, "Plaquette ouverte")
    expect(await leads(b)).toEqual([])
  })
  it("un mail ouvert ou rebondi ne crée rien", async () => {
    const a = await agence()
    await signal(a, "E-mail ouvert")
    await signal(a, "E-mail rebondi (adresse injoignable)")
    expect(await leads(a)).toEqual([])
  })
  it("une réponse à nos mails : oui ; une réponse automatique, une désinscription : non", async () => {
    const a = await agence(), b = await agence(), c = await agence()
    await mail(a, "RE: Vos interventions locatives")
    await mail(b, "Réponse automatique : absente jusqu'au 12/11")
    await mail(c, "Merci de me désinscrire")
    expect((await leads(a))[0]).toMatchObject({ source: "mail", signal: "A répondu à un mail" })
    expect(await leads(b)).toEqual([])
    expect(await leads(c)).toEqual([])
  })
  it("un mail rangé plus tard sur l'agence devient un lead à ce moment-là", async () => {
    const a = await agence()
    const m = await un<{ id: string }>(`insert into public.messages (sens, espace, objet) values ('entrant', 'demarchage', 'Demande de devis') returning id`)
    expect(await leads(a)).toEqual([])
    await q(`update public.messages set agence_id = $1 where id = $2`, [a, m.id])
    expect(await leads(a)).toHaveLength(1)
  })
  it("jamais pour un apporteur ou une cliente ; un seul lead ouvert par agence", async () => {
    const a = await agence(), b = await agence("client"), c = await agence()
    await q(`update public.agences set type = 'apporteur' where id = $1`, [a])
    await signal(a, "Compte ouvert sur STC Bâtiment")
    await signal(b, "Compte ouvert sur STC Bâtiment")
    await signal(c, "Page « Créer un compte » ouverte")
    await mail(c, "RE: votre plaquette")
    expect(await leads(a)).toEqual([])
    expect(await leads(b)).toEqual([])
    expect(await leads(c)).toHaveLength(1)
  })
})

describe("un lead se travaille puis se ferme", () => {
  it("premier appel abouti : traité, avec son issue", async () => {
    const a = await agence()
    await signal(a, "Page « Créer un compte » ouverte")
    await appel(a, "joint", "rdv")
    expect((await leads(a))[0]).toMatchObject({ statut: "traite", resultat: "rdv" })
  })
  it("le standard ne ferme PAS le lead : on n'a pas eu le gestionnaire", async () => {
    const a = await agence()
    await mail(a, "RE: tarifs")
    await appel(a, "standard")
    expect((await leads(a))[0]).toMatchObject({ statut: "a_traiter", tentatives: 1 })
  })
  it("sans réponse, même 4 fois : il reste dans Leads ; le gestionnaire eu le ferme", async () => {
    const a = await agence()
    await signal(a, "Compte ouvert sur STC Bâtiment")
    for (let i = 0; i < 4; i++) await appel(a, i % 2 ? "standard" : "pas_de_reponse")
    expect((await leads(a))[0]).toMatchObject({ statut: "a_traiter", tentatives: 4 })
    await appel(a, "joint", "a_rappeler")
    expect((await leads(a))[0]).toMatchObject({ statut: "traite", tentatives: 4, resultat: "a_rappeler" })
  })
  it("faux numéro : l'agence sort en hors cible, le lead se ferme", async () => {
    const a = await agence()
    await signal(a, "Compte ouvert sur STC Bâtiment")
    await appel(a, "faux_numero")
    expect((await leads(a))[0]).toMatchObject({ statut: "traite", resultat: "hors_cible" })
  })
  it("passée apporteur ou pas intéressée depuis la fiche : le lead se ferme", async () => {
    const a = await agence(), b = await agence()
    await signal(a, "Page « Créer un compte » ouverte")
    await signal(b, "Page « Créer un compte » ouverte")
    await q(`update public.agences set type = 'apporteur' where id = $1`, [a])
    await q(`update public.agences set etape = 'pas_interesse', motif = 'autre' where id = $1`, [b])
    expect((await leads(a))[0]).toMatchObject({ statut: "traite", resultat: "apporteur" })
    expect((await leads(b))[0]).toMatchObject({ statut: "traite", resultat: "pas_interesse" })
  })
  it("un lead traité ne renaît pas au clic suivant (3 jours)", async () => {
    const a = await agence()
    await signal(a, "Page « Créer un compte » ouverte")
    await appel(a, "joint", "interesse")
    await signal(a, "Plaquette ouverte")
    await signal(a, "Plaquette ouverte")
    expect((await leads(a)).map((l) => l.statut)).toEqual(["traite"])
  })
})

describe("la file des leads", () => {
  it("le plus ancien d'abord, dans la base du commercial", async () => {
    const a = await agence(), b = await agence()
    await signal(a, "Page « Créer un compte » ouverte", "30 minutes")
    await signal(b, "Compte ouvert sur STC Bâtiment", "5 minutes")
    const file = await q<{ nom: string }>(`select agence->>'nom' as nom from public.leads_a_traiter($1) where agence->>'id' in ($2, $3) order by rang`, [MAHDI, a, b])
    expect(file.map((x) => x.nom)).toEqual([`Agence ${n - 1}`, `Agence ${n}`])
    expect(await q(`select 1 from public.leads_a_traiter('non_attribuees') where agence->>'id' = $1`, [a])).toEqual([])
  })
  it("un lead essayé il y a moins de 2 h passe après les autres", async () => {
    const a = await agence(), b = await agence()
    await signal(a, "Page « Créer un compte » ouverte", "30 minutes")
    await signal(b, "Compte ouvert sur STC Bâtiment", "5 minutes")
    await appel(a, "pas_de_reponse")
    const file = await q<{ nom: string }>(`select agence->>'nom' as nom from public.leads_a_traiter($1) where agence->>'id' in ($2, $3) order by rang`, [MAHDI, a, b])
    expect(file.map((x) => x.nom)).toEqual([`Agence ${n}`, `Agence ${n - 1}`])
  })
})
