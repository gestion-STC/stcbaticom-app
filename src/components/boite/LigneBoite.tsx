// Une rangée de la liste, comme la boîte de réception de STC Bâtiment (11/11/2026) :
// le contact, sa source, l'objet (en gras si non lu), la date et le nombre de messages.
// Un NON-LU se voit à sa ligne entière sur fond bleu très léger et à son objet en gras.
// Au survol, l'action « lu / non lu » prend la place de la date (STC y met l'archivage).
import { FileText, Image as ImageIcon, Mail, MailOpen, MessageSquare } from "lucide-react"
import type { Message } from "../../lib/messagesDb"
import type { Conversation } from "../../lib/conversations"
import { apercuTexte, dateCourte, nomCorrespondant } from "../../lib/messagesUtils"
import { formatTaille } from "../../lib/stockage"
import { OUTIL } from "../agenda/dessinBureau"
import { ancienneteCourte, dernierTrie, etiquetteTri, sourceDe } from "./outils"

export const COLONNES = "grid-cols-[170px_minmax(0,180px)_minmax(0,1fr)_120px]"

export function EnTeteColonnes() {
  return (
    <div className={`grid ${COLONNES} gap-3.5 px-2 pb-2 pt-3 text-[11px] text-[#8E8E93]`}>
      <span>Contact</span>
      <span>Source</span>
      <span>Objet</span>
      <span className="text-right">Date</span>
    </div>
  )
}

export default function LigneBoite({ c, nom, onOuvrir, onBasculerLu }: { c: Conversation<Message>; nom: string; onOuvrir: () => void; onBasculerLu: () => void }) {
  const nonLu = c.nonLus > 0
  const apercu = apercuTexte(c.dernier.corpsText || "", 110)
  const tri = etiquetteTri(dernierTrie(c))
  // La personne derrière l'agence ou l'artisan, quand elle a écrit sous son nom.
  const recu = [...c.messages].reverse().find((m) => m.sens === "entrant")
  const personne = recu ? nomCorrespondant(recu.de) : ""
  const pieces = c.messages.flatMap((m) => m.piecesJointes)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOuvrir}
      onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) onOuvrir() }}
      title={nonLu ? "Nouveau message" : undefined}
      data-non-lu={nonLu || undefined}
      className={`group grid cursor-pointer ${COLONNES} items-center gap-3.5 border-b-[0.5px] border-[#E6E6EA] px-2 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-[#2F6FE0]/30 ${nonLu ? "bg-[#EEF4FD] hover:bg-[#E5EEFB]" : "hover:bg-[#FAFAFB]"}`}
    >
      {/* Le contact : l'agence ou l'artisan, la nature du fil, la personne dessous. */}
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={`truncate ${nonLu ? "font-semibold" : ""}`}>{nom}</span>
          {!c.aRecu ? (
            <span className="shrink-0 text-[11px] text-[#8E8E93]">Envoyé</span>
          ) : c.aEnvoye ? (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#1F8A4C]" title="Réponse reçue" />
          ) : (
            <Mail className="h-[13px] w-[13px] shrink-0 text-[#2F6FE0]" strokeWidth={1.7} aria-label="Boîte de réception" />
          )}
        </div>
        {personne && personne !== nom && <p className="mt-0.5 truncate text-[11px] text-[#8E8E93]">{personne}</p>}
      </div>
      <span className="block truncate text-[#6B6B70]">{sourceDe(c)}</span>
      {/* L'objet, puis l'aperçu en gris ; le tri de l'IA dessous ; les pièces jointes en puces. */}
      <div className="min-w-0">
        <span className="block truncate">
          <span className={nonLu ? "font-semibold" : ""}>{c.objet || "(sans objet)"}</span>
          {apercu && <span className="text-[#8E8E93]"> — {apercu}</span>}
        </span>
        {tri && (
          <span className="mt-1 inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] text-[#6B6B70]">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tri.couleur }} />
            {tri.libelle}
          </span>
        )}
        {/* On n'en montre que CINQ, le compte total reste lisible au bout (STC). */}
        {pieces.length > 0 && (
          <div className="mt-[5px] flex flex-wrap items-center gap-1">
            {pieces.slice(0, 5).map((p, i) => (
              <span key={`${p.chemin}-${i}`} title={`${p.nom}${p.taille ? ` · ${formatTaille(p.taille)}` : ""}`}
                className="inline-flex max-w-[190px] items-center gap-1 rounded-[6px] border-[0.5px] border-[#E4E4E7] bg-white px-1.5 py-px text-[11px] text-[#6B6B70]">
                {(p.type || "").startsWith("image/")
                  ? <ImageIcon className="h-[11px] w-[11px] shrink-0 text-[#6B6B70]" strokeWidth={1.8} />
                  : <FileText className="h-[11px] w-[11px] shrink-0 text-[#C9302C]" strokeWidth={1.8} />}
                <span className="truncate">{p.nom}</span>
              </span>
            ))}
            {pieces.length > 5 && (
              <span className="inline-flex items-center rounded-[6px] border-[0.5px] border-dashed border-[#D4D4D8] px-1.5 py-px text-[11px] text-[#6B6B70]" title={`${pieces.length} pièces jointes en tout`}>
                +{pieces.length - 5}
              </span>
            )}
          </div>
        )}
      </div>
      {/* La date et le nombre de messages ; au survol, « lu / non lu ». */}
      <div className="flex justify-end">
        <div className={`text-right ${c.aRecu ? "group-focus-within:hidden group-hover:hidden" : ""}`}>
          <div className="flex items-center justify-end gap-1.5 whitespace-nowrap tabular-nums">
            <span>{dateCourte(c.dernier.date)}</span>
            <span className="inline-flex items-center gap-[3px] text-[11px] text-[#2F6FE0]" title={`${c.messages.length} message(s)${nonLu ? " (non lu)" : ""}`}>
              <MessageSquare className="h-[11px] w-[11px]" strokeWidth={1.8} />
              {c.messages.length}
            </span>
          </div>
          <p className="text-[11px] text-[#8E8E93]">{ancienneteCourte(c.dernier.date)}</p>
        </div>
        {c.aRecu && (
          <div className="hidden group-focus-within:flex group-hover:flex">
            <button type="button" className={OUTIL} title={nonLu ? "Marquer comme lu" : "Marquer comme non lu"} aria-label={nonLu ? "Marquer comme lu" : "Marquer comme non lu"}
              onClick={(e) => { e.stopPropagation(); onBasculerLu() }}>
              {nonLu ? <MailOpen className="h-[15px] w-[15px]" strokeWidth={1.7} /> : <Mail className="h-[15px] w-[15px]" strokeWidth={1.7} />}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
