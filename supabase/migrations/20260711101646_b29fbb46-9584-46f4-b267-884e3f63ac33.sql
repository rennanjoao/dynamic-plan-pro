
ALTER TABLE public.exercise_library
  ADD COLUMN IF NOT EXISTS primary_muscle_group text,
  ADD COLUMN IF NOT EXISTS secondary_muscle_groups text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS classification_source text NOT NULL DEFAULT 'unclassified';

ALTER TABLE public.exercise_library
  ALTER COLUMN file_name DROP NOT NULL;

-- Backfill via tabela temporária de regras ordenadas (mesmo dicionário do classificador TS)
CREATE TEMP TABLE _mg_rules(seq int, keyword text, primary_m text, secondary_m text[]) ON COMMIT DROP;

INSERT INTO _mg_rules(seq, keyword, primary_m, secondary_m) VALUES
  (1,  'levantamento terra romeno', 'posterior_coxa', ARRAY['gluteo']),
  (2,  'stiff',                     'posterior_coxa', ARRAY['gluteo']),
  (3,  'levantamento terra',        'costas',         ARRAY['posterior_coxa','gluteo']),
  (4,  'supino fechado',            'triceps',        ARRAY['peito']),
  (5,  'mergulho',                  'triceps',        ARRAY['peito']),
  (6,  'paralelas',                 'triceps',        ARRAY['peito']),
  (7,  'remada alta',               'ombro',          ARRAY['trapezio']),
  (8,  'afundo',                    'quadriceps',     ARRAY['gluteo']),
  (9,  'avanco',                    'quadriceps',     ARRAY['gluteo']),
  (10, 'passada',                   'quadriceps',     ARRAY['gluteo']),
  (11, 'bulgaro',                   'quadriceps',     ARRAY['gluteo']),
  (12, 'agachamento',               'quadriceps',     ARRAY['gluteo']),
  (13, 'hack',                      'quadriceps',     '{}'),
  (14, 'pullover',                  'costas',         ARRAY['peito']),
  (15, 'pull over',                 'costas',         ARRAY['peito']),
  (16, 'rosca de punho',            'antebraco',      '{}'),
  (17, 'rosca punho',               'antebraco',      '{}'),
  (18, 'extensao de punho',         'antebraco',      '{}'),
  (19, 'flexao de punho',           'antebraco',      '{}'),
  (20, 'antebraco',                 'antebraco',      '{}'),
  (21, 'panturrilha',               'panturrilha',    '{}'),
  (22, 'gemeos',                    'panturrilha',    '{}'),
  (23, 'flexao plantar',            'panturrilha',    '{}'),
  (24, 'supino',                    'peito',          '{}'),
  (25, 'crucifixo invertido',       'ombro',          '{}'),
  (26, 'crucifixo',                 'peito',          '{}'),
  (27, 'crossover',                 'peito',          '{}'),
  (28, 'peck deck',                 'peito',          '{}'),
  (29, 'voador',                    'peito',          '{}'),
  (30, 'flexao de braco',           'peito',          '{}'),
  (31, 'flexao de peito',           'peito',          '{}'),
  (32, 'peitoral',                  'peito',          '{}'),
  (33, 'puxada',                    'costas',         '{}'),
  (34, 'pulldown',                  'costas',         '{}'),
  (35, 'remada',                    'costas',         '{}'),
  (36, 'barra fixa',                'costas',         '{}'),
  (37, 'pull-up',                   'costas',         '{}'),
  (38, 'pullup',                    'costas',         '{}'),
  (39, 'chin-up',                   'costas',         '{}'),
  (40, 'chinup',                    'costas',         '{}'),
  (41, 'serrote',                   'costas',         '{}'),
  (42, 'graviton',                  'costas',         '{}'),
  (43, 'dorsal',                    'costas',         '{}'),
  (44, 'encolhimento',              'trapezio',       '{}'),
  (45, 'shrug',                     'trapezio',       '{}'),
  (46, 'hiperextensao',             'lombar',         '{}'),
  (47, 'extensao lombar',           'lombar',         '{}'),
  (48, 'banco romano',              'lombar',         '{}'),
  (49, 'good morning',              'lombar',         '{}'),
  (50, 'desenvolvimento',           'ombro',          '{}'),
  (51, 'elevacao lateral',          'ombro',          '{}'),
  (52, 'elevacao frontal',          'ombro',          '{}'),
  (53, 'arnold press',              'ombro',          '{}'),
  (54, 'face pull',                 'ombro',          '{}'),
  (55, 'deltoide',                  'ombro',          '{}'),
  (56, 'manguito rotador',          'ombro',          '{}'),
  (57, 'rosca',                     'biceps',         '{}'),
  (58, 'biceps',                    'biceps',         '{}'),
  (59, 'triceps',                   'triceps',        '{}'),
  (60, 'kickback',                  'triceps',        '{}'),
  (61, 'leg press',                 'quadriceps',     '{}'),
  (62, 'cadeira extensora',         'quadriceps',     '{}'),
  (63, 'step up',                   'quadriceps',     '{}'),
  (64, 'mesa flexora',              'posterior_coxa', '{}'),
  (65, 'cadeira flexora',           'posterior_coxa', '{}'),
  (66, 'flexora',                   'posterior_coxa', '{}'),
  (67, 'isquiotibiais',             'posterior_coxa', '{}'),
  (68, 'elevacao pelvica',          'gluteo',         '{}'),
  (69, 'hip thrust',                'gluteo',         '{}'),
  (70, 'coice',                     'gluteo',         '{}'),
  (71, 'gluteo',                    'gluteo',         '{}'),
  (72, 'cadeira abdutora',          'gluteo',         '{}'),
  (73, 'abducao de quadril',        'gluteo',         '{}'),
  (74, 'cadeira adutora',           'adutores',       '{}'),
  (75, 'aducao de quadril',         'adutores',       '{}'),
  (76, 'adutor',                    'adutores',       '{}'),
  (77, 'abdominal',                 'abdomen',        '{}'),
  (78, 'prancha',                   'abdomen',        '{}'),
  (79, 'elevacao de pernas',        'abdomen',        '{}'),
  (80, 'obliquo',                   'abdomen',        '{}'),
  (81, 'rotacao de tronco',         'abdomen',        '{}'),
  (82, 'roda abdominal',            'abdomen',        '{}');

WITH matches AS (
  SELECT DISTINCT ON (el.exercise_key)
    el.exercise_key,
    r.primary_m,
    r.secondary_m
  FROM public.exercise_library el
  JOIN _mg_rules r
    ON position(
         r.keyword IN lower(
           translate(
             coalesce(el.display_name, replace(el.exercise_key, '_', ' ')),
             'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
             'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'
           )
         )
       ) > 0
  ORDER BY el.exercise_key, r.seq
)
UPDATE public.exercise_library el
SET primary_muscle_group = m.primary_m,
    secondary_muscle_groups = COALESCE(m.secondary_m, '{}'),
    classification_source = 'auto',
    updated_at = now()
FROM matches m
WHERE el.exercise_key = m.exercise_key
  AND el.classification_source = 'unclassified';
