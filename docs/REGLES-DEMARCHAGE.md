# Les règles du démarchage

La référence pour toute évolution (14/10/2026). Chaque règle est écrite en français, avec
**l'endroit unique** qui l'applique et **le test** qui la prouve. Si une règle change, on change
cet endroit, son test, et cette page — rien d'autre.

- Toutes les règles vivent en base, dans `supabase/regles-demarchage.sql` (le fichier collé en prod).
- Le banc d'essai `supabase/tests/regles-demarchage.test.ts` les joue dans une vraie base Postgres
  (PGlite) avant chaque mise en ligne : un test rouge bloque la publication.
- En prod, `sante_demarchage()` signale toute règle qui ne correspond plus au fichier
  (« règle modifiée ») ; l'écran Aujourd'hui l'affiche. Après une modification voulue :
  `node scripts/empreintes-regles.mjs`.
- L'écran n'applique **aucune** règle : il affiche ce que la base calcule.

## Les réglages

Un seul endroit : `reglages_demarchage()` (valeur par défaut et bornes). Modifiables dans
Réglages › Objectifs et règles ; une valeur hors bornes vaut la valeur par défaut.

| Réglage | Défaut | Ce qu'il règle |
|---|---|---|
| `repos_appel_jours` | 5 j | Une agence appelée ne revient pas avant ce délai |
| `repos_standard_jours` | 15 j | Après « standard » (l'accueil, pas le gestionnaire) |
| `relance_interesse_jours` | 10 j | Le rythme de relance d'une intéressée |
| `heure_relance` | 10 h | L'heure des relances, et proposée pour un rappel ou un RDV |
| `sommeil_apres_tentatives` | 6 | Essais sans gestionnaire avant le sommeil |
| `sommeil_jours` | 30 j | Durée du sommeil |
| `quota_appels_jour` | 100 | Appels par jour et par numéro Ringover (anti-spam) |
| `sonnerie_secondes` | 28 s | Sans décroché : « pas de réponse » proposé |
| `cadence_auto_secondes` | 5 s | Compte à rebours du mode automatique |
| `rdv_rappel_avant_minutes` / `apres` | 5 / 20 min | Fenêtre du rappel de RDV à l'écran |
| `a_completer_minutes` | 5 min | Un appel sans résultat devient « à compléter » (écran et contrôle du matin) |

Test : « les réglages : une seule source, lue par toutes les règles ».

## Qui appelle quoi

| Règle | Où | Test |
|---|---|---|
| Le **secteur** décide pour la **prospection** : une agence jamais travaillée appartient au démarcheur de son secteur | `agence_suit_son_secteur`, `attribuer_secteur` | « le secteur fait foi » |
| Une agence **travaillée** (joint, intéressée, RDV, rappel prévu, cliente) reste à **celui qui l’a travaillée**, même si le secteur change de main ; elle retourne au secteur si elle n’est plus travaillée (pas intéressée, hors cible, endormie) — Mahdi, 14/10 : « chacun ses clients » | `agence_travaillee`, `agence_proprietaire_apres`, `appel_enregistrer`, `agence_suit_qui_la_travaille` | « qui a quelle agence » |
| Chacun ne voit que **sa base** | `pile_demarchage(p_proprietaire)` | « chacun sa base » |

## Les piles (un seul calcul : `pile_demarchage`, compteurs : `compter_piles`)

| Pile | Contenu | Ordre |
|---|---|---|
| À prospecter | À prospecter ou gestionnaire joint, rien de prévu | Jamais appelées d'abord (secteur du jour en tête, enseignes d'abord), puis la plus anciennement appelée ; sans aucun numéro en dernier |
| À rappeler aujourd'hui | Un rappel ou une relance dus aujourd'hui ou en retard | Par heure |
| Intéressés | Toutes les intéressées et RDV (le portefeuille) | Relance due, puis rien de prévu, puis à venir |
| À réveiller | Endormies dont le réveil est arrivé | Réveil le plus ancien d'abord |

- Toutes retirent les agences **au repos** (sauf Intéressés) ; un même standard n'apparaît qu'une fois.
- Le compteur d'une pile **est** la longueur de sa liste. Test : « les compteurs sont EXACTEMENT la longueur des listes ».

## Le repos (`demarchage_repos`, utilisé par les piles ET la garde)

1. **Un numéro, un appel par jour**, sans exception : appelée aujourd'hui, ou son standard
   composé aujourd'hui sur une autre fiche → personne ne la recompose. Un rappel vraiment
   urgent : on copie le numéro. La case « inclure les appelées » ne lève jamais ce repos.
2. **Repos de N jours** (5) après tout appel, sur la fiche et sur toute fiche au même standard.
3. **Standard** : repos plus long (15 j).
4. Les repos 2 et 3 ne valent ni pour une agence qui a un rappel prévu aujourd'hui, ni pour
   une intéressée ou un RDV (elles ont leur relance).

Tests : « on ne tue pas les numéros », « les piles », « la pile et la garde disent la même chose ».

## La garde avant de composer (`appel_verifier`)

Refuse si : un appel lancé attend son résultat ; ce numéro a déjà été composé aujourd'hui ;
hors appel direct, agence sortie du démarchage ou au repos. « Copier le numéro » n'est jamais
bloqué. Si la garde ne répond pas (réseau), l'écran ne compose pas.

## L'appel (`appel_lancer`, `appel_enregistrer`)

- L'appel est écrit **au clic** (date, auteur, numéro) ; le résultat complète cette ligne. Un
  résultat envoyé deux fois n'écrit rien de plus.
- Un appel noté ferme le rappel du jour (et ceux en retard).
- Pas de réponse / standard : +1 tentative ; à 6 sans gestionnaire, l'agence s'endort 30 jours ;
  une endormie réveillée toujours injoignable se rendort.
- Joint : tentatives à 0, +1 joint ; intéressé → étape Intéressé + relance à 10 j ; RDV → étape
  RDV + rendez-vous ; à rappeler → tâche à la date choisie ; pas intéressé → étape + motif.
- Faux numéro → hors cible.

Test : « la matrice : chaque étape × chaque résultat d'appel » (42 cas), « le sommeil ».

## Les intéressées ne sortent jamais du cycle

Une intéressée (ou RDV) a **toujours une** relance ouverte : appel quel qu'il soit, tâche cochée
« Fait », supprimée, RDV fait, passage à la main en Intéressé → la suivante est posée à 10 j
(`appel_enregistrer`, `agences_etape_relances`, `activites_relance_continue`).
Elle sort du cycle seulement : signée (client), pas intéressée, faux numéro, apporteur.

Test : « le cycle des intéressées ne casse jamais ».

## Les sorties

Pas intéressée, hors cible, cliente, apporteur d'affaires : toutes leurs tâches sont fermées, on
ne peut pas les « remettre à faire » (`agences_etape_relances`, `tache_terminer`). Client =
premier OS daté au jour de Paris (`agence_premier_os`). Apporteur pendant un appel : l'appel est
clos « apporteur », rien d'autre à noter.

Test : « les sorties : plus aucune relance », « apporteur d'affaires pendant un appel ».

## Tout est sur la fiche

Appels, e-mails (rangés sur l'agence par l'adresse : `messages_rattacher_agence`), notes,
tâches, RDV, changements d'étape (`agences_etape_journal`), chacun avec son auteur et sa date.

Test : « chaque appel est sur la fiche, une seule fois ».

## La santé (`sante_demarchage`, affichée sur Aujourd'hui)

Chaque ligne devrait valoir 0 : intéressée sans relance, relance sur une sortie, relances en
double, tâche sur un apporteur, appel à compléter, compteurs différents de l'historique,
agence hors de son secteur, mail sans agence, endormie sans réveil, cliente sans date d'OS,
règle modifiée, déclencheur absent.

Test : « la santé de la base ».
