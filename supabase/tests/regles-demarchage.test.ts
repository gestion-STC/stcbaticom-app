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
  it("un rappel prévu aujourd'hui autorise le rappel du même numéro", async () => {
    const id = await agence()
    await appel(id, "joint", "a_rappeler", { rappel: new Date(Date.now() + 60_000).toISOString() })
    expect(await verifier(id, await telDe(id))).toBeNull()
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
