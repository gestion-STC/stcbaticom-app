import { useEffect, useRef, useState } from "react"
import { Bold, Italic, Underline, Link as LinkIcon, Image as ImageIcon, Loader2 } from "lucide-react"
import {
  nettoyerHtmlSignature,
  sortImage,
  messageApresCollage,
  imageTropLourde,
  POIDS_MAX_IMAGE,
} from "../lib/signatureCollage"
import { balisesLogoSignature, avertissementImagesIntegrees } from "../lib/signatureLogo"

// Éditeur de signature "à la Gmail" : zone de saisie riche.
// On colle sa signature (mise en forme + image conservées), elle est stockée en HTML.
export default function SignatureEditor({
  valeurInitiale,
  onChange,
}: {
  valeurInitiale: string
  onChange: (html: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const fichierRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [rapatriement, setRapatriement] = useState(false)
  const [nbCassees, setNbCassees] = useState(0)
  const [avertissement, setAvertissement] = useState<string | null>(null)
  // Dernière position du curseur DANS l'éditeur. On la mémorise en continu, car une
  // boîte de dialogue (choix de fichier) ou une invite (lien) fait perdre le curseur.
  const rangeRef = useRef<Range | null>(null)

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = valeurInitiale || ""
    setAvertissement(avertissementImagesIntegrees(valeurInitiale || ""))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function maj() {
    // `data-cassee` est un repère interne à l'éditeur : il n'a rien à faire dans
    // la signature enregistrée, ni dans les emails envoyés.
    if (!ref.current) return
    const html = ref.current.innerHTML.replace(/\sdata-cassee="[^"]*"/g, "")
    setAvertissement(avertissementImagesIntegrees(html))
    onChange(html)
  }

  // Insère le logo STC hébergé sur le site : c'est la seule forme qui survive
  // à l'envoi, les messageries bloquant les images intégrées.
  //
  // S'il y a déjà une image à remplacer — cassée, ou intégrée donc condamnée à
  // l'être — le logo prend sa place EXACTE : la mise en page est préservée.
  function insererLogoHeberge() {
    const aRemplacer =
      ref.current?.querySelector<HTMLImageElement>("img[data-cassee]") ??
      ref.current?.querySelector<HTMLImageElement>('img[src^="data:"]')
    if (aRemplacer) {
      aRemplacer.outerHTML = balisesLogoSignature()
      setNbCassees(ref.current?.querySelectorAll("img[data-cassee]").length ?? 0)
      setMessage(null)
      maj()
      return
    }
    insererHtml(balisesLogoSignature())
  }

  // Mémorise le curseur s'il est bien à l'intérieur de l'éditeur.
  function sauverSelection() {
    const sel = window.getSelection()
    if (sel && sel.rangeCount && ref.current?.contains(sel.anchorNode)) {
      rangeRef.current = sel.getRangeAt(0).cloneRange()
    }
  }

  // Place le curseur à la fin de l'éditeur (repli quand aucune position n'est mémorisée).
  function caretFin() {
    const el = ref.current
    if (!el) return
    el.focus()
    const sel = window.getSelection()
    const r = document.createRange()
    r.selectNodeContents(el)
    r.collapse(false)
    sel?.removeAllRanges()
    sel?.addRange(r)
  }

  // Redonne le focus + restaure la position mémorisée (ou fin de zone à défaut).
  function restaurerSelection() {
    const el = ref.current
    if (!el) return
    el.focus()
    const r = rangeRef.current
    if (r && el.contains(r.commonAncestorContainer)) {
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(r)
    } else {
      caretFin()
    }
  }

  // Insère du HTML à la position mémorisée du curseur.
  function insererHtml(html: string) {
    restaurerSelection()
    document.execCommand("insertHTML", false, html)
    maj()
    sauverSelection()
  }

  // Commande de mise en forme (gras/italique/souligné) sur la sélection courante.
  function commande(cmd: string) {
    ref.current?.focus()
    document.execCommand(cmd)
    maj()
    sauverSelection()
  }

  function ajouterLien() {
    sauverSelection()
    const url = prompt("Adresse du lien (https://…)")
    if (!url) return
    const sel = window.getSelection()
    const texteSelectionne = sel && !sel.isCollapsed ? sel.toString() : ""
    restaurerSelection()
    if (texteSelectionne) {
      // Du texte est sélectionné → on le transforme en lien.
      document.execCommand("createLink", false, url)
      maj()
    } else {
      // Rien de sélectionné → on insère l'adresse comme lien cliquable.
      insererHtml(`<a href="${url}">${url}</a>`)
    }
  }

  // Intègre une image (fichier) sous forme de data URL, pour qu'elle persiste.
  function insererImage(file: File) {
    if (!file.type.startsWith("image/")) return
    if (file.size > POIDS_MAX_IMAGE) {
      setMessage("Image trop lourde (max ~1,5 Mo). Utilise un logo plus léger.")
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      // S'il y a une image cassée (adresse venue du logiciel de mail), on la
      // REMPLACE : le logo reprend sa place exacte dans la mise en page, au lieu
      // de s'ajouter à côté d'une icône d'image brisée.
      const cassee = ref.current?.querySelector<HTMLImageElement>("img[data-cassee]")
      if (cassee) {
        cassee.setAttribute("src", String(reader.result))
        delete cassee.dataset.cassee
        cassee.style.maxWidth = cassee.style.maxWidth || "220px"
        cassee.style.height = "auto"
        setNbCassees(ref.current?.querySelectorAll("img[data-cassee]").length ?? 0)
        setMessage(null)
        maj()
        return
      }
      // Sinon : insertion au curseur mémorisé AVANT l'ouverture de la boîte de
      // fichier, sinon l'image s'insérerait « dans le vide ».
      insererHtml(`<img src="${reader.result}" style="max-width:220px;height:auto;" />`)
    }
    reader.readAsDataURL(file)
  }

  // Rapatrie une image distante dans la signature (data URL), pour qu'elle survive
  // à la disparition du site qui l'héberge. Rend null si le site refuse la copie
  // (protection CORS) — fréquent, et sans gravité : l'image reste affichée par son
  // adresse d'origine.
  async function rapatrier(src: string): Promise<string | null> {
    try {
      const rep = await fetch(src, { mode: "cors" })
      if (!rep.ok) return null
      const blob = await rep.blob()
      if (!blob.type.startsWith("image/")) return null
      if (blob.size > POIDS_MAX_IMAGE) return null
      const dataUrl = await new Promise<string>((ok, ko) => {
        const r = new FileReader()
        r.onload = () => ok(String(r.result))
        r.onerror = () => ko(r.error)
        r.readAsDataURL(blob)
      })
      return imageTropLourde(dataUrl) ? null : dataUrl
    } catch {
      return null
    }
  }

  // L'adresse mène-t-elle vraiment à une image AFFICHABLE depuis ici ?
  // On ne le suppose pas : beaucoup d'adresses de signature ne fonctionnent que
  // dans la boîte mail de leur propriétaire, et afficheraient une image cassée.
  function imageAffichable(src: string): Promise<boolean> {
    return new Promise((ok) => {
      if (!src) return ok(false)
      const img = new Image()
      const fini = (v: boolean) => ok(v)
      img.onload = () => fini(img.naturalWidth > 0)
      img.onerror = () => fini(false)
      img.src = src
      // Sécurité : ni onload ni onerror ne se déclenchent parfois.
      setTimeout(() => fini(false), 8000)
    })
  }

  // Parcourt les images de l'éditeur : rapatrie ce qui peut l'être, puis vérifie
  // ce que le reste donne réellement à l'écran.
  async function integrerImagesDistantes() {
    const el = ref.current
    if (!el) return
    const imgs = [...el.querySelectorAll("img")]
    if (!imgs.length) return

    setRapatriement(true)
    let reussies = 0
    const restantes: HTMLImageElement[] = []

    for (const img of imgs) {
      const src = img.getAttribute("src") || ""
      if (sortImage(src) === "integree") continue
      if (sortImage(src) === "distante") {
        const dataUrl = await rapatrier(src)
        if (dataUrl) {
          img.setAttribute("src", dataUrl)
          reussies++
          continue
        }
      }
      restantes.push(img)
    }

    // Ce qui n'a pas pu être rapatrié : s'affiche-t-il au moins ?
    let affichables = 0
    let cassees = 0
    for (const img of restantes) {
      if (await imageAffichable(img.getAttribute("src") || "")) affichables++
      else {
        cassees++
        img.dataset.cassee = "1" // repéré pour le bouton « retirer »
      }
    }
    setRapatriement(false)

    // Une signature d'email ne doit pas déborder de la largeur du message.
    for (const img of imgs) {
      if (!img.style.maxWidth) img.style.maxWidth = "220px"
      if (!img.style.height) img.style.height = "auto"
    }

    setNbCassees(cassees)
    maj()
    setMessage(messageApresCollage({ reussies, affichables, cassees }))
  }

  // Retire les images qui ne s'afficheront jamais : mieux vaut une signature sans
  // logo qu'une signature avec une icône d'image cassée.
  function retirerImagesCassees() {
    const el = ref.current
    if (!el) return
    el.querySelectorAll("img[data-cassee]").forEach((i) => i.remove())
    setNbCassees(0)
    setMessage(null)
    maj()
    caretFin()
  }

  // Au collage : d'abord le cas d'une image seule dans le presse-papier, puis le cas
  // d'une signature complète copiée depuis un logiciel de mail.
  function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const dt = e.clipboardData
    if (!dt) return
    setMessage(null)

    for (const it of dt.items) {
      if (it.kind === "file" && it.type.startsWith("image/")) {
        const file = it.getAsFile()
        if (file) {
          e.preventDefault()
          sauverSelection()
          insererImage(file)
          return
        }
      }
    }

    // Signature copiée depuis Outlook / Gmail : on nettoie AVANT d'insérer.
    // Sans ce ménage, un bloc <style> collé s'applique à tout le logiciel.
    const html = dt.getData("text/html")
    if (html) {
      e.preventDefault()
      sauverSelection()
      insererHtml(nettoyerHtmlSignature(html))
      void integrerImagesDistantes()
      return
    }

    // Texte simple : collage normal.
    requestAnimationFrame(() => {
      maj()
      sauverSelection()
    })
  }

  const Btn = ({
    onClick,
    children,
    label,
  }: {
    onClick: () => void
    children: React.ReactNode
    label: string
  }) => (
    <button
      type="button"
      aria-label={label}
      // preventDefault : garde le curseur dans l'éditeur pendant le clic sur l'outil.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
    >
      {children}
    </button>
  )

  return (
    <div className="rounded-lg border border-slate-200">
      <div className="flex items-center gap-0.5 border-b border-slate-200 px-1.5 py-1">
        <Btn onClick={() => commande("bold")} label="Gras">
          <Bold size={15} />
        </Btn>
        <Btn onClick={() => commande("italic")} label="Italique">
          <Italic size={15} />
        </Btn>
        <Btn onClick={() => commande("underline")} label="Souligné">
          <Underline size={15} />
        </Btn>
        <Btn onClick={ajouterLien} label="Lien">
          <LinkIcon size={15} />
        </Btn>
        <Btn
          onClick={() => {
            sauverSelection() // mémorise le curseur AVANT d'ouvrir la boîte de fichier
            fichierRef.current?.click()
          }}
          label="Insérer une image"
        >
          <ImageIcon size={15} />
        </Btn>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={insererLogoHeberge}
          title="Insérer le logo STC (hébergé : il s'affichera dans les emails reçus)"
          className="ml-1 rounded-md px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50"
        >
          Logo STC
        </button>
        <input
          ref={fichierRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ""
            if (f) insererImage(f)
          }}
        />
      </div>
      <div
        ref={ref}
        contentEditable
        onInput={maj}
        onPaste={onPaste}
        onKeyUp={sauverSelection}
        onMouseUp={sauverSelection}
        suppressContentEditableWarning
        data-placeholder="Collez ici votre signature (logo, nom, téléphone, lien…)"
        className="signature-edit min-h-28 px-3 py-2 text-sm text-slate-700 outline-none"
      />

      {avertissement && !rapatriement && (
        <div className="border-t border-slate-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          <p>{avertissement}</p>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={insererLogoHeberge}
            className="mt-2 rounded-md bg-red-700 px-2.5 py-1 font-medium text-white hover:bg-red-800"
          >
            Remplacer par le logo hébergé
          </button>
        </div>
      )}

      {rapatriement && (
        <div className="flex items-center gap-2 border-t border-slate-200 px-3 py-2 text-xs text-slate-500">
          <Loader2 size={13} className="animate-spin" />
          Intégration des images à la signature…
        </div>
      )}

      {message && !rapatriement && (
        <div className="border-t border-slate-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <div className="flex items-start justify-between gap-2">
            <span>{message}</span>
            <button
              type="button"
              onClick={() => setMessage(null)}
              className="shrink-0 font-medium underline"
            >
              fermer
            </button>
          </div>
          {nbCassees > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  sauverSelection()
                  fichierRef.current?.click()
                }}
                className="rounded-md bg-amber-700 px-2.5 py-1 font-medium text-white hover:bg-amber-800"
              >
                Choisir le fichier du logo
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={retirerImagesCassees}
                className="rounded-md border border-amber-700 px-2.5 py-1 font-medium text-amber-800 hover:bg-amber-100"
              >
                Retirer l'image cassée
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
