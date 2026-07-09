import { createClient } from "@supabase/supabase-js"

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const cle = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Vrai si les identifiants Supabase sont présents.
export const supabaseConfigure = Boolean(url && cle)

// Client Supabase (null tant que non configuré).
export const supabase = supabaseConfigure ? createClient(url!, cle!) : null
