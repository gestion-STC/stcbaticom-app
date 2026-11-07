// ── CRÉER / MODIFIER UNE CAMPAGNE (07/11/2026) ──
// Trois niveaux, comme le gestionnaire de publicités : la campagne (base, objectif), l'audience (filtres sur
// les champs de la base, rythme), la séquence (des blocs qu'on assemble, chaque envoi peut avoir sa variante B).
// Tout est modifiable ; « Lancer » met la campagne en route au prochain passage de la machine.
import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, Check, Clock, GitBranch, Mail, MessageSquare, Newspaper, Phone, Plus, Square, Trash2, UserRoundPlus, type LucideIcon } from "lucide-react"
import { Bouton, Champ, Selecteur, Zone } from "../../ui"
import { Bloc, Etiquette } from "../demarchage/aujourdhui/courtier"
import { useDepot } from "../../prospection/depot"
import { LIBELLE_CONDITION, LIBELLE_ETAPE, LIBELLE_SIGNAL, estEligible, type Campagne, type Condition, type Etape, type Signal } from "../../prospection/modele"
import { Titre } from "./morceaux"
import { fr, useVue } from "./outils"

const ICONE: Record<Etape["type"], LucideIcon> = { mail: Mail, sms: MessageSquare, linkedin: UserRoundPlus, newsletter: Newspaper, appel: Phone, attendre: Clock, si: GitBranch, fin: Square }
const AIDE: Record<Etape["type"], string> = { mail: "Un mail, avec ses liens suivis", sms: "Mobiles seulement, plage horaire à part", linkedin: "Une tâche pour le commercial : visite, invitation, message", newsletter: "Un envoi unique à toute l'audience", appel: "Le contact arrive dans la session de call", attendre: "Un délai en jours", si: "Une condition : sinon, on saute plus loin", fin: "Fin de séquence" }
const JOURS = ["L", "M", "M", "J", "V", "S", "D"]
let k = 0
const nid = () => `n${Date.now().toString(36)}${++k}`

function etapeVide(type: Etape["type"]): Etape {
  if (type === "attendre") return { id: nid(), type, jours: 3 }
  if (type === "si") return { id: nid(), type, condition: "a_clique", sinonVers: null }
  if (type === "appel") return { id: nid(), type, consigne: "" }
  if (type === "fin") return { id: nid(), type }
  return { id: nid(), type, variantes: [{ id: nid(), nom: "A", objet: "", corps: "" }] }
}

export default function Editeur({ id, fini }: { id: string | null; fini: (id: string) => void }) {
  const v = useVue()
  const depot = useDepot()
  const existante = id ? v.etat.campagnes.find((c) => c.id === id) : null
  const [c, setC] = useState<Campagne>(() => existante ?? {
    id: nid(), nom: "", baseId: v.bases[0]?.id ?? "", objectif: "Créer des leads", statut: "brouillon",
    audience: { filtres: {}, doitAvoir: ["email", "telephone"] }, rythme: { parJour: 20, jours: [1, 2, 3, 4, 5], heureMin: 9, heureMax: 18, ecartMinH: 48 },
    etapes: [etapeVide("mail"), etapeVide("attendre"), etapeVide("fin")], signaux: ["clic_lien_principal", "reponse"],
    creeParId: v.compte.id, creeLe: v.etat.maintenant, lanceeLe: null, coutSms: 0.06, modeTest: true, testEmail: "gestion@stcbatiment.fr", testMobile: "",
  })
  const [ouverte, setOuverte] = useState<string | null>(c.etapes[0]?.id ?? null)
  const [palette, setPalette] = useState(false)
  const base = v.base(c.baseId)
  const contactsBase = useMemo(() => v.contacts.filter((x) => x.baseId === c.baseId), [v.contacts, c.baseId])
  const eligibles = useMemo(() => contactsBase.filter((x) => estEligible(x, c)).length, [contactsBase, c])
  const valeurs = (cle: string) => [...new Set(contactsBase.flatMap((x) => (x.champs[cle] ?? "").split(" / ")).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")).slice(0, 40)
  const majEtape = (eid: string, f: (e: Etape) => Etape) => setC((x) => ({ ...x, etapes: x.etapes.map((e) => (e.id === eid ? f(e) : e)) }))
  const deplacer = (i: number, d: number) => setC((x) => { const l = [...x.etapes]; const j = i + d; if (j < 0 || j >= l.length) return x; [l[i], l[j]] = [l[j], l[i]]; return { ...x, etapes: l } })
  const ajouter = (type: Etape["type"]) => { const e = etapeVide(type); setC((x) => { const l = [...x.etapes]; const fin = l.findIndex((y) => y.type === "fin"); l.splice(fin >= 0 ? fin : l.length, 0, e); return { ...x, etapes: l } }); setOuverte(e.id); setPalette(false) }
  const enregistrer = (statut: Campagne["statut"]) => { const s = { ...c, nom: c.nom.trim() || "Campagne sans nom", statut, lanceeLe: statut === "active" ? c.lanceeLe ?? v.etat.maintenant : c.lanceeLe }; depot.enregistrerCampagne(s); fini(s.id) }
  const basculerFiltre = (cle: string, val: string) => setC((x) => { const l = x.audience.filtres[cle] ?? []; return { ...x, audience: { ...x.audience, filtres: { ...x.audience.filtres, [cle]: l.includes(val) ? l.filter((y) => y !== val) : [...l, val] } } } })
  const sansContenu = c.etapes.some((e) => "variantes" in e && e.type !== "linkedin" && e.variantes.some((y) => !y.corps.trim()))

  return (
    <div className="space-y-6">
      <Titre titre={existante ? `Modifier · ${existante.nom}` : "Créer une campagne"} sous={existante?.statut === "active" ? "Campagne active : les changements valent pour les prochaines touches." : "Rien ne part tant qu'elle n'est pas lancée."}
        droite={<><Bouton onClick={() => enregistrer(existante?.statut === "active" ? "active" : existante?.statut === "pause" ? "pause" : "brouillon")}>Enregistrer</Bouton>{existante?.statut !== "active" ? <Bouton variante="plein" icone={<Check />} disabled={!eligibles || sansContenu} title={sansContenu ? "Un message est vide" : !eligibles ? "Personne dans l'audience" : undefined} onClick={() => enregistrer("active")}>Lancer</Bouton> : null}</>} />
      <div className="grid gap-10 @min-[1250px]:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-8">
          <Bloc titre="1 · La campagne">
            <div className="mt-3 grid grid-cols-2 gap-4">
              <label className="col-span-2 block space-y-1"><Etiquette>Nom</Etiquette><Champ value={c.nom} onChange={(e) => setC({ ...c, nom: e.target.value })} placeholder="Ex. Gestionnaires 92 · relance de novembre" /></label>
              <label className="block space-y-1"><Etiquette>Base</Etiquette><Selecteur value={c.baseId} disabled={Boolean(existante?.lanceeLe)} onChange={(e) => setC({ ...c, baseId: e.target.value, audience: { ...c.audience, filtres: {} } })}>{v.bases.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}</Selecteur></label>
              <label className="block space-y-1"><Etiquette>Objectif</Etiquette><Selecteur value={c.objectif} onChange={(e) => setC({ ...c, objectif: e.target.value })}>{["Créer des leads", "Obtenir un rendez-vous", "Faire déposer un dossier", "Réveiller les endormis", "Informer (newsletter)"].map((o) => <option key={o}>{o}</option>)}</Selecteur></label>
            </div>
          </Bloc>

          <Bloc titre="2 · L'audience" droite={<span className="chiffres text-colonne text-encre"><b className="font-medium">{fr(eligibles)}</b> {base?.unite} éligibles</span>}>
            <div className="mt-3 space-y-4">
              {base?.champs.map((ch) => (
                <div key={ch.cle}><Etiquette>{ch.libelle}</Etiquette><div className="mt-1.5 flex flex-wrap gap-1.5">{valeurs(ch.cle).map((val) => { const on = (c.audience.filtres[ch.cle] ?? []).includes(val); return <button key={val} type="button" onClick={() => basculerFiltre(ch.cle, val)} className={`h-7 rounded-full px-3 text-colonne ${on ? "bg-action text-white" : "border-[0.5px] border-trait bg-fond text-encre hover:bg-fond-2"}`}>{val}</button> })}</div></div>
              ))}
              <div className="flex flex-wrap gap-4 text-legende">{(["email", "telephone", "mobile"] as const).map((x) => <label key={x} className="flex items-center gap-2"><input type="checkbox" className="accent-[var(--color-action)]" checked={c.audience.doitAvoir.includes(x)} onChange={() => setC({ ...c, audience: { ...c.audience, doitAvoir: c.audience.doitAvoir.includes(x) ? c.audience.doitAvoir.filter((y) => y !== x) : [...c.audience.doitAvoir, x] } })} />Doit avoir un {x === "email" ? "mail" : x === "telephone" ? "téléphone" : "mobile (pour les SMS)"}</label>)}</div>
              <p className="text-colonne text-encre-2">Toujours exclus : déjà dans une autre campagne en cours, désinscrits, rebonds, gagnés.</p>
              <div className="grid grid-cols-4 gap-4">
                <label className="block space-y-1"><Etiquette>Entrées par jour</Etiquette><Champ type="number" min={1} max={500} value={c.rythme.parJour} onChange={(e) => setC({ ...c, rythme: { ...c.rythme, parJour: Number(e.target.value) || 1 } })} /></label>
                <label className="block space-y-1"><Etiquette>De</Etiquette><Champ type="number" min={0} max={23} value={c.rythme.heureMin} onChange={(e) => setC({ ...c, rythme: { ...c.rythme, heureMin: Number(e.target.value) } })} /></label>
                <label className="block space-y-1"><Etiquette>À</Etiquette><Champ type="number" min={1} max={24} value={c.rythme.heureMax} onChange={(e) => setC({ ...c, rythme: { ...c.rythme, heureMax: Number(e.target.value) } })} /></label>
                <label className="block space-y-1"><Etiquette>Écart min. entre touches (h)</Etiquette><Champ type="number" min={0} max={240} value={c.rythme.ecartMinH} onChange={(e) => setC({ ...c, rythme: { ...c.rythme, ecartMinH: Number(e.target.value) } })} /></label>
              </div>
              <div className="flex gap-1">{JOURS.map((j, i) => { const on = c.rythme.jours.includes(i + 1); return <button key={i} type="button" onClick={() => setC({ ...c, rythme: { ...c.rythme, jours: on ? c.rythme.jours.filter((x) => x !== i + 1) : [...c.rythme.jours, i + 1].sort() } })} className={`h-8 w-8 rounded-full text-colonne ${on ? "bg-action text-white" : "bg-fond-3 text-encre-2"}`}>{j}</button> })}</div>
            </div>
          </Bloc>

          <Bloc titre="3 · La séquence" droite={<span className="text-colonne text-encre-2">clique une étape pour l'ouvrir</span>}>
            <ol className="mt-3 space-y-1">
              {c.etapes.map((e, i) => { const I = ICONE[e.type]; const ouv = ouverte === e.id; return (
                <li key={e.id}>
                  <div className={`rounded-4 border-[0.5px] ${ouv ? "border-encre/40" : "border-trait"} ${e.type === "attendre" ? "border-dashed" : "bg-fond-2"}`}>
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <button type="button" onClick={() => setOuverte(ouv ? null : e.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <span className="chiffres w-4 text-colonne text-encre-3">{i + 1}</span>
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fond shadow-[0_0_0_0.5px_rgb(17_17_19/0.12)]"><I size={14} /></span>
                        <span className="min-w-0"><b className="text-legende font-medium">{LIBELLE_ETAPE[e.type]}</b><span className="block truncate text-colonne text-encre-2">{
                          "variantes" in e ? (e.variantes.map((x) => x.objet || x.corps.slice(0, 60) || "(vide)").join(" | ") + (e.variantes.length > 1 ? ` · test A/B (${e.variantes.length})` : ""))
                          : e.type === "attendre" ? `${e.jours} jour${e.jours > 1 ? "s" : ""}` : e.type === "si" ? `Si ${LIBELLE_CONDITION[e.condition]} → on continue ; sinon → ${e.sinonVers ? `étape ${c.etapes.findIndex((x) => x.id === e.sinonVers) + 1}` : "étape suivante"}` : e.type === "appel" ? e.consigne || "consigne pour le commercial" : AIDE.fin}</span></span>
                      </button>
                      {e.type !== "fin" ? <span className="flex shrink-0 gap-1"><Bouton taille="icone" variante="discret" icone={<ArrowUp />} aria-label="Monter" onClick={() => deplacer(i, -1)} /><Bouton taille="icone" variante="discret" icone={<ArrowDown />} aria-label="Descendre" onClick={() => deplacer(i, 1)} /><Bouton taille="icone" variante="discret" icone={<Trash2 />} aria-label="Supprimer" onClick={() => setC({ ...c, etapes: c.etapes.filter((x) => x.id !== e.id) })} /></span> : null}
                    </div>
                    {ouv && e.type !== "fin" ? (
                      <div className="space-y-3 border-t-[0.5px] border-trait bg-fond px-4 py-3">
                        {"variantes" in e ? (<>
                          {e.variantes.map((va, vi) => (
                            <div key={va.id} className="space-y-2 rounded-3 border-[0.5px] border-trait p-3">
                              <div className="flex items-center gap-2"><Champ value={va.nom} onChange={(ev) => majEtape(e.id, (x) => ({ ...x, variantes: ("variantes" in x ? x.variantes : []).map((y) => (y.id === va.id ? { ...y, nom: ev.target.value } : y)) } as Etape))} className="w-40" aria-label="Nom de la variante" />{e.variantes.length > 1 ? <Bouton taille="sm" variante="discret" onClick={() => majEtape(e.id, (x) => ({ ...x, variantes: ("variantes" in x ? x.variantes : []).filter((y) => y.id !== va.id) } as Etape))}>Retirer</Bouton> : null}<span className="ml-auto text-colonne text-encre-3">{vi === 0 ? "variante A" : `variante ${String.fromCharCode(65 + vi)}`}</span></div>
                              {e.type === "mail" || e.type === "newsletter" ? <Champ value={va.objet} placeholder="Objet" onChange={(ev) => majEtape(e.id, (x) => ({ ...x, variantes: ("variantes" in x ? x.variantes : []).map((y) => (y.id === va.id ? { ...y, objet: ev.target.value } : y)) } as Etape))} /> : null}
                              <Zone rows={e.type === "sms" ? 3 : 5} value={va.corps} placeholder={e.type === "linkedin" ? "Ce que le commercial doit faire sur LinkedIn" : "Le texte. Variables : {{contact}}, {{entreprise}}, {{lien_principal}}"} onChange={(ev) => majEtape(e.id, (x) => ({ ...x, variantes: ("variantes" in x ? x.variantes : []).map((y) => (y.id === va.id ? { ...y, corps: ev.target.value } : y)) } as Etape))} />
                              {e.type === "sms" ? <p className="text-colonne text-encre-2">{va.corps.length} caractères · {Math.max(1, Math.ceil(va.corps.length / 160))} SMS</p> : null}
                            </div>
                          ))}
                          {e.type !== "linkedin" ? <Bouton taille="sm" icone={<Plus />} onClick={() => majEtape(e.id, (x) => ({ ...x, variantes: [...("variantes" in x ? x.variantes : []), { id: nid(), nom: String.fromCharCode(65 + ("variantes" in x ? x.variantes.length : 0)), objet: "", corps: "" }] } as Etape))}>Ajouter une variante (test A/B)</Bouton> : null}
                        </>) : e.type === "attendre" ? (
                          <label className="flex items-center gap-2 text-legende">Attendre <Champ type="number" min={1} max={60} value={e.jours} onChange={(ev) => majEtape(e.id, () => ({ ...e, jours: Number(ev.target.value) || 1 }))} className="w-20" /> jours</label>
                        ) : e.type === "si" ? (
                          <div className="flex flex-wrap items-center gap-2 text-legende">Si le contact
                            <span className="w-48"><Selecteur value={e.condition} onChange={(ev) => majEtape(e.id, () => ({ ...e, condition: ev.target.value as Condition }))}>{Object.entries(LIBELLE_CONDITION).map(([cle, l]) => <option key={cle} value={cle}>{l}</option>)}</Selecteur></span>
                            → on continue ; sinon →
                            <span className="w-56"><Selecteur value={e.sinonVers ?? ""} onChange={(ev) => majEtape(e.id, () => ({ ...e, sinonVers: ev.target.value || null }))}><option value="">l'étape suivante</option>{c.etapes.map((x, j) => (j > i ? <option key={x.id} value={x.id}>étape {j + 1} · {LIBELLE_ETAPE[x.type]}</option> : null))}</Selecteur></span>
                          </div>
                        ) : e.type === "appel" ? (
                          <label className="block space-y-1"><Etiquette>La consigne, affichée sur la fiche dans la session</Etiquette><Zone rows={2} value={e.consigne} onChange={(ev) => majEtape(e.id, () => ({ ...e, consigne: ev.target.value }))} /></label>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {i < c.etapes.length - 1 ? <ArrowDown size={12} className="mx-auto my-0.5 text-encre-3" /> : null}
                </li>) })}
            </ol>
            <div className="relative mt-3">
              <Bouton icone={<Plus />} onClick={() => setPalette((x) => !x)}>Ajouter une étape</Bouton>
              {palette ? (
                <div className="absolute left-0 top-[calc(100%+6px)] z-20 grid w-[540px] grid-cols-2 gap-1 rounded-4 border-[0.5px] border-trait bg-fond p-2 shadow-flottante">
                  {(Object.keys(AIDE) as Etape["type"][]).filter((t) => t !== "fin").map((t) => { const I = ICONE[t]; return <button key={t} type="button" onClick={() => ajouter(t)} className="flex items-start gap-2 rounded-3 px-2 py-2 text-left hover:bg-fond-3"><I size={14} className="mt-0.5 shrink-0" /><span><span className="block text-legende font-medium">{LIBELLE_ETAPE[t]}</span><span className="block text-colonne text-encre-2">{AIDE[t]}</span></span></button> })}
                </div>
              ) : null}
            </div>
          </Bloc>
        </div>

        <aside className="space-y-6">
          <Bloc titre="Devient un lead quand…">
            <ul className="mt-3 space-y-2 text-legende">{(Object.keys(LIBELLE_SIGNAL) as Signal[]).map((s) => <li key={s}><label className="flex items-center gap-2"><input type="checkbox" className="accent-[var(--color-action)]" checked={c.signaux.includes(s)} onChange={() => setC({ ...c, signaux: c.signaux.includes(s) ? c.signaux.filter((x) => x !== s) : [...c.signaux, s] })} />{LIBELLE_SIGNAL[s]}{s === "clic_lien_principal" && base ? ` (« ${base.liens[0]?.libelle} »)` : ""}</label></li>)}</ul>
            <p className="mt-2 text-colonne text-encre-2">Le lead sort de la séquence et arrive dans la session de call de l'équipe de la base.</p>
          </Bloc>
          <Bloc titre="La base décide"><dl className="mt-3 space-y-2 text-legende"><div><dt className="text-colonne text-encre-2">Équipe</dt><dd>{v.etat.equipes.find((q) => q.id === base?.equipeId)?.nom}</dd></div><div><dt className="text-colonne text-encre-2">Gagné quand</dt><dd>{base?.gagne}</dd></div><div><dt className="text-colonne text-encre-2">Liens suivis</dt><dd>{base?.liens.map((l) => l.libelle).join(" · ")}</dd></div></dl></Bloc>
          <Bloc titre="Mode test" droite={c.modeTest ? <span className="text-colonne text-attention">actif</span> : <span className="text-colonne text-encre-2">envois réels</span>}>
            <label className="mt-3 flex items-center gap-2 text-legende"><input type="checkbox" className="accent-[var(--color-action)]" checked={Boolean(c.modeTest)} onChange={(e) => setC({ ...c, modeTest: e.target.checked })} />Tout envoyer à moi, pas aux contacts</label>
            {c.modeTest ? <div className="mt-2 space-y-2"><Champ value={c.testEmail ?? ""} onChange={(e) => setC({ ...c, testEmail: e.target.value })} placeholder="Adresse de test" /><Champ value={c.testMobile ?? ""} onChange={(e) => setC({ ...c, testMobile: e.target.value })} placeholder="Mobile de test (pour les SMS)" /></div> : null}
            <p className="mt-2 text-colonne text-encre-2">En test, la campagne tourne pour de vrai (entrées, étapes, délais) mais chaque message part vers ces coordonnées, avec « [TEST] » devant l'objet.</p>
          </Bloc>
          <Bloc titre="Coûts"><label className="mt-3 flex items-center gap-2 text-legende">Un SMS coûte <Champ type="number" step="0.01" min={0} value={c.coutSms} onChange={(e) => setC({ ...c, coutSms: Number(e.target.value) })} className="w-20" /> €</label></Bloc>
          {sansContenu ? <p className="text-colonne text-attention">Un message est encore vide : la campagne ne peut pas être lancée.</p> : null}
        </aside>
      </div>
    </div>
  )
}
