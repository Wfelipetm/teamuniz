-- ============================================================================
-- CONSOLIDAÇÃO DE CONTATOS DUPLICADOS - VERSÃO CORRIGIDA
-- Data: 2024-12-20
-- Trata constraint contactid_companyid_unique antes de consolidar
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
-- 0. IDENTIFICAR E RESOLVER TICKETS CONFLITANTES
-- ============================================================================
-- Tickets onde ambos os contatos (principal e duplicado) já têm ticket na mesma empresa/whatsapp

SELECT '⚠️  Verificando tickets conflitantes...' as status;

CREATE TEMP TABLE conflicting_tickets AS
SELECT 
    t1.id as keep_ticket_id,
    t2.id as duplicate_ticket_id,
    cc.keep_id,
    cc.merge_id,
    t1."companyId",
    t1."whatsappId",
    t1."createdAt" as keep_created,
    t2."createdAt" as duplicate_created,
    t1.status as keep_status,
    t2.status as duplicate_status
FROM contact_consolidation cc
JOIN "Tickets" t1 ON t1."contactId" = cc.keep_id
JOIN "Tickets" t2 ON t2."contactId" = cc.merge_id 
    AND t2."companyId" = t1."companyId" 
    AND t2."whatsappId" = t1."whatsappId";

SELECT 
    '⚠️  Encontrados ' || COUNT(*) || ' tickets conflitantes' as status
FROM conflicting_tickets;

-- Mover mensagens do ticket duplicado para o ticket principal
WITH moved_messages AS (
    UPDATE "Messages" m
    SET "ticketId" = ct.keep_ticket_id
    FROM conflicting_tickets ct
    WHERE m."ticketId" = ct.duplicate_ticket_id
    RETURNING m.id
)
SELECT 
    '✅ Movidas ' || COUNT(*) || ' mensagens de tickets conflitantes' as status
FROM moved_messages;

-- Deletar tickets duplicados que agora estão vazios
WITH deleted_tickets AS (
    DELETE FROM "Tickets" t
    USING conflicting_tickets ct
    WHERE t.id = ct.duplicate_ticket_id
    RETURNING t.id
)
SELECT 
    '✅ Removidos ' || COUNT(*) || ' tickets duplicados' as status
FROM deleted_tickets;


-- ============================================================================
-- 1. ATUALIZAR TICKETS RESTANTES PARA CONTATO CORRETO
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
    '✅ Atualizados ' || COALESCE(COUNT(*), 0) || ' tickets para contato principal' as status
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
      AND (c."remoteJid" IS NULL OR c."remoteJid" = '' OR c."remoteJid" NOT LIKE '%@lid')
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
