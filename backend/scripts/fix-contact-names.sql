-- ============================================================================
-- SCRIPT: Corrigir Nomes de Contatos Problemáticos
-- ============================================================================
-- Identifica e corrige contatos com nomes inválidos:
-- 1. Nome é apenas um ponto (.)
-- 2. Nome é igual ao número (sem pushName do WhatsApp)
-- 3. Nome contém apenas caracteres especiais
-- ============================================================================

-- ANÁLISE: Ver todos os casos problemáticos antes de corrigir
-- ============================================================================

SELECT 
    '=== ANÁLISE DE CONTATOS COM NOMES PROBLEMÁTICOS ===' as analise;

-- 1. Contatos com nome de ponto "."
SELECT 
    'Contatos com nome de ponto' as categoria,
    COUNT(*) as total,
    (array_agg(id ORDER BY id))[1:5] as "exemplos_ids"
FROM "Contacts"
WHERE name = '.' OR name LIKE '.%';

-- 2. Contatos onde nome = número
SELECT 
    'Contatos onde nome = número' as categoria,
    COUNT(*) as total,
    (array_agg(id ORDER BY id))[1:5] as "exemplos_ids"
FROM "Contacts"
WHERE name = number;

-- 3. Contatos com nome apenas numérico (mas diferente do número)
SELECT 
    'Contatos com nome numérico' as categoria,
    COUNT(*) as total,
    (array_agg(id ORDER BY id))[1:5] as "exemplos_ids"
FROM "Contacts"
WHERE name ~ '^[0-9]+$' 
  AND name != number
  AND LENGTH(name) > 5;

-- 4. Contatos com números muito grandes (LIDs)
SELECT 
    'Contatos com número grande (>15)' as categoria,
    COUNT(*) as total,
    (array_agg(id ORDER BY id))[1:5] as "exemplos_ids"
FROM "Contacts"
WHERE LENGTH(number) > 15;

-- VER EXEMPLOS DETALHADOS
-- ============================================================================

SELECT 
    '=== EXEMPLOS DETALHADOS ===' as secao;

-- Exemplos de cada categoria
(SELECT 
    'ponto' as tipo,
    id,
    name,
    number,
    "profilePicUrl",
    "remoteJid",
    "createdAt"
FROM "Contacts"
WHERE name = '.' OR name LIKE '.%'
ORDER BY "createdAt" DESC
LIMIT 5)
UNION ALL
(SELECT 
    'nome=numero' as tipo,
    id,
    name,
    number,
    "profilePicUrl",
    "remoteJid",
    "createdAt"
FROM "Contacts"
WHERE name = number
ORDER BY "createdAt" DESC
LIMIT 5)
UNION ALL
(SELECT 
    'numerico' as tipo,
    id,
    name,
    number,
    "profilePicUrl",
    "remoteJid",
    "createdAt"
FROM "Contacts"
WHERE name ~ '^[0-9]+$' 
  AND name != number
  AND LENGTH(name) > 5
ORDER BY "createdAt" DESC
LIMIT 5)
ORDER BY tipo, id DESC;

-- ============================================================================
-- CORREÇÃO: Atualizar nomes problemáticos
-- ============================================================================
-- ATENÇÃO: Revise os resultados acima antes de executar!
-- DESCOMENTE as linhas abaixo para aplicar as correções
-- ============================================================================

/*
BEGIN;

-- Criar tabela temporária para rastrear mudanças
CREATE TEMP TABLE contact_name_fixes (
    contact_id INTEGER,
    old_name TEXT,
    new_name TEXT,
    reason TEXT
);

-- 1. Corrigir contatos com nome = "." ou similar
WITH contacts_to_fix AS (
    SELECT 
        id,
        name as old_name,
        CASE 
            WHEN LENGTH(number) <= 15 THEN 
                -- Formatar número como telefone
                CASE 
                    WHEN number ~ '^55' THEN 
                        'Contato +' || SUBSTRING(number FROM 1 FOR 2) || ' ' || 
                        SUBSTRING(number FROM 3 FOR 2) || ' ' || 
                        SUBSTRING(number FROM 5)
                    ELSE 
                        'Contato +' || number
                END
            ELSE 
                -- Se for LID ou número inválido
                'Contato ' || SUBSTRING(number FROM 1 FOR 10)
        END as new_name,
        'Nome era ponto' as reason
    FROM "Contacts"
    WHERE name = '.' OR name LIKE '.%'
)
UPDATE "Contacts" c
SET name = ctf.new_name
FROM contacts_to_fix ctf
WHERE c.id = ctf.id
RETURNING c.id, ctf.old_name, c.name, ctf.reason;

-- Registrar mudanças
INSERT INTO contact_name_fixes (contact_id, old_name, new_name, reason)
SELECT id, name, name, 'Nome era ponto'
FROM "Contacts"
WHERE name ~ '^Contato \+';

-- 2. Corrigir contatos onde nome = número
WITH contacts_to_fix AS (
    SELECT 
        id,
        name as old_name,
        CASE 
            WHEN LENGTH(number) <= 15 AND number ~ '^55' THEN 
                -- Número brasileiro
                '+' || SUBSTRING(number FROM 1 FOR 2) || ' ' || 
                SUBSTRING(number FROM 3 FOR 2) || ' ' || 
                SUBSTRING(number FROM 5)
            WHEN LENGTH(number) <= 15 THEN 
                -- Outros países
                '+' || number
            ELSE 
                -- LID ou inválido - tentar extrair algo útil
                CASE 
                    WHEN number LIKE 'LID_%' THEN 'WhatsApp Web'
                    ELSE 'Contato ' || SUBSTRING(number FROM 1 FOR 10)
                END
        END as new_name,
        'Nome igual ao número' as reason
    FROM "Contacts"
    WHERE name = number
      AND "isGroup" = false
)
UPDATE "Contacts" c
SET name = ctf.new_name
FROM contacts_to_fix ctf
WHERE c.id = ctf.id;

-- 3. Corrigir nomes numéricos muito longos (possíveis LIDs extraídos errados)
WITH contacts_to_fix AS (
    SELECT 
        id,
        name as old_name,
        'Contato ' || SUBSTRING(name FROM 1 FOR 8) as new_name,
        'Nome numérico longo' as reason
    FROM "Contacts"
    WHERE name ~ '^[0-9]+$' 
      AND name != number
      AND LENGTH(name) > 15
)
UPDATE "Contacts" c
SET name = ctf.new_name
FROM contacts_to_fix ctf
WHERE c.id = ctf.id;

-- Mostrar resumo das correções
SELECT 
    '=== RESUMO DAS CORREÇÕES ===' as resultado;

SELECT 
    reason as "Tipo_de_Correção",
    COUNT(*) as "Total_Corrigido"
FROM contact_name_fixes
GROUP BY reason
ORDER BY COUNT(*) DESC;

-- Mostrar alguns exemplos do que foi corrigido
SELECT 
    contact_id as "ID",
    old_name as "Nome_Antigo",
    new_name as "Nome_Novo",
    reason as "Motivo"
FROM contact_name_fixes
ORDER BY contact_id
LIMIT 20;

COMMIT;
*/

-- ============================================================================
-- VERIFICAÇÃO PÓS-CORREÇÃO
-- ============================================================================
/*
-- Executar após o COMMIT para verificar resultado

SELECT 
    '=== VERIFICAÇÃO APÓS CORREÇÃO ===' as verificacao;

-- Contatos ainda com problemas
SELECT 
    'Ainda com ponto' as tipo,
    COUNT(*) as total
FROM "Contacts"
WHERE name = '.'
UNION ALL
SELECT 
    'Ainda nome=número' as tipo,
    COUNT(*) as total
FROM "Contacts"
WHERE name = number AND "isGroup" = false;

-- Ver nomes corrigidos recentemente
SELECT 
    id,
    name,
    number,
    "updatedAt"
FROM "Contacts"
WHERE name LIKE 'Contato %'
   OR name LIKE '+%'
ORDER BY "updatedAt" DESC
LIMIT 20;
*/
