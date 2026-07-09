import { useEffect, useRef } from "react"
import { Bold, Italic, Underline, Link as LinkIcon, Image as ImageIcon } from "lucide-react"

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
  // Dernière position du curseur DANS l'éditeur. On la mémorise en continu, car une
  // boîte de dialogue (choix de fichier) ou une invite (lien) fait perdre le curseur.
  const rangeRef = useRef<Range | null>(null)

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = valeurInitiale || ""
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function maj() {
    if (ref.current) onChange(ref.current.innerHTML)
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
    if (file.size > 1_500_000) {
      alert("Image trop lourde (max ~1,5 Mo). Utilisez un logo plus léger.")
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      // On restaure le curseur mémorisé AVANT l'ouverture de la boîte de fichier,
      // sinon l'image s'insérerait « dans le vide ».
      insererHtml(`<img src="${reader.result}" style="max-width:220px;height:auto;" />`)
    }
    reader.readAsDataURL(file)
  }

  // Au collage : si une image est dans le presse-papier, on l'intègre.
  function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const items = e.clipboardData?.items
    if (!items) return
    for (const it of items) {
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
    // sinon : collage normal (texte/HTML avec mise en forme et images hébergées conservés)
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
    </div>
  )
}
