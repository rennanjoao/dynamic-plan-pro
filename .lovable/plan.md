# Corrigir persistência, periodização e nutrição dos protocolos

## Objetivo
Garantir que rascunhos nunca alterem o plano publicado, evitar perda por gravações concorrentes e preservar a associação correta entre exercícios, periodização, templates e cálculos nutricionais, sem destruir dados existentes.

## Implementação
- Fortalecer o salvamento no banco com revisão otimista, bloqueio da linha, validação do vínculo coach–aluno e separação transacional entre rascunho e publicação.
- Fazer cada publicação criar um snapshot completo e imutável; restaurações continuarão voltando como rascunho para revisão.
- Serializar autosave, salvamento manual e publicação no editor, preservando a alteração mais recente e exibindo estados claros de salvamento, publicação, erro e conflito.
- Restringir a leitura do aluno ao conteúdo publicado; manter a visualização de rascunho apenas no Modo Espelho autorizado do coach.
- Evoluir overrides de periodização para identidade estável por exercício (`exerciseId`), mantendo compatibilidade com chaves posicionais antigas.
- Atualizar edição, reordenação, remoção, duplicação, mobilidade, prévia e tela do aluno para resolver overrides pela identidade estável.
- Sanitizar aplicações de templates de treino e periodização, descartando associações órfãs e confirmando substituições que possam apagar alterações locais.
- Criar validação final de publicação com erros bloqueantes e avisos não bloqueantes para divergências nutricionais e dados opcionais.
- Corrigir cálculos para manter precisão até o agregado e impedir conversão inventada de unidades sem peso cadastrado.
- Preservar quantidade original, macros manuais e alimentos manuais sem substituição automática.

## Banco e segurança
- Adicionar `revision` ao protocolo e metadados completos aos snapshots, com preenchimento compatível para registros atuais.
- Substituir a função de salvamento por uma versão transacional e segura, sem confiar no `coach_id` recebido do navegador.
- Revisar somente as regras de acesso relacionadas a protocolos, versões e planos para garantir o isolamento entre coach e aluno.
- Manter migrations idempotentes, permissões explícitas e compatibilidade com protocolos legados.

## Testes e validação
- Cobrir rascunho versus publicação, conflito de revisão, snapshots e restauração.
- Cobrir inserção, remoção, reordenação e duplicação com overrides por identidade, incluindo mobilidade e fallback legado.
- Cobrir templates com overrides válidos e órfãos.
- Cobrir precisão decimal, `g`, `ml`, unidades com e sem peso cadastrado, vírgula/ponto e macros manuais.
- Executar typecheck, testes, build e lint; corrigir regressões causadas pelo trabalho e registrar limitações antigas do lint separadamente.
- Validar os fluxos principais na interface do coach e no Modo Espelho antes de concluir.
