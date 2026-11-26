// Un message du fil, présenté comme un client mail (STC Bâtiment, OSMessagesTabV2) — jamais en bulles.
// Le rond : noir « STC » pour nos envois, bleu clair aux initiales pour ce qui arrive.
// Replié = une ligne (le rond, l'expéditeur, l'extrait, la date) ; déplié = l'en-tête, le corps, les pièces jointes.
import { ouvrirApresAttente } from "../../lib/ouvrirOnglet"
import { useState } from "react"
import { ChevronDown, ChevronRight, FileText, Forward, Image as ImageIcon, Loader2, Reply } from "lucide-react"
import { lienPieceJointe, type Message } from "../../lib/messagesDb"
import { apercuTexte, extraireAdresse, nomCorrespondant } from "../../lib/messagesUtils"
import { objetNormalise } from "../../lib/conversations"
import { formatTaille } from "../../lib/stockage"
import { dateDuFil, initiales } from "./outils"

function natureDu(m: Pick<Message, "a" | "de" | "sens" | "nonRemisLe" | "nonRemisMotif">): string {
  if (m.a === "LinkedIn" || m.de === "LinkedIn") return m.sens === "entrant" ? "Message LinkedIn reçu" : "Message LinkedIn envoyé"
  // Un rebond (26/11/2026) : l'écran ne dit plus « E-mail envoyé » pour un mail qui n'est jamais arrivé.
  if (m.sens === "sortant" && m.nonRemisLe) return `E-mail non remis${m.nonRemisMotif ? ` : ${m.nonRemisMotif}` : ""}`
  return m.sens === "entrant" ? "E-mail reçu" : "E-mail envoyé"
}

export default function MessageDuFil({ m, ouvert, objetDuFil, onToggle, onRepondre, onTransferer }: {
  m: Message; ouvert: boolean; objetDuFil: string; onToggle: () => void
  /** Répondre à CE message, le transférer (26/11/2026 : avant, toujours le dernier de la conversation). */
  onRepondre?: () => void; onTransferer?: () => void
}) {
  const [pjEnCours, setPjEnCours] = useState("")
  const sortant = m.sens === "sortant"
  const nom = nomCorrespondant(m.de) || m.de
  const adresse = extraireAdresse(m.de)
  const date = dateDuFil(m.date)
  const rond = (
    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${sortant ? "bg-[#111113] text-white" : "bg-[#EAF1FD] text-[#2F6FE0]"}`}>
      {sortant ? "STC" : initiales(nom)}
    </div>
  )

  async function ouvrirPiece(chemin: string) {
    setPjEnCours(chemin)
    try {
      await ouvrirApresAttente(() => lienPieceJointe(chemin))
    } catch (e) {
      alert("Téléchargement impossible : " + (e instanceof Error ? e.message : e))
    } finally {
      setPjEnCours("")
    }
  }

  if (!ouvert) {
    return (
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 border-b-[0.5px] border-[#E6E6EA] py-[11px] text-left hover:bg-[#FAFAFB]">
        {rond}
        <span className="w-[210px] shrink-0 truncate font-semibold">{nom}</span>
        {sortant && m.nonRemisLe && <span className="shrink-0 text-[11px] font-semibold text-[#C9302C]">non remis</span>}
        <span className="min-w-0 flex-1 truncate text-[#6B6B70]">{apercuTexte(m.corpsText || "", 140) || m.objet || "(sans objet)"}</span>
        <span className="shrink-0 text-[11px] text-[#8E8E93]">{date}</span>
        <ChevronRight className="h-[13px] w-[13px] shrink-0 text-[#8E8E93]" strokeWidth={1.7} />
      </button>
    )
  }

  return (
    <article className="border-b-[0.5px] border-[#E6E6EA] pb-[18px] pt-4">
      <div className="flex cursor-pointer items-start gap-3" onClick={onToggle}>
        {rond}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span className="shrink-0 font-semibold">{nom}</span>
            {adresse && adresse !== nom && <span className="hidden truncate text-[#6B6B70] sm:inline">&lt;{adresse}&gt;</span>}
            {sortant && (m.nonRemisLe
              ? <span className="shrink-0 text-[11px] font-semibold text-[#C9302C]">non remis</span>
              : <span className="shrink-0 text-[11px] text-[#8E8E93]">envoyé</span>)}
          </div>
          {m.a && <p className="mt-0.5 break-all text-[11px] text-[#8E8E93]">à {m.a}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[11px] text-[#8E8E93]">{date}</span>
          <ChevronDown className="h-[13px] w-[13px] text-[#8E8E93]" strokeWidth={1.7} />
        </div>
      </div>

      <div className="ml-10 mt-3.5">
        {/* L'objet : seulement s'il s'écarte de celui du fil, affiché en tête. */}
        {objetNormalise(m.objet) !== objetNormalise(objetDuFil) && <p className="mb-2 font-semibold">{m.objet || "(sans objet)"}</p>}
        {m.corpsText ? (
          <pre className="whitespace-pre-wrap font-sans text-[13px] leading-[1.65] text-[#111113]">{m.corpsText}</pre>
        ) : m.corpsHtml ? (
          <iframe
            title="Contenu du message"
            // allow-same-origin (SANS allow-scripts) : aucun script ne s'exécute,
            // mais on peut mesurer la hauteur du contenu pour tout afficher.
            sandbox="allow-same-origin"
            srcDoc={m.corpsHtml}
            onLoad={(e) => {
              const f = e.currentTarget
              try {
                const h = f.contentWindow?.document.body?.scrollHeight
                if (h) f.style.height = h + 24 + "px"
              } catch {
                /* mesure impossible : on garde la hauteur par défaut */
              }
            }}
            style={{ height: "300px" }}
            className="w-full border-0 bg-white"
          />
        ) : (
          <p className="italic text-[#8E8E93]">(message vide)</p>
        )}

        {m.piecesJointes.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {m.piecesJointes.map((pj, i) => pj.nonGardee || !pj.chemin ? (
              // Une pièce reçue mais pas gardée (trop lourde, refusée…) : on le dit, on ne la cache plus.
              <span key={`perdue-${i}`} title={`Pièce non reçue : ${pj.nonGardee || "fichier absent"}. Demandez-la à nouveau à l'expéditeur.`}
                className="inline-flex h-[26px] max-w-[320px] items-center gap-1.5 rounded-full border-[0.5px] border-dashed border-[#C9302C]/50 bg-[#C9302C]/[0.04] px-2.5 text-[11px] text-[#C9302C]">
                <FileText className="h-[13px] w-[13px] shrink-0" strokeWidth={1.7} />
                <span className="truncate">{pj.nom}</span>
                <span className="shrink-0">non reçue{pj.nonGardee ? ` : ${pj.nonGardee}` : ""}</span>
              </span>
            ) : (
              <button key={pj.chemin} type="button" disabled={pjEnCours === pj.chemin} onClick={() => ouvrirPiece(pj.chemin)} title="Ouvrir la pièce jointe"
                className="inline-flex h-[26px] max-w-[260px] items-center gap-1.5 rounded-full border-[0.5px] border-[#E4E4E7] bg-white px-2.5 text-[11px] text-[#111113] hover:bg-[#FAFAFB] disabled:opacity-50">
                {pjEnCours === pj.chemin
                  ? <Loader2 className="h-[13px] w-[13px] shrink-0 animate-spin" />
                  : (pj.type || "").startsWith("image/")
                    ? <ImageIcon className="h-[13px] w-[13px] shrink-0 text-[#6B6B70]" strokeWidth={1.7} />
                    : <FileText className="h-[13px] w-[13px] shrink-0 text-[#C9302C]" strokeWidth={1.7} />}
                <span className="truncate">{pj.nom}</span>
                {pj.taille > 0 && <span className="shrink-0 text-[#8E8E93]">{formatTaille(pj.taille)}</span>}
              </button>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-[#8E8E93]">
          <span className={sortant && m.nonRemisLe ? "font-semibold text-[#C9302C]" : ""}>{natureDu(m)}</span>
          <span className="flex-1" />
          {onRepondre && (
            <button type="button" onClick={onRepondre} className="inline-flex items-center gap-1 text-[#3C3C40] hover:text-[#111113] hover:underline">
              <Reply className="h-[12px] w-[12px]" strokeWidth={1.8} />Répondre
            </button>
          )}
          {onTransferer && (
            <button type="button" onClick={onTransferer} className="inline-flex items-center gap-1 text-[#3C3C40] hover:text-[#111113] hover:underline">
              <Forward className="h-[12px] w-[12px]" strokeWidth={1.8} />Transférer
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
