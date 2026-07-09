// Logo STCbaticom : texte fin géométrique + pastille violette sur le « m ».
// Reproduit en HTML/CSS le logo fourni (image) : net à toutes les tailles et
// déclinable en blanc sur fond sombre (prop « clair »). La taille se règle par
// la taille de police (className), la pastille suit en proportion (unités em).
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
        "font-brand relative inline-block font-light leading-none tracking-tight " +
        (clair ? "text-white " : "text-slate-950 ") +
        className
      }
    >
      <span
        aria-hidden
        className="absolute right-[-0.08em] top-[-0.34em] z-0 h-[0.66em] w-[0.66em] rounded-full bg-violet-500"
      />
      <span className="relative z-10">STCbaticom</span>
    </span>
  )
}
