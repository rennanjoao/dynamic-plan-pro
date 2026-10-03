# Histórico e progressão de carga por semana

## Situação auditada
- Modo implementação: `src/lib/loadProgression.ts` ainda não existe.
- O banco tem 2.434 séries; 2.414 podem receber a semana e 20 permanecem sem periodização.
- As sessões usam apenas `NULL` e semanas `0..3`; não há critério de parada acionado.
- Alunos e coaches já têm as permissões de leitura necessárias, e não há função ou view dependente que quebre com a nova coluna.
- A coluna `workout_sets.periodization_week` e o índice semanal ainda não existem.

## Implementação
1. Aplicar a migração idempotente que adiciona a semana às séries, preenche o histórico a partir das sessões e cria o índice de consulta.
2. Adicionar os tipos e a lógica pura para agrupar treinos, escolher a carga de cada série, calcular tendências e manter exercícios removidos.
3. Atualizar o Modo Treino para salvar a semana, buscar o último treino da mesma semana e preencher cada série sem sobrescrever dados digitados.
4. Criar “Como está minha progressão de carga?” com histórico por treino, filtro semanal, tendências, trocas de exercício e seção “Saíram do treino”.
5. Substituir o bloco de orientação de faltas pelo novo acesso à progressão.
6. Registrar as regras permanentes de arquitetura e concluir os itens no roteiro.

## Verificação
- Confirmar o preenchimento e o índice no banco após a migração.
- Cobrir agrupamento, preenchimento série a série, isolamento entre semanas, paginação, trocas e exercícios removidos.
- Executar checagem de tipos, lint restrito aos arquivos do escopo, todos os testes e conferir a prévia em desktop e mobile.
- Executar os cenários reais possíveis sem alterar dados de alunos; cenários que exigem registrar ou remover exercícios reais serão reportados como não executados, salvo ambiente de teste seguro disponível.

## Limites preservados
- O Histórico de Treinos existente continuará filtrado por tipo de fase, conforme solicitado.
- O rascunho offline continuará com a chave anterior.
- Nenhum arquivo fora da lista autorizada será alterado.
