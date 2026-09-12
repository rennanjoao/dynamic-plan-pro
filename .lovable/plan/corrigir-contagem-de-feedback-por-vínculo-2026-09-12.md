# Corrigir contagem de feedback por vínculo

## Alterações
- Ajustar os e-mails de lembrete para contar a partir do último check-in do vínculo atual ou, sem check-in, da primeira abertura de protocolo desse mesmo coach.
- Não usar mais a anamnese como início da contagem e não enviar lembrete antes da primeira abertura.
- Filtrar check-ins e protocolos do painel pelo coach atual, preservando check-ins antigos sem `coach_id` como compatibilidade.
- Manter intactos os prazos D-1, D0 e D+2 e o restante dos comportamentos.

## Validação
- Cobrir aluno novo, aluno reatribuído e check-in legado sem coach.
- Rodar os testes relevantes e confirmar a compilação sem erros.
- Publicar somente a função de lembretes alterada.

## Detalhes técnicos
- Indexar os dados por par `student_id + coach_id` para impedir mistura entre vínculos.
- Em `check_ins`, aceitar `coach_id` atual ou nulo; em `protocols`, exigir o `coach_id` atual e `is_template = false`.
