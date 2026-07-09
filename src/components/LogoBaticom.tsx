// Logo STCbaticom : texte fin géométrique (Poppins 300), sans la pastille
// (retirée à la demande de Mahdi). Déclinable en blanc sur fond sombre
// (prop « clair ») ; la taille se règle par la taille de police (className).
export default function LogoBaticom({
  clair = false,
  className = "",
}: {
  clair?: boolean
  className?: string
}) {
  return (
    <span
      className={
        "font-brand inline-block font-light leading-none tracking-tight " +
        (clair ? "text-white " : "text-slate-950 ") +
        className
      }
    >
      STCbaticom
    </span>
  )
}
