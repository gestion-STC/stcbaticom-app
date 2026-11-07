// ── LES AUTRES ÉCRANS DE LA PROSPECTION (07/11/2026) : Dashboard, Leads, Bases, Boîte de réception, Équipes ──
// Tous passent par la vue du compte (useVue) : chacun ne voit que ses bases, ses contacts, ses leads, ses mails.
import { useMemo, useState } from "react"
import { Phone, Reply, Upload } from "lucide-react"
import { Bouton, Pastille, Selecteur, Zone } from "../../ui"
import { Bandeau, Bloc, Etiquette, Table } from "../demarchage/aujourdhui/courtier"
import { useDepot } from "../../prospection/depot"
import { constats, indicateurs } from "../../prospection/indicateurs"
import { NomBase, Titre } from "./morceaux"
import { dateHeure, fr, useVue } from "./outils"

export type Ecran = "dashboard" | "campagnes" | "suivi" | "editeur" | "leads" | "session" | "bases" | "boite" | "equipes"

// ── Dashboard : ma journée ──
export function Dashboard({ aller, ouvrir }: { aller: (e: Ecran) => void; ouvrir: (id: string) => void }) {
  const v = useVue()
  const aTraiter = v.leads.filter((l) => l.statut === "a_traiter")
  const mesAppels = v.etat.appels.filter((a) => a.compteId === v.compte.id)
  const nonLus = v.messages.filter((m) => m.sens === "entrant" && !m.lu).length
  const camps = v.etat.campagnes.filter((c) => v.idsBases.has(c.baseId))
  const alertes = useMemo(() => camps.filter((c) => c.statut === "active").flatMap((c) => constats(indicateurs(c, v.base(c.baseId)!, v.etat.contacts, v.etat.inscriptions, v.etat.envois, v.evenements, v.etat.leads, v.etat.appels)).filter((k) => k.ton === "alerte").slice(0, 2).map((k) => ({ ...k, c }))), [camps, v])
  return (
    <div className="space-y-8">
      <Titre titre={`Bonjour ${v.compte.nom.split(" ")[0]}`} sous={v.compte.role === "gerant" ? "Toutes les équipes, toutes les bases" : `Tes bases : ${v.bases.map((b) => b.nom).join(", ") || "aucune"}`} />
      <Bandeau cases={[
        { libelle: "Leads à traiter", valeur: aTraiter.length, ton: aTraiter.length ? "text-ok" : undefined, onClick: () => aller("leads") },
        { libelle: "Étapes Appel", valeur: v.etat.taches.filter((t) => t.type === "appel" && !t.faiteLe && v.contacts.some((k) => k.id === t.contactId)).length, onClick: () => aller("session") },
        { libelle: "Mails non lus", valeur: nonLus, onClick: () => aller("boite") },
        { libelle: "Mes appels", valeur: mesAppels.length, variation: <span className="chiffres text-colonne text-encre-2">{mesAppels.filter((a) => a.resultat === "joint").length} joints</span> },
        { libelle: "Campagnes actives", valeur: camps.filter((c) => c.statut === "active").length, onClick: () => aller("campagnes") },
      ]} />
      <div className="grid gap-10 @min-[1100px]:grid-cols-2">
        <Bloc titre="À appeler maintenant"><ul className="mt-2 divide-y-[0.5px] divide-trait">{aTraiter.slice(0, 6).map((l) => { const k = v.contact(l.contactId); return <li key={l.id} className="flex items-center justify-between gap-3 py-2.5 text-legende"><span className="min-w-0"><b className="font-medium">{k?.nom}</b><span className="block truncate text-colonne text-encre-2">{l.signal} · {dateHeure(l.creeLe)}</span></span><Bouton taille="sm" icone={<Phone />} onClick={() => aller("session")}>Appeler</Bouton></li> })}{!aTraiter.length ? <li className="py-4 text-legende text-encre-2">Aucun lead pour l'instant.</li> : null}</ul></Bloc>
        <Bloc titre="Ce qui demande ton attention"><ul className="mt-2 divide-y-[0.5px] divide-trait">{alertes.map((a, i) => <li key={i} className="flex items-center justify-between gap-3 py-2.5"><span><b className="text-legende font-medium">{a.titre}</b><span className="block text-colonne text-encre-2">{a.c.nom} · {a.preuve}</span></span><Bouton taille="sm" onClick={() => ouvrir(a.c.id)}>Voir</Bouton></li>)}{!alertes.length ? <li className="py-4 text-legende text-encre-2">Rien d'anormal sur tes campagnes actives.</li> : null}</ul></Bloc>
      </div>
    </div>
  )
}

// ── Leads ──
export function Leads({ aller }: { aller: (e: Ecran) => void }) {
  const v = useVue()
  const depot = useDepot()
  const [statut, setStatut] = useState<"a_traiter" | "traite">("a_traiter")
  const lignes = v.leads.filter((l) => l.statut === statut).sort((a, b) => (a.creeLe < b.creeLe ? 1 : -1))
  const commerciaux = v.etat.comptes.filter((c) => c.role === "commercial")
  return (
    <div className="space-y-6">
      <Titre titre="Leads" sous="Nés d'une campagne (clic, réponse, ouvertures). Ils restent ici tant que le décideur n'a pas été joint." droite={<Bouton variante="plein" icone={<Phone />} onClick={() => aller("session")}>Les appeler</Bouton>} />
      <div className="flex gap-2">{(["a_traiter", "traite"] as const).map((s) => <Bouton key={s} taille="sm" variante={statut === s ? "plein" : "contour"} onClick={() => setStatut(s)}>{s === "a_traiter" ? `À traiter · ${v.leads.filter((l) => l.statut === s).length}` : `Traités · ${v.leads.filter((l) => l.statut === s).length}`}</Bouton>)}</div>
      <Table colonnes={[{ titre: "Contact" }, ...(v.bases.length > 1 ? [{ titre: "Base", largeur: "180px" }] : []), { titre: "Signal", largeur: "200px" }, { titre: "Campagne", largeur: "220px" }, { titre: "Quand", largeur: "100px" }, { titre: "Attribué à", largeur: "170px" }, { titre: "", largeur: "100px" }]} vide="Aucun lead."
        lignes={lignes.map((l) => { const k = v.contact(l.contactId); return { cle: l.id, cellules: [
          <span className="block truncate py-1.5"><b className="font-medium">{k?.nom}</b><span className="block truncate text-colonne text-encre-2">{Object.values(k?.champs ?? {}).slice(0, 2).join(" · ")}</span></span>,
          ...(v.bases.length > 1 ? [<NomBase base={v.base(l.baseId)} />] : []), l.signal, <span className="truncate text-encre-2">{v.etat.campagnes.find((c) => c.id === l.campagneId)?.nom ?? "—"}</span>, <span className="chiffres text-encre-2">{dateHeure(l.creeLe)}</span>,
          v.compte.role === "gerant" ? <Selecteur value={l.proprietaireId ?? ""} onChange={(e) => depot.attribuer([l.contactId], e.target.value || null)} aria-label="Attribuer"><option value="">L'équipe</option>{commerciaux.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</Selecteur> : <span className="text-encre-2">{v.etat.comptes.find((c) => c.id === l.proprietaireId)?.nom ?? "L'équipe"}</span>,
          l.statut === "a_traiter" ? <Bouton taille="sm" icone={<Phone />} onClick={() => aller("session")}>Appeler</Bouton> : <Pastille role="fait">Joint</Pastille>,
        ] } })} />
    </div>
  )
}

// ── Bases : les contacts, les réglages, l'attribution, l'import ──
export function Bases() {
  const v = useVue()
  const depot = useDepot()
  const [baseId, setBaseId] = useState(v.bases[0]?.id ?? "")
  const [filtre, setFiltre] = useState<Record<string, string>>({})
  const [statut, setStatut] = useState("")
  const [coches, setCoches] = useState<string[]>([])
  const [importTexte, setImportTexte] = useState("")
  const [importes, setImportes] = useState<number | null>(null)
  const base = v.base(baseId)
  const contacts = v.contacts.filter((k) => k.baseId === baseId && (!statut || k.statut === statut) && Object.entries(filtre).every(([c, val]) => !val || (k.champs[c] ?? "").includes(val)))
  const commerciaux = v.etat.comptes.filter((c) => c.role === "commercial")
  if (!base) return <p className="text-legende text-encre-2">Aucune base pour ce compte.</p>
  const tous = v.contacts.filter((k) => k.baseId === baseId)
  const importer = () => {
    const l = importTexte.split("\n").map((x) => x.split(/[;,\t]/).map((y) => y.trim())).filter((x) => x[0])
    const n = depot.importer(baseId, l.map(([nom, email, tel, ...rest]) => ({ baseId, nom, personne: "", email: email ?? "", mobile: /^0[67]/.test(tel ?? "") ? tel : "", telephone: tel ?? "", champs: Object.fromEntries(base.champs.map((ch, i) => [ch.cle, rest[i] ?? ""])), statut: "libre", desinscrit: false, proprietaireId: null })))
    setImportTexte(""); setImportes(n)
  }
  return (
    <div className="space-y-6">
      <Titre titre="Bases" sous="Une base = des contacts, leurs champs, ce qui compte comme gagné, et l'équipe qui la travaille" droite={v.bases.length > 1 ? <span className="w-60"><Selecteur value={baseId} onChange={(e) => { setBaseId(e.target.value); setFiltre({}); setCoches([]) }}>{v.bases.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}</Selecteur></span> : null} />
      <Bandeau cases={[
        { libelle: "Contacts", valeur: fr(tous.length) }, { libelle: "Avec un mail", valeur: fr(tous.filter((k) => k.email).length) }, { libelle: "Avec un mobile", valeur: fr(tous.filter((k) => k.mobile).length) },
        { libelle: "Leads", valeur: fr(tous.filter((k) => k.statut === "lead").length), ton: "text-ok" }, { libelle: "Gagnés", valeur: fr(tous.filter((k) => k.statut === "gagne").length) }, { libelle: "Désinscrits", valeur: fr(tous.filter((k) => k.desinscrit).length) },
      ]} />
      <div className="grid gap-10 @min-[1250px]:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            {base.champs.map((ch) => <label key={ch.cle} className="block w-48 space-y-1"><Etiquette>{ch.libelle}</Etiquette><Selecteur value={filtre[ch.cle] ?? ""} onChange={(e) => setFiltre({ ...filtre, [ch.cle]: e.target.value })}><option value="">Tous</option>{[...new Set(tous.flatMap((k) => (k.champs[ch.cle] ?? "").split(" / ")).filter(Boolean))].sort().slice(0, 50).map((x) => <option key={x} value={x}>{x}</option>)}</Selecteur></label>)}
            <label className="block w-40 space-y-1"><Etiquette>Statut</Etiquette><Selecteur value={statut} onChange={(e) => setStatut(e.target.value)}><option value="">Tous</option><option value="libre">Libre</option><option value="lead">Lead</option><option value="gagne">Gagné</option></Selecteur></label>
            {v.compte.role === "gerant" && coches.length ? <span className="flex items-center gap-2 text-legende">{coches.length} cochés → <span className="w-44"><Selecteur value="" onChange={(e) => { depot.attribuer(coches, e.target.value === "_" ? null : e.target.value); setCoches([]) }}><option value="">Attribuer à…</option><option value="_">L'équipe</option>{commerciaux.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</Selecteur></span></span> : null}
          </div>
          <Table colonnes={[...(v.compte.role === "gerant" ? [{ titre: "", largeur: "32px" }] : []), { titre: base.unite === "agences" ? "Agence" : "Entreprise" }, ...base.champs.map((ch) => ({ titre: ch.libelle, largeur: "150px" })), { titre: "Mail", largeur: "56px" }, { titre: "Mobile", largeur: "64px" }, { titre: "Statut", largeur: "100px" }, { titre: "Attribué à", largeur: "130px" }]}
            lignes={contacts.slice(0, 100).map((k) => ({ cle: k.id, cellules: [
              ...(v.compte.role === "gerant" ? [<input type="checkbox" className="accent-[var(--color-action)]" checked={coches.includes(k.id)} onChange={() => setCoches((c) => (c.includes(k.id) ? c.filter((x) => x !== k.id) : [...c, k.id]))} />] : []),
              <span className="block truncate py-1.5"><b className="font-medium">{k.nom}</b>{k.personne ? <span className="block truncate text-colonne text-encre-2">{k.personne}</span> : null}</span>,
              ...base.champs.map((ch) => <span className="truncate text-encre-2">{k.champs[ch.cle] || "—"}</span>),
              k.email ? "oui" : <span className="text-encre-3">—</span>, k.mobile ? "oui" : <span className="text-encre-3">—</span>,
              <Pastille role={k.statut === "gagne" ? "fait" : k.statut === "lead" ? "actif" : k.desinscrit ? "probleme" : "inerte"}>{k.desinscrit ? "Désinscrit" : ({ libre: "Libre", lead: "Lead", gagne: "Gagné", exclu: "Exclu" })[k.statut]}</Pastille>,
              <span className="truncate text-colonne text-encre-2">{v.etat.comptes.find((c) => c.id === k.proprietaireId)?.nom ?? "L'équipe"}</span>,
            ] }))} />
          <p className="text-colonne text-encre-3">{fr(contacts.length)} contacts · les 100 premiers affichés</p>
        </div>
        <aside className="space-y-6">
          <Bloc titre="Réglages de la base">
            <dl className="mt-3 space-y-2 text-legende">
              <div><dt className="text-colonne text-encre-2">Équipe</dt><dd>{v.etat.equipes.find((q) => q.id === base.equipeId)?.nom}</dd></div>
              <div><dt className="text-colonne text-encre-2">Gagné quand</dt><dd>{base.gagne}</dd></div>
              <div><dt className="text-colonne text-encre-2">Issues d'appel</dt><dd>{base.issues.map((x) => x.libelle).join(" · ")}</dd></div>
              <div><dt className="text-colonne text-encre-2">Prospection à froid</dt><dd>{v.compte.role === "gerant" ? <label className="flex items-center gap-2"><input type="checkbox" className="accent-[var(--color-action)]" checked={base.prospection} onChange={(e) => depot.majBase({ ...base, prospection: e.target.checked })} />{base.prospection ? "Oui : file « Prospection » dans la session" : "Non : on n'appelle que les leads"}</label> : base.prospection ? "Oui" : "Non"}</dd></div>
            </dl>
          </Bloc>
          <Bloc titre="Importer des contacts">
            <Zone rows={4} className="mt-3" value={importTexte} onChange={(e) => setImportTexte(e.target.value)} placeholder={`Une ligne par contact : nom ; mail ; téléphone ; ${base.champs.map((c) => c.libelle.toLowerCase()).join(" ; ")}`} />
            <Bouton className="mt-2" icone={<Upload />} disabled={!importTexte.trim()} onClick={importer}>Importer dans « {base.nom} »</Bouton>
            {importes != null ? <p className="mt-2 text-colonne text-ok">{importes} contacts importés.</p> : null}<p className="mt-2 text-colonne text-encre-2">En production : un fichier CSV ou Excel, avec le contrôle des doublons et des désinscrits.</p>
          </Bloc>
        </aside>
      </div>
    </div>
  )
}

// ── Boîte de réception : seulement les mails des contacts de MES bases ──
export function Boite() {
  const v = useVue()
  const depot = useDepot()
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [reponse, setReponse] = useState("")
  const fils = [...v.messages].sort((a, b) => (a.le < b.le ? 1 : -1))
  const m = fils.find((x) => x.id === ouvert)
  const k = m?.contactId ? v.contact(m.contactId) : undefined
  return (
    <div className="space-y-6">
      <Titre titre="Boîte de réception" sous={v.compte.role === "gerant" ? "Tous les mails" : "Seulement les mails des contacts de tes bases et de tes leads"} />
      <div className="grid gap-8 @min-[1100px]:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <ul className="divide-y-[0.5px] divide-trait border-y-[0.5px] border-trait">{fils.slice(0, 80).map((x) => { const c = x.contactId ? v.contact(x.contactId) : undefined; return (
          <li key={x.id}><button type="button" onClick={() => { setOuvert(x.id); if (!x.lu) depot.lireMessage(x.id) }} className={`w-full px-3 py-2.5 text-left ${ouvert === x.id ? "bg-fond-4" : "hover:bg-fond-2"}`}>
            <span className="flex items-center justify-between gap-3"><span className={`truncate text-legende ${x.lu ? "" : "font-semibold"}`}>{x.sens === "sortant" ? `→ ${c?.nom}` : c?.nom}</span><span className="chiffres shrink-0 text-colonne text-encre-2">{dateHeure(x.le)}</span></span>
            <span className="block truncate text-colonne text-encre-2">{x.objet} — {x.corps}</span>
            <span className="mt-0.5 block"><NomBase base={c ? v.base(c.baseId) : undefined} /></span>
          </button></li>) })}{!fils.length ? <li className="py-8 text-center text-legende text-encre-2">Aucun mail. Les réponses aux campagnes et les mails de suivi arrivent ici.</li> : null}</ul>
        {m ? (
          <div className="space-y-4">
            <div><p className="text-colonne text-encre-2">{m.sens === "entrant" ? `De ${k?.nom} <${m.de}>` : `À ${k?.nom} <${m.a}>`} · {dateHeure(m.le)}</p><h2 className="mt-1 text-sous-titre font-semibold">{m.objet}</h2></div>
            <p className="whitespace-pre-line text-legende">{m.corps}</p>
            {m.campagneId ? <p className="text-colonne text-encre-2">Campagne : {v.etat.campagnes.find((c) => c.id === m.campagneId)?.nom}</p> : null}
            {m.sens === "entrant" ? (<>
              <Zone rows={4} value={reponse} onChange={(e) => setReponse(e.target.value)} placeholder="Ta réponse…" />
              <Bouton variante="plein" icone={<Reply />} disabled={!reponse.trim()} onClick={() => { depot.repondre({ contactId: m.contactId, de: m.a, a: m.de, objet: "RE: " + m.objet.replace(/^RE: /, ""), corps: reponse, campagneId: m.campagneId }); setReponse("") }}>Répondre</Bouton>
            </>) : null}
          </div>
        ) : <p className="text-legende text-encre-2">Choisis un mail.</p>}
      </div>
    </div>
  )
}

// ── Équipes et accès (gérant) : la cloison, réglable ──
export function Equipes() {
  const v = useVue()
  const depot = useDepot()
  return (
    <div className="space-y-6">
      <Titre titre="Équipes et accès" sous="Un compte ne voit que les bases de ses équipes : contacts, campagnes, leads, session, mails, chiffres. Le gérant voit tout." />
      <Table colonnes={[{ titre: "Équipe", largeur: "180px" }, { titre: "Bases", largeur: "260px" }, ...v.etat.comptes.filter((c) => c.role === "commercial").map((c) => ({ titre: c.nom, largeur: "150px" }))]}
        lignes={v.etat.equipes.map((q) => ({ cle: q.id, cellules: [
          <b className="font-medium">{q.nom}</b>, <span className="text-encre-2">{v.etat.bases.filter((b) => b.equipeId === q.id).map((b) => b.nom).join(" · ")}</span>,
          ...v.etat.comptes.filter((c) => c.role === "commercial").map((c) => <label className="flex items-center gap-2"><input type="checkbox" className="accent-[var(--color-action)]" checked={q.comptes.includes(c.id)} onChange={() => depot.majEquipe({ ...q, comptes: q.comptes.includes(c.id) ? q.comptes.filter((x) => x !== c.id) : [...q.comptes, c.id] })} />{q.comptes.includes(c.id) ? "membre" : "—"}</label>),
        ] }))} />
      <p className="text-colonne text-encre-2">Coche ou décoche, puis connecte-toi avec le compte (en haut) : son menu, ses leads et sa boîte changent aussitôt. Au sein d'une base, « Attribuer » dans Bases ou Leads réserve des contacts à un commercial.</p>
    </div>
  )
}
