// ════════════════════════════════════════════════════════════════════════════
// IMPORTER DES AGENCES — un dialogue en trois temps : le fichier (glissé ou
// choisi), l'analyse (rien n'est écrit : on montre ce qui va être créé, ce qui
// est déjà là, ce qui est ignoré et pourquoi), puis l'import avec sa
// progression et le bilan. La lecture et l'écriture sont dans
// `src/demarchage/importAgences.ts`.
// ════════════════════════════════════════════════════════════════════════════
import { useRef, useState, type DragEvent } from "react"
import { FileSpreadsheet, Upload } from "lucide-react"
import { analyserFichier, contactsDe, executerImport, type Analyse, type Bilan, type LigneImport, type Progression } from "../../demarchage/importAgences"
import { libelleType } from "../../demarchage/modele"
import { Bandeau, Bouton, Chargement, Compteurs, Dialogue, Ligne, Pastille, Tableau, Td, Th, Tr } from "../../ui"

type Etape = "fichier" | "lecture" | "analyse" | "import" | "bilan"
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const pluriel = (n: number, un: string, des = un + "s") => `${n} ${n > 1 ? des : un}`
const APERCU = 10

export default function ImportAgences({ onFermer, onImporte }: { onFermer: () => void; onImporte: () => void }) {
  const [etape, setEtape] = useState<Etape>("fichier")
  const [fichier, setFichier] = useState<File | null>(null)
  const [analyse, setAnalyse] = useState<Analyse | null>(null)
  const [progression, setProgression] = useState<Progression>({ fait: 0, total: 0, enCours: "" })
  const [bilan, setBilan] = useState<Bilan | null>(null)
  const [erreur, setErreur] = useState("")
  const [survol, setSurvol] = useState(false)
  const entree = useRef<HTMLInputElement>(null)

  const choisir = async (f: File | null | undefined) => {
    if (!f) return
    setFichier(f)
    setErreur("")
    setEtape("lecture")
    try {
      setAnalyse(await analyserFichier(f))
      setEtape("analyse")
    } catch (e) {
      setErreur(message(e))
      setEtape("fichier")
    }
  }
  const deposer = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setSurvol(false)
    void choisir(e.dataTransfer.files?.[0])
  }
  const importer = async () => {
    if (!analyse) return
    setEtape("import")
    setErreur("")
    try {
      const b = await executerImport(analyse, setProgression)
      setBilan(b)
      setEtape("bilan")
      if (b.agencesCreees || b.contactsAjoutes) onImporte()
    } catch (e) {
      setErreur(message(e))
      setEtape("analyse")
    }
  }
  // Pendant l'écriture, la fenêtre ne se ferme pas : chaque agence part l'une après l'autre.
  const fermer = etape === "import" ? () => undefined : onFermer

  // ── 1. Le fichier ──
  if (etape === "fichier" || etape === "lecture") {
    return (
      <Dialogue
        titre="Importer des agences"
        description="Un fichier Excel (.xlsx) ou CSV : une ligne = une agence, avec son contact s'il y en a un. Rien n'est écrit avant que tu aies vu l'analyse."
        onFermer={fermer}
        largeur="max-w-xl"
        pied={<Bouton onClick={onFermer} disabled={etape === "lecture"}>Annuler</Bouton>}
      >
        {erreur ? <Bandeau role="alerte" className="mb-4">{erreur}</Bandeau> : null}
        {etape === "lecture" ? (
          <Chargement texte={`Lecture de « ${fichier?.name ?? ""} »…`} />
        ) : (
          <div
            onDragOver={(e) => { e.preventDefault(); setSurvol(true) }}
            onDragLeave={() => setSurvol(false)}
            onDrop={deposer}
            className={`flex flex-col items-center gap-3 rounded-6 border border-dashed px-6 py-10 text-center transition-colors ${survol ? "border-signature bg-signature-doux" : "border-trait-fort bg-fond-2"}`}
          >
            <FileSpreadsheet size={28} className="text-encre-3" />
            <p className="text-corps font-medium text-encre">Glisse ton fichier ici</p>
            <p className="max-w-sm text-legende text-encre-2">
              Avec une ligne d'en-tête (Agence, Téléphone, E-mail, Adresse, Code postal, Contact, E-mail du contact, Ligne directe, Type) ou sans :
              le téléphone, l'e-mail et le code postal sont repérés où qu'ils soient sur la ligne.
            </p>
            <Bouton variante="plein" icone={<Upload />} onClick={() => entree.current?.click()}>Choisir un fichier</Bouton>
            <input ref={entree} type="file" accept=".xlsx,.csv,.txt" className="hidden" onChange={(e) => { void choisir(e.target.files?.[0]); e.target.value = "" }} />
          </div>
        )}
      </Dialogue>
    )
  }

  // ── 3. L'import, en cours ──
  if (etape === "import") {
    const pct = progression.total ? Math.round((progression.fait / progression.total) * 100) : 0
    return (
      <Dialogue titre="Import en cours" description={fichier?.name} onFermer={fermer} largeur="max-w-xl">
        <div className="space-y-3 py-2">
          <p className="text-corps text-encre">
            <span className="chiffres font-semibold">{progression.fait} / {progression.total}</span> agences écrites
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-fond-4">
            <div className="h-full rounded-full bg-action transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="truncate text-legende text-encre-2">{progression.enCours || "…"}</p>
          <p className="text-colonne text-encre-3">Ne ferme pas cette fenêtre : chaque agence et ses contacts sont écrits l'un après l'autre.</p>
        </div>
      </Dialogue>
    )
  }

  // ── 4. Le bilan ──
  if (etape === "bilan" && bilan) {
    return (
      <Dialogue titre="Import terminé" description={fichier?.name} onFermer={onFermer} largeur="max-w-xl" pied={<Bouton variante="plein" onClick={onFermer}>Fermer</Bouton>}>
        <div className="divide-y divide-fond-4">
          <Ligne libelle="Agences créées"><span className={`chiffres font-semibold ${bilan.agencesCreees ? "text-ok" : ""}`}>{bilan.agencesCreees}</span></Ligne>
          <Ligne libelle="Contacts ajoutés"><span className="chiffres">{bilan.contactsAjoutes}</span></Ligne>
          {bilan.secteursCrees ? <Ligne libelle="Secteurs ajoutés à la liste (à renommer dans Réglages › Secteurs)"><span className="chiffres">{bilan.secteursCrees}</span></Ligne> : null}
          <Ligne libelle="Lignes en erreur"><span className={`chiffres ${bilan.erreurs.length ? "font-semibold text-alerte" : ""}`}>{bilan.erreurs.length}</span></Ligne>
        </div>
        {bilan.erreurs.length ? (
          <Tableau className="mt-4">
            <thead><tr><Th>Ligne</Th><Th>Agence</Th><Th>Erreur</Th></tr></thead>
            <tbody>
              {bilan.erreurs.slice(0, 30).map((e) => (
                <Tr key={e.ligne.numero}><Td num>{e.ligne.numero}</Td><Td>{e.ligne.nom}</Td><Td className="text-alerte">{e.message}</Td></Tr>
              ))}
            </tbody>
          </Tableau>
        ) : null}
      </Dialogue>
    )
  }

  // ── 2. L'analyse ──
  if (!analyse) return null
  const aCompleter = analyse.dejaLa.filter((d) => d.contactsAAjouter.length)
  const nContacts = analyse.aCreer.reduce((n, l) => n + contactsDe(l).length, 0) + aCompleter.reduce((n, d) => n + d.contactsAAjouter.length, 0)
  const rienAFaire = analyse.aCreer.length === 0 && aCompleter.length === 0
  return (
    <Dialogue
      titre="Ce qui va entrer dans la base"
      description={`${fichier?.name ?? ""}${analyse.feuille && analyse.feuille !== fichier?.name ? ` · onglet « ${analyse.feuille} »` : ""} · ${pluriel(analyse.total, "ligne lue", "lignes lues")}`}
      onFermer={fermer}
      largeur="max-w-3xl"
      pied={
        <>
          <Bouton onClick={() => { setAnalyse(null); setFichier(null); setEtape("fichier") }}>Changer de fichier</Bouton>
          <Bouton variante="plein" icone={<Upload />} disabled={rienAFaire} onClick={importer}>
            Importer {pluriel(analyse.aCreer.length, "agence")}{aCompleter.length ? ` + ${pluriel(aCompleter.length, "contact")}` : ""}
          </Bouton>
        </>
      }
    >
      {erreur ? <Bandeau role="alerte" className="mb-4">{erreur}</Bandeau> : null}
      <Compteurs
        valeurs={[
          { id: "creer", libelle: "À créer", valeur: analyse.aCreer.length, detail: nContacts ? pluriel(nContacts, "contact") : undefined, role: analyse.aCreer.length ? "ok" : undefined },
          { id: "deja", libelle: "Déjà là", valeur: analyse.dejaLa.length, detail: aCompleter.length ? `dont ${aCompleter.length} avec un contact à ajouter` : "rien à y changer" },
          { id: "ignorees", libelle: "Ignorées", valeur: analyse.ignorees.length, role: analyse.ignorees.length ? "alerte" : undefined },
        ]}
      />
      {rienAFaire ? <Bandeau role="attention" className="mt-4">Rien à importer : toutes les lignes sont déjà connues ou inutilisables.</Bandeau> : null}
      {analyse.secteursInconnus.length ? (
        <Bandeau role="attention" className="mt-4">
          {pluriel(analyse.secteursInconnus.length, "code postal absent", "codes postaux absents")} de la liste des secteurs ({analyse.secteursInconnus.join(", ")}) :
          ils seront ajoutés à la liste avec le code pour nom. Tu pourras les renommer dans Réglages › Secteurs.
        </Bandeau>
      ) : null}

      {analyse.aCreer.length ? (
        <Section titre="À créer" lignes={analyse.aCreer}>
          <thead><tr><Th>Ligne</Th><Th>Agence</Th><Th>Secteur</Th><Th>Téléphone</Th><Th>Contact</Th><Th>Type</Th></tr></thead>
          <tbody>
            {analyse.aCreer.slice(0, APERCU).map((l) => (
              <Tr key={l.numero}>
                <Td num>{l.numero}</Td>
                <Td className="font-medium text-encre">{l.nom}{l.enseigne ? <span className="ml-1 text-encre-2">· {l.enseigne}</span> : null}</Td>
                <Td>{l.secteur ?? <span className="text-encre-3">—</span>}</Td>
                <Td className="chiffres">{l.telephone || <span className="text-encre-3">—</span>}</Td>
                <Td>{contactsDe(l).map((c) => c.nom).join(", ") || <span className="text-encre-3">—</span>}</Td>
                <Td>{l.type === "apporteur" ? <Pastille role="info">Apporteur</Pastille> : l.type !== "agence" ? libelleType(l.type) : ""}</Td>
              </Tr>
            ))}
          </tbody>
        </Section>
      ) : null}

      {aCompleter.length ? (
        <Section titre="Déjà là, avec un contact à ajouter" lignes={aCompleter.map((d) => d.ligne)}>
          <thead><tr><Th>Ligne</Th><Th>Agence</Th><Th>Contacts à ajouter</Th></tr></thead>
          <tbody>
            {aCompleter.slice(0, APERCU).map((d) => (
              <Tr key={d.ligne.numero}><Td num>{d.ligne.numero}</Td><Td className="font-medium text-encre">{d.ligne.nom}</Td><Td>{d.contactsAAjouter.map((c) => c.nom).join(", ")}</Td></Tr>
            ))}
          </tbody>
        </Section>
      ) : null}

      {analyse.ignorees.length ? (
        <Section titre="Ignorées" lignes={analyse.ignorees.map((i) => i.ligne)} max={APERCU * 2}>
          <thead><tr><Th>Ligne</Th><Th>Agence</Th><Th>Pourquoi</Th></tr></thead>
          <tbody>
            {analyse.ignorees.slice(0, APERCU * 2).map((i) => (
              <Tr key={i.ligne.numero}><Td num>{i.ligne.numero}</Td><Td>{i.ligne.nom || <span className="text-encre-2">{i.ligne.apercu}</span>}</Td><Td className="text-encre-2">{i.raison}</Td></Tr>
            ))}
          </tbody>
        </Section>
      ) : null}
    </Dialogue>
  )
}

/** Un bloc de l'analyse : un titre, le tableau, et « et N autres » quand on n'a pas tout montré. */
function Section({ titre, lignes, max = APERCU, children }: { titre: string; lignes: LigneImport[]; max?: number; children: React.ReactNode }) {
  const reste = lignes.length - max
  return (
    <div className="mt-5">
      <h3 className="mb-2 text-legende font-semibold text-encre">{titre} <span className="chiffres font-normal text-encre-2">· {lignes.length}</span></h3>
      <Tableau>{children}</Tableau>
      {reste > 0 ? <p className="mt-1 text-colonne text-encre-2">… et {pluriel(reste, "autre ligne", "autres lignes")}.</p> : null}
    </div>
  )
}
