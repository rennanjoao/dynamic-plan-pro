# Corrigir estados visuais do alerta de check-in

## Implementação
- Ajustar a linha abaixo do nome do aluno para distinguir: plano ainda não aberto, primeiro check-in pendente após abertura e check-in já realizado.
- Mostrar “Protocolo aberto: hoje/ontem/há X dias” quando o protocolo já foi aberto, usando a contagem existente.
- Fazer a cor dessa linha seguir `alertLevel`, mantendo o estado anterior à abertura em estilo neutro.
- Atualizar o texto explicativo da badge para contextualizar os dias desde a abertura antes do primeiro check-in, preservando a sentinela de 999 dias.

## Validação
- Não alterar cálculos, tipos, e-mails ou outros usos da badge.
- Rodar os testes pertinentes e confirmar que a compilação continua sem erros.
