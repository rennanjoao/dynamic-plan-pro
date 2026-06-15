## Objetivo

Quatro ajustes interdependentes:

1. Aluno escolhe entre **novo check-in** ou **atualizar o último** (até 3 edições no mesmo check-in).
2. Aluno pode **editar a própria anamnese** até 2 vezes.
3. Bug: feedback/edição feita pelo coach não atualiza na tela de Evolução do aluno.
4. Coach passa a editar **check-in completo** (hoje só edita medidas/fotos via `MeasurementsEditor`); anamnese completa já está editável.

---

## 1. Aluno — novo check-in vs atualizar último (3 edições)

**Schema:** adicionar coluna `edit_count INT NOT NULL DEFAULT 0` em `public.check_ins`. Sem migration de dados (default 0).

**UI em `src/pages/CheckIn.tsx`:**
- Ao montar, buscar o último check-in do aluno (`order submitted_at desc limit 1`).
- Se existir e `edit_count < 3`, abrir um diálogo inicial:
  - **"Fazer novo check-in"** (fluxo atual, insert).
  - **"Atualizar último check-in"** (carrega o `payload` + `current_metrics` + `fotos` no formulário; submit faz `update` em vez de `insert` e incrementa `edit_count`). Mostra contador "Edição X de 3".
- Se `edit_count >= 3`, só permite novo (com aviso "Você já editou este check-in 3 vezes").
- Notificação ao coach indica `kind: "checkin"` com flag `updated: true` quando for edição.

## 2. Aluno — editar a própria anamnese (2 edições)

**Schema:** adicionar coluna `student_edit_count INT NOT NULL DEFAULT 0` em `public.anamnesis`.

**UI em `src/pages/StudentArea.tsx`** (ou no card de perfil — confirmar local exato durante implementação):
- Botão "Editar minha anamnese" visível só se `student_edit_count < 2`.
- Abre uma página/sheet reaproveitando a UI da `Anamnesis.tsx` em modo "edit": pré-carrega o `payload`, sem etapa de código/signup, salva via `update` e incrementa `student_edit_count`.
- Após atingir 2, troca para mensagem "Para novas alterações fale com seu coach".

## 3. Bug: edição do coach não reflete na Evolução

Causas prováveis (vou validar no console/network do preview da Ana Paula):
- `useStudentData` usa cache de React Query. Já tem subscription em `check_ins`, mas o invalidate está condicionado a `studentId` derivado da sessão. Quando o coach edita, a aluna precisa de invalidate; o realtime cobre, mas pode estar com filtro por `student_id eq` em outro lugar.
- `Evolution.tsx` não força refetch ao montar.

**Ações:**
- `useStudentData`: adicionar `refetchOnMount: "always"` e `staleTime: 0` nas três queries (anamnesis/check-ins/protocol).
- Conferir se o `update` do coach no `MeasurementsEditor` e no `AnamnesisViewer` define `updated_at = now()` (já fazem) — garantir que o canal realtime captura UPDATE (já é `*` por padrão).
- Adicionar log temporário no canal realtime para confirmar entrega; se não chegar, trocar para invalidate on `visibilitychange`.

## 4. Coach — editar check-in completo

Estender o botão **"Editar check-in"** do `AnamnesisViewer` para abrir uma versão completa, não só medidas.

**Implementação:** criar `src/components/coach/CheckinFullEditor.tsx` espelhando o layout de `CheckIn.tsx`, mas em `Dialog`:
- Carrega o último `check_ins` do aluno.
- Edita todas as seções de `CHECKIN_SECTIONS` + métricas + fotos + `coach_feedback`.
- Salva com `update` em `check_ins.id`, atualizando `payload`, `current_metrics` e `updated_at`.
- Substitui o uso atual de `MeasurementsEditor target="checkin"` no botão "Editar check-in"; mantém o `MeasurementsEditor` em uso para anamnese.

---

## Arquivos a tocar

- `supabase/migrations/<timestamp>_checkin_anamnesis_edit_counters.sql` (novo)
- `src/pages/CheckIn.tsx` (modal de escolha + modo update)
- `src/pages/StudentArea.tsx` (botão editar anamnese — local exato a confirmar)
- `src/pages/Anamnesis.tsx` (suportar `?mode=edit` reusando o form para o aluno)
- `src/hooks/useStudentData.ts` (refetch agressivo)
- `src/components/anamnesis/AnamnesisViewer.tsx` (trocar abertura do "Editar check-in" para o novo editor)
- `src/components/coach/CheckinFullEditor.tsx` (novo)

## Fora de escopo

- Histórico de versões de check-in/anamnese.
- Alterações de billing, RLS de outras tabelas, alertas diários.
- Mudança visual da Evolução além do refresh automático.

## Verificação

- `bunx tsc --noEmit` limpo.
- Fluxo manual: aluno edita check-in 3x e bloqueia; aluno edita anamnese 2x e bloqueia; coach edita check-in completo e aluna vê na Evolução sem F5; aluno cria check-in novo.
