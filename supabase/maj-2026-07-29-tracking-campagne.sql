-- Tracking campagne partenaires : distinguer le clic « barème » du clic « candidature »,
-- pour identifier les intéressés (a vu le barème / a cliqué candidater sans déposer).

-- 1) La destination du clic (candidature | bareme). Défaut = candidature (rétrocompat
--    des clics déjà enregistrés via l'ancien lien unique).
alter table public.st_clics
  add column if not exists destination text not null default 'candidature';

-- 2) Drapeaux datés sur le sous-traitant (posés par la fonction lien-st).
alter table public.st_sous_traitants
  add column if not exists bareme_vu_le        timestamptz,
  add column if not exists candidature_clic_le timestamptz;
