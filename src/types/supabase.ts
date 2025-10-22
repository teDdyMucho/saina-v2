// Minimal Supabase Database type to satisfy TypeScript.
// Replace with generated types from Supabase when available:
// npx supabase gen types typescript --project-id <project-ref> --schema public > src/types/supabase.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// You can expand this as your schema grows. For now, keep it permissive.
export type Database = Record<string, any>
