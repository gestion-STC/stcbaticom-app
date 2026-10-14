// ════════════════════════════════════════════════════════════════════════════
// LE BANC D'ESSAI DES RÈGLES DU DÉMARCHAGE (13/10/2026)
//
// Mahdi : « la logique que je t'ai donnée doit être respectée, sécurisée et
// verrouillée ; sinon on tue des numéros et les relances se passent mal ».
// Ces tests chargent les VRAIES règles (supabase/regles-demarchage.sql, le fichier
// collé en prod) dans une base Postgres locale (PGlite) et jouent chaque situation.
// Ils tournent avant chaque mise en ligne : une règle cassée bloque la publication.
// ════════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { beforeAll, describe, expect, it } from "vitest"

const racine = process.cwd() // vitest tourne à la racine du dépôt
const sql = (f: string) => readFileSync(join(racine, f), "utf8")
const MAHDI = "b3a3dd4d-de08-4370-b794-227b8ddf0ba5"

let db: PGlite
type Ligne = Record<string, unknown>
const q = async <T = Ligne>(texte: string, params: unknown[] = []) => (await db.query<T>(texte, params)).rows
const un = async <T = Ligne>(texte: string, params: unknown[] = []) => (await q<T>(texte, params))[0]

beforeAll(async () => {
  db = new PGlite()
  await db.exec(sql("supabase/tests/socle-demarchage.sql"))
  await db.exec(sql("supabase/regles-demarchage.sql"))
  await db.exec(`
    insert into public.secteurs (code, libelle, zone, commercial_id) values ('75005', 'Paris 5', 'Paris', '${MAHDI}');
    insert into public.parametres (cle, valeur) values ('relance_interesse_jours', '10'), ('repos_appel_jours', '5');
    select set_config('request.jwt.claims', '{"sub":"${MAHDI}","role":"authenticated","app_metadata":{"role":"admin"},"user_metadata":{"nom":"Mahdi"}}', false);
  `)
}, 60_000)

let n = 0
// Une agence neuve, jamais appelée, avec son propre standard.
async function agence(etape = "a_prospecter", extra: Ligne = {}): Promise<string> {
  n++
  const tel = `01 45 ${String(n).padStart(2, "0")} 00 00`
  const r = await un<{ id: string }>(`insert into public.agences (nom, telephone, secteur) values ($1, $2, '75005') returning id`, [`Agence ${n}`, (extra.telephone as string) ?? tel])
  if (etape !== "a_prospecter") await q(`update public.agences set etape = $2, motif = case when $2 = 'pas_interesse' then 'autre' else motif end where id = $1`, [r.id, etape])
  return r.id
}
const appel = (id: string, resultat: string, issue = "", o: { rappel?: string; rdv?: string; appelId?: string } = {}) =>
  un<{ r: { etape: string; tentatives: number; joint_fois: number } }>(
    `select public.appel_enregistrer(p_agence_id := $1, p_contact_id := null, p_resultat := $2, p_issue := $3, p_motif := case when $3 = 'pas_interesse' then 'autre' else '' end,
       p_rappel_le := $4::timestamptz, p_rdv_le := $5::timestamptz, p_compte_nom := 'Mahdi', p_appel_id := $6::uuid) as r`,
    [id, resultat, issue, o.rappel ?? null, o.rdv ?? null, o.appelId ?? null])
const lancer = async (id: string) => (await un<{ id: string }>(`select public.appel_lancer($1, null, '0186761221', 'c', 'Mahdi', 'session') as id`, [id])).id
// Les tâches et RDV encore ouverts, sous la forme « Relancer@J+10 ».
async function ouvertes(id: string): Promise<string[]> {
  const l = await q<{ t: string }>(
    `select titre || '@J+' || ((echeance at time zone 'Europe/Paris')::date - (now() at time zone 'Europe/Paris')::date) as t
       from public.activites where agence_id = $1 and type in ('tache', 'rdv') and fait_le is null order by echeance`, [id])
  return l.map((x) => x.t.replace(/^(Relancer|Rappeler|RDV)[^@]*/, "$1")) // « Relancer Sophie Martin@J+10 » → « Relancer@J+10 »
}
const fiche = (id: string) => un<{ etape: string; tentatives: number; joint_fois: number; reveil_j: number | null; nb_appels: number; prochaine: string | null }>(
  `select a.etape, a.tentatives, a.joint_fois, (a.reveil_le - (now() at time zone 'Europe/Paris')::date) as reveil_j, l.nb_appels::int, l.prochaine_echeance::text as prochaine
     from public.agences a join public.agences_liste l on l.id = a.id where a.id = $1`, [id])
const dansRappelsDuJour = async (id: string) =>
  (await un<{ ok: boolean }>(`select coalesce(prochaine_echeance < (date_trunc('day', now() at time zone 'Europe/Paris') + interval '1 day') at time zone 'Europe/Paris', false) as ok from public.agences_liste where id = $1`, [id])).ok
// Une tâche ouverte qui tombe aujourd'hui (ex. la relance d'une intéressée arrivée à échéance).
const rendreDue = (id: string) => q(`update public.activites set echeance = now() - interval '1 hour' where agence_id = $1 and type in ('tache', 'rdv') and fait_le is null`, [id])
const verifier = async (id: string, numero: string, direct = false) => (await un<{ v: string | null }>(`select public.appel_verifier($1, $2, $3) as v`, [id, numero, direct])).v
const telDe = async (id: string) => (await un<{ t: string }>(`select telephone as t from public.agences where id = $1`, [id])).t

const DANS_2J = () => new Date(Date.now() + 2 * 86_400_000).toISOString()
const DANS_3J = () => new Date(Date.now() + 3 * 86_400_000).toISOString()

// ── 1. LA MATRICE : chaque étape × chaque résultat ──────────────────────────
// [étape d'arrivée, tâches ouvertes, tentatives, joints]
type Attendu = [string, string[], number, number]
const SORTIES = ["pas_de_reponse", "standard", "faux_numero", "joint/interesse", "joint/rdv", "joint/a_rappeler", "joint/pas_interesse"] as const
const MATRICE: Record<string, Record<(typeof SORTIES)[number], Attendu>> = {
  a_prospecter: {
    pas_de_reponse: ["a_prospecter", [], 1, 0], standard: ["a_prospecter", [], 1, 0], faux_numero: ["hors_cible", [], 0, 0],
    "joint/interesse": ["interesse", ["Relancer@J+10"], 0, 1], "joint/rdv": ["rdv_planifie", ["RDV@J+3"], 0, 1],
    "joint/a_rappeler": ["gestionnaire_joint", ["Rappeler@J+2"], 0, 1], "joint/pas_interesse": ["pas_interesse", [], 0, 1],
  },
  gestionnaire_joint: { // avec un « Rappeler » qui tombe aujourd'hui
    pas_de_reponse: ["gestionnaire_joint", [], 1, 0], standard: ["gestionnaire_joint", [], 1, 0], faux_numero: ["hors_cible", [], 0, 0],
    "joint/interesse": ["interesse", ["Relancer@J+10"], 0, 1], "joint/rdv": ["rdv_planifie", ["RDV@J+3"], 0, 1],
    "joint/a_rappeler": ["gestionnaire_joint", ["Rappeler@J+2"], 0, 1], "joint/pas_interesse": ["pas_interesse", [], 0, 1],
  },
  interesse: { // relance due aujourd'hui : quel que soit le résultat, la suivante à J+10
    pas_de_reponse: ["interesse", ["Relancer@J+10"], 1, 0], standard: ["interesse", ["Relancer@J+10"], 1, 0], faux_numero: ["hors_cible", [], 0, 0],
    "joint/interesse": ["interesse", ["Relancer@J+10"], 0, 1], "joint/rdv": ["rdv_planifie", ["RDV@J+3"], 0, 1],
    "joint/a_rappeler": ["interesse", ["Rappeler@J+2"], 0, 1], "joint/pas_interesse": ["pas_interesse", [], 0, 1],
  },
  rdv_planifie: {
    pas_de_reponse: ["rdv_planifie", ["Relancer@J+10"], 1, 0], standard: ["rdv_planifie", ["Relancer@J+10"], 1, 0], faux_numero: ["hors_cible", [], 0, 0],
    "joint/interesse": ["rdv_planifie", ["Relancer@J+10"], 0, 1], "joint/rdv": ["rdv_planifie", ["RDV@J+3"], 0, 1],
    "joint/a_rappeler": ["rdv_planifie", ["Rappeler@J+2"], 0, 1], "joint/pas_interesse": ["pas_interesse", [], 0, 1],
  },
  endormie: { // réveillée aujourd'hui
    pas_de_reponse: ["endormie", [], 1, 0], standard: ["endormie", [], 1, 0], faux_numero: ["hors_cible", [], 0, 0],
    "joint/interesse": ["interesse", ["Relancer@J+10"], 0, 1], "joint/rdv": ["rdv_planifie", ["RDV@J+3"], 0, 1],
    "joint/a_rappeler": ["gestionnaire_joint", ["Rappeler@J+2"], 0, 1], "joint/pas_interesse": ["pas_interesse", [], 0, 1],
  },
  pas_interesse: {
    pas_de_reponse: ["pas_interesse", [], 1, 0], standard: ["pas_interesse", [], 1, 0], faux_numero: ["hors_cible", [], 0, 0],
    "joint/interesse": ["interesse", ["Relancer@J+10"], 0, 1], "joint/rdv": ["rdv_planifie", ["RDV@J+3"], 0, 1],
    "joint/a_rappeler": ["gestionnaire_joint", ["Rappeler@J+2"], 0, 1], "joint/pas_interesse": ["pas_interesse", [], 0, 1],
  },
}

describe("la matrice : chaque étape × chaque résultat d'appel", () => {
  for (const [depart, sorties] of Object.entries(MATRICE)) {
    for (const s of SORTIES) {
      it(`${depart} + ${s}`, async () => {
        const id = await agence()
        if (depart === "gestionnaire_joint") {
          await q(`update public.agences set etape = 'gestionnaire_joint' where id = $1`, [id])
          await q(`insert into public.activites (agence_id, type, echeance, titre) values ($1, 'tache', now() - interval '1 hour', 'Rappeler')`, [id])
        } else if (depart === "interesse" || depart === "rdv_planifie") {
          await q(`update public.agences set etape = $2 where id = $1`, [id, depart])
          await rendreDue(id)
        } else if (depart === "endormie") {
          await q(`update public.agences set etape = 'endormie', reveil_le = (now() at time zone 'Europe/Paris')::date where id = $1`, [id])
        } else if (depart === "pas_interesse") {
          await q(`update public.agences set etape = 'pas_interesse', motif = 'autre' where id = $1`, [id])
        }
        const [resultat, issue = ""] = s.split("/")
        await appel(id, resultat, issue, { rappel: issue === "a_rappeler" ? DANS_2J() : undefined, rdv: issue === "rdv" ? DANS_3J() : undefined })
        const [etape, taches, tentatives, joints] = sorties[s]
        const f = await fiche(id)
        expect(f.etape).toBe(etape)
        expect(await ouvertes(id)).toEqual(taches)
        expect(f.tentatives).toBe(tentatives)
        expect(f.joint_fois).toBe(joints)
        // Règle de Mahdi : une fois appelée, l'agence n'est plus dans « À rappeler aujourd'hui ».
        expect(await dansRappelsDuJour(id)).toBe(false)
        if (depart === "endormie" && (resultat === "pas_de_reponse" || resultat === "standard")) expect(f.reveil_j).toBe(30)
      })
    }
  }
})

describe("le sommeil", () => {
  it("6e tentative sans gestionnaire : l'agence s'endort 30 jours", async () => {
    const id = await agence()
    for (let i = 0; i < 5; i++) await appel(id, i % 2 ? "standard" : "pas_de_reponse")
    expect((await fiche(id)).etape).toBe("a_prospecter")
    await appel(id, "pas_de_reponse")
    const f = await fiche(id)
    expect(f.etape).toBe("endormie")
    expect(f.reveil_j).toBe(30)
  })
})

describe("le cycle des intéressées ne casse jamais (relance tous les 10 jours)", () => {
  it("une intéressée a toujours UNE relance ouverte, à J+10", async () => {
    const id = await agence()
    await appel(id, "joint", "interesse")
    expect(await ouvertes(id)).toEqual(["Relancer@J+10"])
  })
  it("relance cochée « Fait » à la main : la suivante est posée à J+10", async () => {
    const id = await agence()
    await appel(id, "joint", "interesse")
    const t = await un<{ id: string }>(`select id from public.activites where agence_id = $1 and type = 'tache' and fait_le is null`, [id])
    await q(`select public.tache_terminer($1, true)`, [t.id])
    expect(await ouvertes(id)).toEqual(["Relancer@J+10"])
  })
  it("relance supprimée : la suivante est posée", async () => {
    const id = await agence()
    await appel(id, "joint", "interesse")
    await q(`delete from public.activites where agence_id = $1 and type = 'tache' and fait_le is null`, [id])
    expect(await ouvertes(id)).toEqual(["Relancer@J+10"])
  })
  it("RDV marqué fait : une relance est posée", async () => {
    const id = await agence()
    await appel(id, "joint", "rdv", { rdv: DANS_3J() })
    const r = await un<{ id: string }>(`select id from public.activites where agence_id = $1 and type = 'rdv'`, [id])
    await q(`select public.tache_terminer($1, true)`, [r.id])
    expect(await ouvertes(id)).toEqual(["Relancer@J+10"])
  })
  it("passée à la main en « Intéressé » : relance posée à J+10", async () => {
    const id = await agence()
    await q(`update public.agences set etape = 'interesse' where id = $1`, [id])
    expect(await ouvertes(id)).toEqual(["Relancer@J+10"])
  })
  it("trois tours de relance : toujours une seule relance, jamais dans la prospection", async () => {
    const id = await agence()
    await appel(id, "joint", "interesse")
    for (const r of ["pas_de_reponse", "standard", "joint/interesse"]) {
      await rendreDue(id)
      expect(await dansRappelsDuJour(id)).toBe(true) // le jour J, elle est dans « À rappeler aujourd'hui »
      const [res, iss = ""] = r.split("/")
      await appel(id, res, iss)
      expect(await ouvertes(id)).toEqual(["Relancer@J+10"])
      expect(await dansRappelsDuJour(id)).toBe(false)
      expect((await fiche(id)).etape).toBe("interesse")
    }
  })
})

describe("les sorties : plus aucune relance", () => {
  for (const sortie of ["pas_interesse", "hors_cible", "client"]) {
    it(`intéressée passée à la main en ${sortie}`, async () => {
      const id = await agence()
      await appel(id, "joint", "rdv", { rdv: DANS_3J() })
      await appel(id, "joint", "interesse")
      if (sortie === "client") await q(`select public.agence_premier_os($1)`, [id])
      else await q(`update public.agences set etape = $2, motif = 'autre' where id = $1`, [id, sortie])
      expect(await ouvertes(id)).toEqual([])
    })
  }
  it("client : premier OS daté (jour de Paris)", async () => {
    const id = await agence()
    await q(`select public.agence_premier_os($1)`, [id])
    const r = await un<{ ok: boolean }>(`select premier_os_le = (now() at time zone 'Europe/Paris')::date as ok from public.agences where id = $1`, [id])
    expect(r.ok).toBe(true)
  })
  it("passée en apporteur : ses tâches et RDV sont fermés", async () => {
    const id = await agence()
    await appel(id, "joint", "interesse")
    await q(`update public.agences set type = 'apporteur' where id = $1`, [id])
    expect(await ouvertes(id)).toEqual([])
  })
  it("« Remettre à faire » est refusé sur une agence sortie", async () => {
    const id = await agence()
    await appel(id, "joint", "rdv", { rdv: DANS_3J() })
    await appel(id, "joint", "pas_interesse")
    const t = await un<{ id: string }>(`select id from public.activites where agence_id = $1 and type = 'rdv'`, [id])
    await expect(q(`select public.tache_terminer($1, false)`, [t.id])).rejects.toThrow(/sortie du démarchage/)
  })
  it("pas intéressée qui redemande à être rappelée : elle revient dans le circuit", async () => {
    const id = await agence("pas_interesse")
    await appel(id, "joint", "a_rappeler", { rappel: DANS_2J() })
    expect((await fiche(id)).etape).toBe("gestionnaire_joint")
    expect(await ouvertes(id)).toEqual(["Rappeler@J+2"])
  })
})

describe("chaque appel est sur la fiche, une seule fois", () => {
  it("l'appel est écrit dès le clic, puis complété par le résultat (une seule ligne)", async () => {
    const id = await agence()
    const l = await lancer(id)
    expect((await fiche(id)).nb_appels).toBe(1)
    await appel(id, "standard", "", { appelId: l })
    const a = await q<{ resultat: string }>(`select resultat from public.activites where agence_id = $1 and type = 'appel'`, [id])
    expect(a.map((x) => x.resultat)).toEqual(["standard"])
  })
  it("un résultat noté deux fois (double clic, réseau) : un seul appel, une seule tâche", async () => {
    const id = await agence()
    const l = await lancer(id)
    await appel(id, "joint", "a_rappeler", { appelId: l, rappel: DANS_2J() })
    await appel(id, "joint", "a_rappeler", { appelId: l, rappel: DANS_2J() })
    expect((await fiche(id)).nb_appels).toBe(1)
    expect(await ouvertes(id)).toEqual(["Rappeler@J+2"])
    expect((await fiche(id)).joint_fois).toBe(1)
  })
  it("chaque action porte son auteur et sa date", async () => {
    const id = await agence()
    await appel(id, "joint", "interesse")
    await q(`insert into public.activites (agence_id, type, note) values ($1, 'note', 'test')`, [id])
    const sansAuteur = await un<{ n: number }>(`select count(*)::int n from public.activites where agence_id = $1 and (compte_id is null or date is null)`, [id])
    expect(sansAuteur.n).toBe(0)
  })
  it("un appel reçu ne compte pas comme un appel passé", async () => {
    const id = await agence()
    await q(`insert into public.activites (agence_id, type, resultat, sens) values ($1, 'appel', 'joint', 'entrant')`, [id])
    expect((await fiche(id)).nb_appels).toBe(0)
  })
})

describe("on ne tue pas les numéros : la garde avant de composer", () => {
  it("une agence jamais appelée : appel permis", async () => {
    const id = await agence()
    expect(await verifier(id, await telDe(id))).toBeNull()
  })
  it("un appel lancé attend son résultat : refus", async () => {
    const id = await agence()
    await lancer(id)
    expect(await verifier(id, await telDe(id), true)).toMatch(/Note d'abord le résultat/)
  })
  it("le même standard déjà composé aujourd'hui (fiche jumelle, collègue) : refus, même en appel direct", async () => {
    const a = await agence()
    const tel = await telDe(a)
    const b = await agence("a_prospecter", { telephone: tel })
    await appel(a, "standard")
    expect(await verifier(b, tel)).toMatch(/déjà été appelé aujourd'hui/)
    expect(await verifier(a, tel, true)).toMatch(/déjà été appelé aujourd'hui/)
  })
  it("la ligne directe d'un gestionnaire reste appelable après le standard", async () => {
    const id = await agence()
    await appel(id, "standard")
    expect(await verifier(id, "06 12 34 56 78", true)).toBeNull()
  })
  it("un numéro, un appel par jour : même un rappel prévu aujourd'hui ne le recompose pas (Mahdi, 14/10)", async () => {
    const id = await agence()
    await appel(id, "joint", "a_rappeler", { rappel: new Date(Date.now() + 60_000).toISOString() })
    expect(await verifier(id, await telDe(id))).toMatch(/déjà été appelé aujourd'hui/)
    expect(await verifier(id, await telDe(id), true)).toMatch(/déjà été appelé aujourd'hui/)
  })
  it("au repos : appelée il y a 3 jours → refus ; il y a 5 jours → permis", async () => {
    const recent = await agence()
    await appel(recent, "pas_de_reponse")
    await q(`update public.activites set date = now() - interval '3 days' where agence_id = $1 and type = 'appel'`, [recent])
    expect(await verifier(recent, await telDe(recent))).toMatch(/au repos/)
    const ancien = await agence()
    await appel(ancien, "pas_de_reponse")
    await q(`update public.activites set date = (date_trunc('day', now() at time zone 'Europe/Paris') - interval '5 days' + interval '9 hours') at time zone 'Europe/Paris' where agence_id = $1 and type = 'appel'`, [ancien])
    expect(await verifier(ancien, await telDe(ancien))).toBeNull()
  })
  it("une agence sortie (pas intéressée, hors cible, cliente, apporteur) n'est pas proposée", async () => {
    const id = await agence("pas_interesse")
    expect(await verifier(id, await telDe(id))).toMatch(/sortie du démarchage/)
  })
})

describe("le secteur fait foi", () => {
  it("une agence prend le démarcheur de son secteur", async () => {
    const id = await agence()
    const r = await un<{ c: string }>(`select commercial_id::text as c from public.agences where id = $1`, [id])
    expect(r.c).toBe(MAHDI)
  })
})

describe("la santé de la base", () => {
  it("sur une base où tout est respecté : aucun écart", async () => {
    const ecarts = await q<{ code: string; nombre: number }>(`select code, nombre from public.sante_demarchage() where code <> 'appel_non_note'`)
    expect(ecarts).toEqual([])
  })
  it("une intéressée sans relance est signalée", async () => {
    const id = await agence()
    await appel(id, "joint", "interesse")
    // On force l'incohérence en court-circuitant les règles (ce qu'un outil extérieur pourrait faire).
    await q(`select set_config('app.appel_en_cours', '1', false)`)
    await q(`update public.activites set fait_le = now() where agence_id = $1 and type = 'tache'`, [id])
    await q(`select set_config('app.appel_en_cours', '', false)`)
    const e = await q<{ code: string }>(`select code from public.sante_demarchage()`)
    expect(e.map((x) => x.code)).toContain("interessee_sans_relance")
    await q(`insert into public.activites (agence_id, type, echeance, titre) values ($1, 'tache', now() + interval '10 days', 'Relancer')`, [id])
  })
})

describe("apporteur d'affaires pendant un appel (13/10)", () => {
  it("l'appel lancé est clos « apporteur », plus rien à compléter, plus aucune tâche", async () => {
    const id = await agence()
    await appel(id, "joint", "interesse")
    await lancer(id)
    await q(`update public.agences set type = 'apporteur' where id = $1`, [id])
    const l = await q<{ resultat: string }>(`select resultat from public.activites where agence_id = $1 and type = 'appel' order by date`, [id])
    expect(l.map((x) => x.resultat)).toEqual(["joint", "apporteur"])
    expect(await ouvertes(id)).toEqual([])
    const e = await q<{ exemples: string }>(`select exemples from public.sante_demarchage() where code = 'appel_non_note'`)
    expect(e.length === 0 || !e[0].exemples.includes("Agence " + n)).toBe(true)
  })
})

describe("« standard » : on ne harcèle pas l'accueil (14/10)", () => {
  it("après un standard, l'agence est au repos 15 jours (pas 5)", async () => {
    const id = await agence()
    await appel(id, "standard")
    await q(`update public.activites set date = (date_trunc('day', now() at time zone 'Europe/Paris') - interval '8 days' + interval '9 hours') at time zone 'Europe/Paris' where agence_id = $1 and type = 'appel'`, [id])
    expect(await verifier(id, await telDe(id))).toMatch(/Standard eu le .* reposer l'accueil 15 jours/)
    await q(`update public.activites set date = (date_trunc('day', now() at time zone 'Europe/Paris') - interval '15 days' + interval '9 hours') at time zone 'Europe/Paris' where agence_id = $1 and type = 'appel'`, [id])
    expect(await verifier(id, await telDe(id))).toBeNull()
  })
  it("après un « pas de réponse » il y a 8 jours : appel permis (nouvel essai légitime)", async () => {
    const id = await agence()
    await appel(id, "pas_de_reponse")
    await q(`update public.activites set date = now() - interval '8 days' where agence_id = $1 and type = 'appel'`, [id])
    expect(await verifier(id, await telDe(id))).toBeNull()
  })
})

// ── 14/10 : chaque réglage à UN endroit, lu par toutes les règles ───────────
describe("les réglages : une seule source, lue par toutes les règles", () => {
  const regler = (cle: string, valeur: string | null) =>
    valeur === null ? q(`delete from public.parametres where cle = $1`, [cle]) : q(`insert into public.parametres (cle, valeur) values ($1, $2) on conflict (cle) do update set valeur = excluded.valeur`, [cle, valeur])
  const reglage = async (cle: string) => (await un<{ v: number }>(`select public.reglage_demarchage($1) as v`, [cle])).v

  it("les valeurs par défaut décidées par Mahdi", async () => {
    const l = await q<{ cle: string; defaut: number }>(`select cle, defaut from public.reglages_demarchage() order by cle`)
    expect(Object.fromEntries(l.map((x) => [x.cle, x.defaut]))).toEqual({
      a_completer_minutes: 5, cadence_auto_secondes: 5, heure_relance: 10, quota_appels_jour: 100, rdv_rappel_apres_minutes: 20,
      rdv_rappel_avant_minutes: 5, relance_interesse_jours: 10, repos_appel_jours: 5, repos_standard_jours: 15,
      sommeil_apres_tentatives: 6, sommeil_jours: 30, sonnerie_secondes: 28,
    })
  })
  it("une valeur hors bornes ou illisible dans Réglages = la valeur par défaut", async () => {
    await regler("sommeil_jours", "999")
    expect(await reglage("sommeil_jours")).toBe(30)
    await regler("sommeil_jours", "abc")
    expect(await reglage("sommeil_jours")).toBe(30)
    await regler("sommeil_jours", null)
  })
  it("un réglage inconnu est une erreur, jamais un trou silencieux", async () => {
    await expect(q(`select public.reglage_demarchage('n_existe_pas')`)).rejects.toThrow(/réglage inconnu/)
  })
  it("sommeil réglé à 4 essais et 45 jours : la règle d'appel suit", async () => {
    await regler("sommeil_apres_tentatives", "4")
    await regler("sommeil_jours", "45")
    try {
      const id = await agence()
      for (let i = 0; i < 4; i++) {
        await appel(id, "pas_de_reponse")
        await q(`update public.activites set date = date - interval '6 days' where agence_id = $1 and type = 'appel'`, [id])
      }
      const f = await fiche(id)
      expect([f.etape, f.reveil_j]).toEqual(["endormie", 45])
    } finally {
      await regler("sommeil_apres_tentatives", null)
      await regler("sommeil_jours", null)
    }
  })
  it("heure des relances réglée à 14 h : la relance d'une intéressée tombe à 14 h (heure de Paris)", async () => {
    await regler("heure_relance", "14")
    try {
      const id = await agence()
      await appel(id, "joint", "interesse")
      const r = await un<{ h: number; j: number }>(
        `select extract(hour from echeance at time zone 'Europe/Paris')::int as h, ((echeance at time zone 'Europe/Paris')::date - (now() at time zone 'Europe/Paris')::date) as j
           from public.activites where agence_id = $1 and type = 'tache' and fait_le is null`, [id])
      expect([r.h, r.j]).toEqual([14, 10])
    } finally {
      await regler("heure_relance", null)
    }
  })
  it("relance réglée à 12 jours : la relance suit", async () => {
    await regler("relance_interesse_jours", "12")
    try {
      const id = await agence()
      await appel(id, "joint", "interesse")
      expect(await ouvertes(id)).toEqual(["Relancer@J+12"])
    } finally {
      await regler("relance_interesse_jours", "10")
    }
  })
})

// ── 14/10 : les piles calculées par la base, et leurs compteurs = leur longueur ──
describe("les piles : un seul calcul, la base de chacun", () => {
  const HORLANN = "7c1e6a3e-1111-4c4c-9a9a-000000000001"
  let s = 0
  beforeAll(async () => {
    await q(`insert into public.secteurs (code, libelle, zone, commercial_id) values ('75006', 'Paris 6', 'Paris', $1), ('75007', 'Paris 7', 'Paris', $2) on conflict do nothing`, [HORLANN, MAHDI])
  })
  // Une agence de la base de Horlann (secteur 75006), avec son propre standard.
  async function chez(nom: string, extra: { tel?: string; etape?: string; secteur?: string } = {}): Promise<string> {
    s++
    const r = await un<{ id: string }>(`insert into public.agences (nom, telephone, secteur) values ($1, $2, $3) returning id`,
      [nom, extra.tel ?? `01 46 ${String(s).padStart(2, "0")} 00 00`, extra.secteur ?? "75006"])
    if (extra.etape) {
      await q(`select set_config('app.proprietaire_gere', '1', false)`)
      await q(`update public.agences set etape = $2 where id = $1`, [r.id, extra.etape])
      await q(`select set_config('app.proprietaire_gere', '', false)`)
    }
    return r.id
  }
  const pile = async (p: string, o: { inclure?: boolean; secteur?: string; proprietaire?: string } = {}) =>
    (await q<{ nom: string }>(`select agence->>'nom' as nom from public.pile_demarchage($1, $2, null, $3, '', $4) order by rang`, [p, o.proprietaire ?? HORLANN, o.secteur ?? null, o.inclure ?? false])).map((x) => x.nom)
  const compteurs = async (proprietaire = HORLANN) => (await un<{ c: Record<string, number> }>(`select public.compter_piles($1) as c`, [proprietaire])).c
  const vieillir = (id: string, jours: number) =>
    q(`update public.activites set date = (date_trunc('day', now() at time zone 'Europe/Paris') - ($2 || ' days')::interval + interval '9 hours') at time zone 'Europe/Paris' where agence_id = $1 and type = 'appel'`, [id, jours])

  it("À prospecter : jamais appelées d'abord, puis la plus anciennement appelée ; au repos retirées", async () => {
    const vieille = await chez("P-appelée il y a 20 j")
    await appel(vieille, "pas_de_reponse"); await vieillir(vieille, 20)
    const moins = await chez("P-appelée il y a 9 j")
    await appel(moins, "pas_de_reponse"); await vieillir(moins, 9)
    const repos = await chez("P-appelée il y a 2 j")
    await appel(repos, "pas_de_reponse"); await vieillir(repos, 2)
    await chez("P-jamais B")
    await chez("P-jamais A")
    const l = (await pile("a_prospecter")).filter((x) => x.startsWith("P-"))
    expect(l).toEqual(["P-jamais A", "P-jamais B", "P-appelée il y a 20 j", "P-appelée il y a 9 j"])
    // La case « inclure les appelées » lève le repos de 5 jours…
    expect(await pile("a_prospecter", { inclure: true })).toContain("P-appelée il y a 2 j")
  })
  it("un numéro appelé aujourd'hui ne ressort NULLE PART, même avec la case cochée", async () => {
    const id = await chez("P-appelée ce matin")
    await appel(id, "pas_de_reponse")
    expect(await pile("a_prospecter", { inclure: true })).not.toContain("P-appelée ce matin")
  })
  it("deux fiches au même standard : une seule dans la pile ; l'une appelée → l'autre au repos aussi", async () => {
    await chez("P-jumelle 1", { tel: "01 47 00 00 01" })
    await chez("P-jumelle 2", { tel: "01.47.00.00.01" })
    expect((await pile("a_prospecter")).filter((x) => x.startsWith("P-jumelle"))).toEqual(["P-jumelle 1"])
    const autre = await chez("P-jumelle chez Mahdi", { tel: "0147000001", secteur: "75007" })
    await appel(autre, "pas_de_reponse"); await vieillir(autre, 2)
    expect((await pile("a_prospecter")).filter((x) => x.startsWith("P-jumelle"))).toEqual([])
  })
  it("un « standard » il y a 8 jours : encore au repos (15 j), un « pas de réponse » non", async () => {
    const st = await chez("P-standard 8 j")
    await appel(st, "standard"); await vieillir(st, 8)
    const pdr = await chez("P-pas de réponse 8 j")
    await appel(pdr, "pas_de_reponse"); await vieillir(pdr, 8)
    const l = await pile("a_prospecter")
    expect(l).not.toContain("P-standard 8 j")
    expect(l).toContain("P-pas de réponse 8 j")
  })
  it("chacun sa base : les agences de Mahdi ne sont jamais dans la pile de Horlann", async () => {
    await chez("P-chez Mahdi", { secteur: "75007" })
    expect(await pile("a_prospecter")).not.toContain("P-chez Mahdi")
    expect(await pile("a_prospecter", { proprietaire: MAHDI })).toContain("P-chez Mahdi")
  })
  it("À rappeler aujourd'hui : les rappels dus ; Intéressés : tout le portefeuille, même appelé ce matin", async () => {
    const r = await chez("R-rappel 9 h", { etape: "gestionnaire_joint" })
    await q(`insert into public.activites (agence_id, type, echeance, titre) values ($1, 'tache', now() - interval '2 hours', 'Rappeler')`, [r])
    const i = await chez("I-intéressée appelée ce matin")
    // C'est Horlann qui l'appelle : elle reste dans sa base (14/10 : celui qui travaille l'agence la garde).
    await q(`select set_config('request.jwt.claims', '{"sub":"${HORLANN}","role":"authenticated","user_metadata":{"nom":"Horlann"}}', false)`)
    try { await appel(i, "joint", "interesse") } finally {
      await q(`select set_config('request.jwt.claims', '{"sub":"${MAHDI}","role":"authenticated","app_metadata":{"role":"admin"},"user_metadata":{"nom":"Mahdi"}}', false)`)
    }
    expect((await pile("rappels")).filter((x) => x.startsWith("R-"))).toEqual(["R-rappel 9 h"])
    expect(await pile("sans_nouvelle")).toContain("I-intéressée appelée ce matin")
    expect(await pile("a_prospecter")).not.toContain("I-intéressée appelée ce matin")
  })
  it("les compteurs sont EXACTEMENT la longueur des listes, pour chaque pile et chaque base", async () => {
    for (const proprietaire of [HORLANN, MAHDI, "tous", "non_attribuees"]) {
      const c = await compteurs(proprietaire)
      for (const p of ["a_prospecter", "rappels", "sans_nouvelle", "a_reveiller"]) expect([proprietaire, p, c[p]]).toEqual([proprietaire, p, (await pile(p, { proprietaire })).length])
    }
  })
  it("la pile et la garde disent la même chose : rien dans « À prospecter » n'est refusé au moment d'appeler", async () => {
    const l = await q<{ id: string; tel: string }>(`select agence->>'id' as id, agence->>'telephone' as tel from public.pile_demarchage('a_prospecter', $1)`, [HORLANN])
    expect(l.length).toBeGreaterThan(3)
    for (const a of l) expect([a.id, await verifier(a.id, a.tel)]).toEqual([a.id, null])
  })
})

// ── 14/10 : « chacun ses clients » — le secteur pour la prospection, l'agence travaillée à qui l'a travaillée ──
describe("qui a quelle agence : le secteur pour prospecter, celui qui l'a travaillée pour la suite", () => {
  const HORLANN = "7c1e6a3e-1111-4c4c-9a9a-000000000001"
  const commeHorlann = () => q(`select set_config('request.jwt.claims', '{"sub":"${HORLANN}","role":"authenticated","user_metadata":{"nom":"Horlann"}}', false)`)
  const commeMahdi = () => q(`select set_config('request.jwt.claims', '{"sub":"${MAHDI}","role":"authenticated","app_metadata":{"role":"admin"},"user_metadata":{"nom":"Mahdi"}}', false)`)
  const proprio = async (id: string) => (await un<{ c: string | null }>(`select commercial_id::text as c from public.agences where id = $1`, [id])).c
  beforeAll(async () => {
    await q(`insert into public.secteurs (code, libelle, zone, commercial_id) values ('75008', 'Paris 8', 'Paris', $1) on conflict (code) do update set commercial_id = excluded.commercial_id`, [MAHDI])
  })
  async function agenceDeMahdi(nom: string): Promise<string> {
    const r = await un<{ id: string }>(`insert into public.agences (nom, telephone, secteur) values ($1, $2, '75008') returning id`, [nom, `01 48 ${String(Math.floor(Math.random() * 90) + 10)} ${String(Math.floor(Math.random() * 90) + 10)} 00`])
    return r.id
  }

  it("une agence jamais travaillée appartient au démarcheur de son secteur", async () => {
    const id = await agenceDeMahdi("T-neuve")
    expect(await proprio(id)).toBe(MAHDI)
  })
  it("Horlann rend intéressée une agence du secteur de Mahdi : elle est à Horlann", async () => {
    const id = await agenceDeMahdi("T-intéressée par Horlann")
    await commeHorlann()
    try { await appel(id, "joint", "interesse") } finally { await commeMahdi() }
    expect(await proprio(id)).toBe(HORLANN)
  })
  it("Horlann promet un rappel : l'agence est à Horlann, et le rappel est dans SA pile", async () => {
    const id = await agenceDeMahdi("T-rappel promis par Horlann")
    await commeHorlann()
    try { await appel(id, "joint", "a_rappeler", { rappel: new Date(Date.now() - 60_000).toISOString() }) } finally { await commeMahdi() }
    expect(await proprio(id)).toBe(HORLANN)
    // la date du rappel est passée : il tombe dans « À rappeler aujourd'hui » de Horlann, pas de Mahdi
    const pile = async (c: string) => (await q<{ id: string }>(`select agence->>'id' as id from public.pile_demarchage('rappels', $1)`, [c])).map((x) => x.id)
    await q(`update public.activites set date = now() - interval '1 day' where agence_id = $1 and type = 'appel'`, [id])
    expect(await pile(HORLANN)).toContain(id)
    expect(await pile(MAHDI)).not.toContain(id)
  })
  it("le secteur change de main : les agences travaillées restent à celui qui les a travaillées", async () => {
    const neuve = await agenceDeMahdi("T-neuve 2")
    const travaillee = await agenceDeMahdi("T-travaillée par Mahdi")
    await appel(travaillee, "joint", "interesse")
    expect(await proprio(travaillee)).toBe(MAHDI)
    await q(`select public.attribuer_secteur('75008', $1::uuid)`, [HORLANN])
    expect(await proprio(neuve)).toBe(HORLANN)
    expect(await proprio(travaillee)).toBe(MAHDI)
    await q(`select public.attribuer_secteur('75008', $1::uuid)`, [MAHDI])
  })
  it("pas intéressée : elle n'est plus travaillée, elle retourne au démarcheur du secteur", async () => {
    const id = await agenceDeMahdi("T-pas intéressée")
    await commeHorlann()
    try {
      await appel(id, "joint", "interesse")
      expect(await proprio(id)).toBe(HORLANN)
      await q(`update public.activites set date = now() - interval '1 day' where agence_id = $1 and type = 'appel'`, [id])
      await appel(id, "joint", "pas_interesse")
    } finally { await commeMahdi() }
    expect(await proprio(id)).toBe(MAHDI)
  })
  it("passée à la main en « Intéressé » sur la fiche : elle est à celui qui l'a passée", async () => {
    const id = await agenceDeMahdi("T-fiche")
    await commeHorlann()
    try { await q(`update public.agences set etape = 'interesse' where id = $1`, [id]) } finally { await commeMahdi() }
    expect(await proprio(id)).toBe(HORLANN)
  })
  it("la santé signale une agence travaillée qui n'est à personne", async () => {
    const id = await agenceDeMahdi("T-orpheline")
    await appel(id, "joint", "interesse")
    await q(`update public.agences set commercial_id = null where id = $1`, [id])
    const e = await q<{ code: string }>(`select code from public.sante_demarchage()`)
    expect(e.map((x) => x.code)).toContain("travaillee_sans_proprietaire")
    await q(`update public.agences set commercial_id = $2 where id = $1`, [id, MAHDI])
  })
})
