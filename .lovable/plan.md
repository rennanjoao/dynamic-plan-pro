# Revisão do ProtocolBuilder — Fase 1

Escopo desta entrega: **apenas a Fase 1** (autosave + histórico de versões). Ao final, testes rodados e aguardo confirmação antes de seguir pra Fase 2.

## O que NÃO muda (confirmado)
- Treino, Dieta e Suplementos continuam em abas separadas.
- Ciclo de carboidrato por dia na aba Macros: intacto.
- Periodização 4 semanas: intacta.
- Sem "duplicar exercício" / "duplicar dia" no treino. `duplicateMeal` na Dieta permanece.

## Mudanças de banco (migração única)

**Tabela `protocols`:** adicionar coluna `draft_payload jsonb null` (não afeta consumo pelo aluno — aluno lê `payload`).

**Nova tabela `protocol_versions`:**
- `id uuid pk default gen_random_uuid()`
- `protocol_id uuid not null references protocols(id) on delete cascade`
- `student_id uuid not null`
- `coach_id uuid not null`
- `version int not null`
- `payload jsonb not null`
- `created_at timestamptz not null default now()`
- Índice em `(protocol_id, version desc)`.
- Unique em `(protocol_id, version)`.
- GRANT SELECT, INSERT em `authenticated`; GRANT ALL em `service_role`.
- RLS habilitado. Policies: SELECT e INSERT quando `coach_id = auth.uid() AND has_role(auth.uid(),'coach')`. Sem UPDATE/DELETE (histórico imutável).

## Autosave em `ProtocolBuilder.tsx`

**Remover:** botão "Salvar rascunho" (≈linha 476-479) e chamadas `save({ asDraft: true })` ligadas a ele. A função `save` mantém a assinatura, mas o parâmetro `asDraft` passa a ser usado só internamente pelo autosave.

**Autosave:**
- Debounce ~1.5s a partir da última mudança de qualquer campo do payload editado.
- Persiste `draft_payload = payload atual` na linha em `protocols` (via `UPDATE`), sem tocar em `payload` nem gerar `protocol_change_events`.
- Ao trocar de aba (Macros/Diretrizes/Treino/Dieta): flush imediato do debounce.
- Estado local: `lastAutosavedAt: Date | null` + flag `isAutosaving`.
- Só roda em modo edição (`isEditMode && protocolId`), nunca em criação nova.
- Ao carregar o protocolo: se `draft_payload` existir e for mais recente que `payload`, oferece "Retomar rascunho" (banner discreto com botão descartar / retomar). Se descartar, `UPDATE protocols SET draft_payload = null`.

**Indicador visual:** texto pequeno perto do botão "Atualizar protocolo": "Salvo automaticamente às 14:32" (formato `HH:mm`, locale pt-BR), ou "Salvando…" enquanto o request está em voo.

## Painel de alterações pendentes

Reaproveita `detectProtocolChanges` + `summarizeProtocolChanges` (`src/lib/protocolChangeDetector.ts`). Nada de novo motor de diff.

- Ref `previousPayloadRef` já existe no componente (usada pelo bloco de `protocol_change_events`). Reusar.
- Componente colapsável perto do botão "Atualizar protocolo":
  - Fechado: "N alterações pendentes" (N = tamanho do array de diff).
  - Aberto: lista com `label` + `detail` de cada mudança, mesma iconografia por categoria já usada em `ProtocolChangeHistoryDialog`.
  - Some quando N = 0.

## Publicação ("Atualizar protocolo")

Dentro do branch `isEditMode && protocolId && !opts.asDraft` da função `save()`, ANTES do `UPDATE protocols`:

1. `SELECT payload FROM protocols WHERE id = protocolId` → snapshot do payload que está prestes a virar antigo.
2. `SELECT COALESCE(MAX(version), 0) + 1 FROM protocol_versions WHERE protocol_id = protocolId` → próxima versão.
3. `INSERT INTO protocol_versions (protocol_id, student_id, coach_id, version, payload)` com o snapshot.
4. `UPDATE protocols SET payload = <novo>, draft_payload = null, updated_at = now() WHERE id = protocolId`.
5. Bloco existente de `protocol_change_events` continua como está (dentro do try/catch dedicado — invariante testada em `ProtocolBuilderChangeEvent.test.ts`).

Se o passo 1-3 falhar, aborta o publish e mostra toast de erro (não sobrescreve `payload`). Isso preserva a garantia de histórico.

## `ProtocolVersionHistoryDialog.tsx` (novo)

Espelha `TemplateHistoryDialog.tsx` (mesma UI, mesmos toasts, mesmo `useConfirm`).

- Props: `{ open, onOpenChange, protocolId, protocolName, onRestore(payload) }`.
- Query: `select id, version, payload, created_at from protocol_versions where protocol_id = ? order by version desc`.
- Cada item: `v{version}`, data/hora formatada pt-BR, botão "Restaurar".
- Restaurar: confirma → chama `onRestore(payload)` que popula o estado local de edição do `ProtocolBuilder` (não faz `UPDATE`). O coach precisa clicar "Atualizar protocolo" pra publicar de fato.

## Ponto de entrada no `ProtocolBuilder`

Botão ícone `History` no cabeçalho do sheet, perto do nome do protocolo, abrindo o dialog acima. Escondido em modo criação (sem `protocolId`).

## Testes

- Existentes (não podem quebrar): `protocolChangeDetector.test.ts`, `protocolSchema.test.ts`, `protocolChangeMerge.test.ts`, `ProtocolBuilderSheet.test.ts`, `ProtocolBuilderChangeEvent.test.ts`.
- Ajuste em `ProtocolBuilderChangeEvent.test.ts` se a estrutura do bloco mudar (mantendo as 4 invariantes: guarda por `!opts.asDraft`, try/catch próprio, uso do módulo puro, não roda no branch de criação).
- Novo teste leve de estrutura (opcional, no mesmo padrão dos existentes): confirma que `save` invoca `INSERT INTO protocol_versions` antes do `UPDATE` no branch de publish.
- `npm run test` e `npm run typecheck` ao final.

## Arquivos tocados

```text
supabase migration                                    (nova — draft_payload + protocol_versions)
src/components/coach/ProtocolBuilder.tsx              (edit: remove rascunho manual, autosave, painel pendentes, snapshot pré-publish, botão histórico)
src/components/coach/ProtocolVersionHistoryDialog.tsx (novo)
src/components/coach/__tests__/ProtocolBuilderChangeEvent.test.ts (ajuste se estrutura mudar)
```

Ao terminar a Fase 1 aviso e aguardo seu ok pra Fase 2 (Suplementos: Objetivo + Combos).
