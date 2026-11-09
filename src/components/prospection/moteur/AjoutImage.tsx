// Ajouter une image à un mail (09/11/2026) : réduite pour rester légère, puis mise en ligne pour que le mail puisse l'afficher.
import { useRef, useState } from "react"
import { ImagePlus } from "lucide-react"
import { Bouton } from "../../../ui"
import { televerser } from "../../../lib/stockage"

const LARGEUR = 600
const POIDS_VISE = 50 * 1024 // Instantly conseille de rester sous 30 à 50 Ko

async function reduire(fichier: File): Promise<File> {
  const image = await createImageBitmap(fichier)
  const echelle = Math.min(1, LARGEUR / image.width)
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(image.width * echelle); canvas.height = Math.round(image.height * echelle)
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Image illisible.")
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  let blob: Blob | null = null
  for (const qualite of [0.8, 0.7, 0.6, 0.5, 0.4]) {
    blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", qualite))
    if (blob && blob.size <= POIDS_VISE) break
  }
  if (!blob) throw new Error("Image illisible.")
  return new File([blob], `${fichier.name.replace(/\.[^.]+$/, "") || "image"}.jpg`, { type: "image/jpeg" })
}

export default function AjoutImage({ onImage }: { onImage: (url: string) => void }) {
  const entree = useRef<HTMLInputElement>(null)
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState("")
  const choisi = (f?: File) => {
    if (!f) return
    setOccupe(true); setErreur("")
    reduire(f).then(televerser).then((p) => onImage(p.url)).catch((e) => setErreur(e instanceof Error ? e.message : String(e))).finally(() => { setOccupe(false); if (entree.current) entree.current.value = "" })
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input ref={entree} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label="Choisir une image" onChange={(e) => choisi(e.target.files?.[0])} />
      <Bouton taille="sm" icone={<ImagePlus />} chargement={occupe} onClick={() => entree.current?.click()}>Ajouter une image</Bouton>
      <span className="text-colonne text-encre-2">Elle s'ajoute à la fin du texte, sous forme de code : tu peux déplacer ce code. À éviter dans le premier mail.</span>
      {erreur ? <span className="text-colonne text-alerte">{erreur}</span> : null}
    </div>
  )
}
