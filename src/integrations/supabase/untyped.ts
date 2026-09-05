// Cliente Supabase sem tipagem, para tabelas/colunas/RPCs que ainda não
// existem em `types.ts` (gerado por `supabase gen types`).
//
// Antes desta auditoria (2026-09), 28 arquivos declaravam sua própria
// cópia de `const sb: any = supabase;` — mesmo escape hatch, copiado 28
// vezes. Centralizado aqui para reduzir a duplicação.
//
// Isso NÃO elimina o `any`: assim que as migrations pendentes forem
// aplicadas e `supabase gen types` rodar, `types.ts` passa a cobrir essas
// tabelas/colunas/RPCs e os usos de `sb` (aqui e nos call sites) podem
// voltar a usar `supabase` diretamente, tipado.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sb: any = supabase;
