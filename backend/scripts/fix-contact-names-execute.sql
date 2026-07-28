-- ============================================================================
-- CORREÇÃO DE NOMES INVÁLIDOS - VERSÃO EXECUTÁVEL
-- Data: 2024-12-20
-- Descrição: Corrige contatos com nomes problemáticos (".", nome=número, etc)
-- ============================================================================

BEGIN;

SELECT '🔧 Iniciando correção de nomes...' as status;

-- Criar tabela temporária para rastrear mudanças
CREATE TEMP TABLE contact_name_fixes (
    contact_id INTEGER,
    old_name TEXT,
    new_name TEXT,
    reason TEXT
);

SELECT '📝 Tabela temporária criada' as status;

-- ============================================================================
-- 1. CORRIGIR CONTATOS COM NOME = "." OU SIMILAR
-- ============================================================================
WITH contacts_to_fix AS (
    SELECT 
        id,
        name as old_name,
        CASE 
            WHEN LENGTH(number) <= 15 THEN 
                -- Formatar número como telefone
                CASE 
                    WHEN number ~ '^55' THEN 
                        '+' || SUBSTRING(number FROM 1 FOR 2) || ' (' || 
                        SUBSTRING(number FROM 3 FOR 2) || ') ' || 
                        SUBSTRING(number FROM 5)
                    WHEN number ~ '^1' THEN
                        '+1 (' || SUBSTRING(number FROM 2 FOR 3) || ') ' || 
                        SUBSTRING(number FROM 5)
                    ELSE 
                        '+' || number
                END
            ELSE 
                -- Se for LID ou número inválido
                'WhatsApp Web'
        END as new_name,
        'Nome era ponto' as reason
    FROM "Contacts"
    WHERE name = '.' OR name LIKE '.%'
),
updated AS (
    UPDATE "Contacts" c
    SET name = ctf.new_name,
        "updatedAt" = NOW()
    FROM contacts_to_fix ctf
    WHERE c.id = ctf.id
    RETURNING c.id, ctf.old_name, c.name as new_name, ctf.reason
)
INSERT INTO contact_name_fixes (contact_id, old_name, new_name, reason)
SELECT id, old_name, new_name, reason FROM updated;

SELECT 
    '✅ Corrigidos ' || COUNT(*) || ' contatos com nome de ponto' as status
FROM contact_name_fixes
WHERE reason = 'Nome era ponto';


-- ============================================================================
-- 2. CORRIGIR CONTATOS ONDE NOME = NÚMERO
-- ============================================================================
WITH contacts_to_fix AS (
    SELECT 
        id,
        name as old_name,
        CASE 
            WHEN LENGTH(number) <= 15 AND number ~ '^55' THEN 
                -- Número brasileiro: +55 (DDD) XXXXX-XXXX
                '+' || SUBSTRING(number FROM 1 FOR 2) || ' (' || 
                SUBSTRING(number FROM 3 FOR 2) || ') ' || 
                SUBSTRING(number FROM 5)
            WHEN LENGTH(number) <= 15 AND number ~ '^1' THEN 
                -- Número USA/Canadá: +1 (XXX) XXX-XXXX
                '+1 (' || SUBSTRING(number FROM 2 FOR 3) || ') ' || 
                SUBSTRING(number FROM 5)
            WHEN LENGTH(number) <= 15 THEN 
                -- Outros países: +COUNTRY_CODE
                '+' || number
            ELSE 
                -- LID ou inválido
                CASE 
                    WHEN "remoteJid" LIKE '%@lid' THEN 'WhatsApp Web'
                    ELSE 'Contato ' || SUBSTRING(number FROM 1 FOR 10)
                END
        END as new_name,
        'Nome igual ao número' as reason
    FROM "Contacts"
    WHERE name = number
      AND "isGroup" = false
),
updated AS (
    UPDATE "Contacts" c
    SET name = ctf.new_name,
        "updatedAt" = NOW()
    FROM contacts_to_fix ctf
    WHERE c.id = ctf.id
    RETURNING c.id, ctf.old_name, c.name as new_name, ctf.reason
)
INSERT INTO contact_name_fixes (contact_id, old_name, new_name, reason)
SELECT id, old_name, new_name, reason FROM updated;

SELECT 
    '✅ Corrigidos ' || COUNT(*) || ' contatos onde nome=número' as status
FROM contact_name_fixes
WHERE reason = 'Nome igual ao número';


-- ============================================================================
-- 3. CORRIGIR NOMES NUMÉRICOS LONGOS (LIDs extraídos incorretamente)
-- ============================================================================
WITH contacts_to_fix AS (
    SELECT 
        id,
        name as old_name,
        CASE 
            WHEN "remoteJid" LIKE '%@lid' THEN 'WhatsApp Web'
            ELSE 'Contato ' || SUBSTRING(number FROM 1 FOR 8)
        END as new_name,
        'Nome numérico longo' as reason
    FROM "Contacts"
    WHERE name ~ '^[0-9]+$' 
      AND name != number
      AND LENGTH(name) > 15
),
updated AS (
    UPDATE "Contacts" c
    SET name = ctf.new_name,
        "updatedAt" = NOW()
    FROM contacts_to_fix ctf
    WHERE c.id = ctf.id
    RETURNING c.id, ctf.old_name, c.name as new_name, ctf.reason
)
INSERT INTO contact_name_fixes (contact_id, old_name, new_name, reason)
SELECT id, old_name, new_name, reason FROM updated;

SELECT 
    '✅ Corrigidos ' || COUNT(*) || ' contatos com nome numérico longo' as status
FROM contact_name_fixes
WHERE reason = 'Nome numérico longo';


-- ============================================================================
-- RESUMO DAS CORREÇÕES
-- ============================================================================
SELECT '=====================================' as separador;
SELECT '📊 RESUMO DAS CORREÇÕES' as titulo;
SELECT '=====================================' as separador;

SELECT 
    reason as "Tipo_de_Correção",
    COUNT(*) as "Total_Corrigido"
FROM contact_name_fixes
GROUP BY reason
ORDER BY COUNT(*) DESC;

-- Exemplos das correções
SELECT '=====================================' as separador;
SELECT '📋 EXEMPLOS DE CORREÇÕES (primeiros 15)' as titulo;
SELECT '=====================================' as separador;

SELECT 
    contact_id as "ID",
    old_name as "Nome_Antigo",
    new_name as "Nome_Novo",
    reason as "Motivo"
FROM contact_name_fixes
ORDER BY contact_id
LIMIT 15;

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO PÓS-CORREÇÃO
-- ============================================================================
SELECT '=====================================' as separador;
SELECT '🔍 VERIFICAÇÃO APÓS CORREÇÃO' as titulo;
SELECT '=====================================' as separador;

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

SELECT '=====================================' as separador;
SELECT '✅ CORREÇÃO CONCLUÍDA COM SUCESSO!' as status;
SELECT 'Total de contatos corrigidos: ' || (SELECT COUNT(*) FROM "Contacts" WHERE "updatedAt" > NOW() - INTERVAL '1 minute') as info;
SELECT '=====================================' as separador;
