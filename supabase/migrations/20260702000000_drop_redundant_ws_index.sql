-- Remove o índice simples em workout_sessions(user_id), redundante: o índice
-- composto ws_started_at_idx (user_id, started_at DESC) já cobre qualquer
-- consulta que filtre apenas por user_id, e é o índice realmente usado nas
-- consultas do app (busca de sessão ativa / histórico recente por usuário).
-- Manter os dois só adiciona overhead de escrita sem ganho de leitura.
DROP INDEX IF EXISTS public.ws_user_id_idx;

-- Os demais índices (ws_started_at_idx, ws_workout_key_idx, wset_user_exercise_idx,
-- wset_session_idx, wset_user_recent_idx) já cobrem bem os padrões de consulta
-- atuais e são mantidos como estão.
