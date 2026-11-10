// La taille de l'audience, à droite pendant le réglage, comme chez Meta : on voit tout de suite qui on touche.
import { Bloc } from "../../demarchage/aujourdhui/courtier"

function niveau(n: number): { part: number; texte: string } {
  if (n === 0) return { part: 0, texte: "Personne ne correspond" }
  if (n < 100) return { part: 22, texte: "Audience précise" }
  if (n <= 1000) return { part: 55, texte: "Bonne taille" }
  return { part: 88, texte: "Audience large" }
}

export default function TailleAudience({ total, mails, mobiles, enAttente, parJour, unite, cible }: { total: number; mails: number; mobiles: number; enAttente: number; parJour: number; unite: string; cible: string }) {
  const j = niveau(total), jours = parJour > 0 ? Math.ceil(total / parJour) : 0, fr = (n: number) => n.toLocaleString("fr-FR")
  return (
    <Bloc titre="Taille de l'audience">
      <p className="mt-3 text-legende font-medium text-encre">{cible}</p>
      <p className="chiffres mt-2 text-h1 font-semibold text-encre">{fr(total)}</p>
      <p className="text-colonne text-encre-2">{unite} éligibles</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-fond-4"><div className="h-full rounded-full bg-action transition-all" style={{ width: `${j.part}%` }} /></div>
      <div className="mt-1 flex justify-between text-colonne text-encre-2"><span>Précise</span><span>Large</span></div>
      <p className="mt-2 text-legende font-medium text-encre">{j.texte}</p>
      <div className="mt-3 space-y-1 text-colonne text-encre-2">
        <p>{fr(mails)} avec un mail · {fr(mobiles)} avec un mobile</p>
        {total ? <p>À {fr(parJour)} par jour : environ {fr(jours)} jour{jours > 1 ? "s" : ""} d'envoi</p> : null}
        {enAttente > 0 ? <p>Pare-feu : {fr(enAttente)} déjà dans une campagne, ils attendront</p> : null}
      </div>
    </Bloc>
  )
}
