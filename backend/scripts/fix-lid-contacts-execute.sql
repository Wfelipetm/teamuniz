-- ============================================================================
-- CONSOLIDAÇÃO DE CONTATOS DUPLICADOS - VERSÃO EXECUTÁVEL
-- Data: 2024-12-20
-- Descrição: Consolida contatos duplicados causados por LIDs do WhatsApp Web
-- ============================================================================

BEGIN;

SELECT '🔧 Iniciando consolidação de duplicados...' as status;

-- Criar tabela temporária com mapeamento de duplicados
CREATE TEMP TABLE contact_consolidation AS
WITH duplicates AS (
  SELECT 
    "profilePicUrl",
    array_agg(id ORDER BY "createdAt" ASC) as contact_ids,
    array_agg(number ORDER BY LENGTH(number) ASC) as numbers,
    array_agg(name) as names
  FROM "Contacts"
  WHERE "profilePicUrl" IS NOT NULL 
    AND "profilePicUrl" NOT LIKE '%nopicture%'
    AND "isGroup" = false
  GROUP BY "profilePicUrl"
  HAVING COUNT(*) > 1
)
SELECT 
  d.contact_ids[1] as keep_id,
  unnest(d.contact_ids[2:array_length(d.contact_ids, 1)]) as merge_id,
  d.numbers[1] as correct_number,
  d."profilePicUrl"
FROM duplicates d;

SELECT 
    '📊 Encontrados ' || COUNT(DISTINCT keep_id) || ' contatos principais com duplicados' as status
FROM contact_consolidation;

SELECT 
    '🔍 Total de ' || COUNT(*) || ' duplicados serão consolidados' as status
FROM contact_consolidation;


-- ============================================================================
-- 1. ATUALIZAR TICKETS PARA CONTATO CORRETO
-- ============================================================================
WITH updated AS (
    UPDATE "Tickets" t
    SET "contactId" = cc.keep_id,
        "updatedAt" = NOW()
    FROM contact_consolidation cc
    WHERE t."contactId" = cc.merge_id
    RETURNING t.id
)
SELECT 
    '✅ Atualizados ' || COUNT(*) || ' tickets' as status
FROM updated;


-- ============================================================================
-- 2. ATUALIZAR MESSAGES PARA CONTATO CORRETO
-- ============================================================================
WITH updated AS (
    UPDATE "Messages" m
    SET "contactId" = cc.keep_id
    FROM contact_consolidation cc
    WHERE m."contactId" = cc.merge_id
    RETURNING m.id
)
SELECT 
    '✅ Atualizadas ' || COUNT(*) || ' mensagens' as status
FROM updated;


-- ============================================================================
-- 3. SALVAR LIDs NO CAMPO remoteJid DO CONTATO PRINCIPAL
-- ============================================================================
WITH updated AS (
    UPDATE "Contacts" c
    SET "remoteJid" = CASE 
            WHEN LENGTH(c_dup.number) > 15 THEN c_dup.number || '@lid'
            ELSE c."remoteJid"
        END,
        "updatedAt" = NOW()
    FROM contact_consolidation cc
    JOIN "Contacts" c_dup ON c_dup.id = cc.merge_id
    WHERE c.id = cc.keep_id
      AND LENGTH(c_dup.number) > 15
      AND (c."remoteJid" IS NULL OR c."remoteJid" = '')
    RETURNING c.id
)
SELECT 
    '✅ Salvos ' || COUNT(*) || ' LIDs no campo remoteJid' as status
FROM updated;


-- ============================================================================
-- 4. REMOVER CONTATOS DUPLICADOS
-- ============================================================================
WITH deleted AS (
    DELETE FROM "Contacts" c
    USING contact_consolidation cc
    WHERE c.id = cc.merge_id
    RETURNING c.id, c.name, c.number
)
SELECT 
    '✅ Removidos ' || COUNT(*) || ' contatos duplicados' as status
FROM deleted;


-- ============================================================================
-- RESUMO DA CONSOLIDAÇÃO
-- ============================================================================
SELECT '=====================================' as separador;
SELECT '📊 RESUMO DA CONSOLIDAÇÃO' as titulo;
SELECT '=====================================' as separador;

SELECT 
    COUNT(DISTINCT keep_id) as "Contatos_Principais_Mantidos",
    COUNT(DISTINCT merge_id) as "Contatos_Duplicados_Removidos"
FROM contact_consolidation;

-- Ver alguns exemplos do que foi consolidado
SELECT '=====================================' as separador;
SELECT '📋 EXEMPLOS DE CONSOLIDAÇÕES' as titulo;
SELECT '=====================================' as separador;

SELECT 
    cc.keep_id as "ID_Principal",
    c.name as "Nome",
    c.number as "Número",
    c."remoteJid" as "RemoteJid",
    (SELECT COUNT(*) FROM "Tickets" WHERE "contactId" = cc.keep_id) as "Total_Tickets",
    (SELECT COUNT(*) FROM "Messages" WHERE "contactId" = cc.keep_id) as "Total_Mensagens"
FROM (SELECT DISTINCT keep_id FROM contact_consolidation LIMIT 10) cc
JOIN "Contacts" c ON c.id = cc.keep_id
ORDER BY cc.keep_id;

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO PÓS-CONSOLIDAÇÃO
-- ============================================================================
SELECT '=====================================' as separador;
SELECT '🔍 VERIFICAÇÃO APÓS CONSOLIDAÇÃO' as titulo;
SELECT '=====================================' as separador;

-- Contatos ainda com números grandes (LIDs não consolidados)
SELECT 
    'Contatos com número grande (>15 dígitos)' as tipo,
    COUNT(*) as total
FROM "Contacts"
WHERE LENGTH(number) > 15
  AND "isGroup" = false;

-- Contatos com remoteJid preenchido (LIDs salvos)
SELECT 
    'Contatos com LID salvo em remoteJid' as tipo,
    COUNT(*) as total
FROM "Contacts"
WHERE "remoteJid" LIKE '%@lid'
  AND "isGroup" = false;

-- Verificar se ainda há duplicados
SELECT 
    'Contatos duplicados restantes' as tipo,
    COUNT(*) as total
FROM (
    SELECT "profilePicUrl"
    FROM "Contacts"
    WHERE "profilePicUrl" IS NOT NULL 
      AND "profilePicUrl" NOT LIKE '%nopicture%'
      AND "isGroup" = false
    GROUP BY "profilePicUrl"
    HAVING COUNT(*) > 1
) sub;

SELECT '=====================================' as separador;
SELECT '✅ CONSOLIDAÇÃO CONCLUÍDA COM SUCESSO!' as status;
SELECT '=====================================' as separador;
