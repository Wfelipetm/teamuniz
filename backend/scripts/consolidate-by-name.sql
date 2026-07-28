-- ============================================================================
-- CONSOLIDAÇÃO DE DUPLICADOS POR NOME
-- Consolida contatos LID para contatos normais com mesmo nome
-- ============================================================================

BEGIN;

SELECT '🔍 Analisando duplicados por nome...' as status;

-- Criar tabela temporária com mapeamento
CREATE TEMP TABLE name_consolidation AS
WITH duplicates AS (
    -- Encontrar nomes com múltiplos contatos
    SELECT name
    FROM "Contacts"
    WHERE "isGroup" = false 
      AND name IS NOT NULL
      AND name != ''
      AND name != 'WhatsApp Web'  -- Excluir genéricos
    GROUP BY name
    HAVING COUNT(*) > 1
),
contacts_by_name AS (
    -- Pegar todos contatos desses nomes duplicados
    SELECT 
        c.id,
        c.name,
        c.number,
        LENGTH(c.number) as num_length,
        c."profilePicUrl",
        c."createdAt",
        ROW_NUMBER() OVER (
            PARTITION BY c.name 
            ORDER BY 
                -- Prioridade: menor número (mais provável de ser real)
                LENGTH(c.number) ASC,
                -- Depois por data de criação (mais antigo)
                c."createdAt" ASC
        ) as priority
    FROM "Contacts" c
    INNER JOIN duplicates d ON d.name = c.name
    WHERE c."isGroup" = false
)
-- Mapear: LIDs → Contato principal (priority = 1)
SELECT 
    c_keep.id as keep_id,
    c_merge.id as merge_id,
    c_keep.name,
    c_keep.number as keep_number,
    c_merge.number as merge_number
FROM contacts_by_name c_keep
INNER JOIN contacts_by_name c_merge ON 
    c_merge.name = c_keep.name
    AND c_merge.priority > 1  -- Todos exceto o principal
    AND c_merge.num_length > 14  -- Apenas LIDs
WHERE c_keep.priority = 1  -- Contato principal
  AND c_keep.num_length <= 13; -- Principal deve ser número normal

SELECT 
    '📊 Total de LIDs para consolidar: ' || COUNT(*) as info
FROM name_consolidation;

-- Mostrar exemplos
SELECT '📋 Exemplos de consolidações que serão feitas:' as titulo;
SELECT 
    name,
    keep_id as "ID_Manter",
    keep_number as "Num_Principal",
    merge_id as "ID_LID",
    LEFT(merge_number, 15) as "Num_LID"
FROM name_consolidation
ORDER BY name
LIMIT 10;

-- Perguntar confirmação
SELECT '⚠️  ATENÇÃO: Revise os exemplos acima.' as aviso;
SELECT '⚠️  Se estiver correto, execute a seção de CONSOLIDAÇÃO abaixo.' as aviso;

ROLLBACK;  -- Análise concluída

-- ============================================================================
-- SEÇÃO DE CONSOLIDAÇÃO - EXECUTANDO AGORA
-- ============================================================================
BEGIN;

-- Recriar tabela de mapeamento
CREATE TEMP TABLE name_consolidation AS
WITH duplicates AS (
    SELECT name
    FROM "Contacts"
    WHERE "isGroup" = false 
      AND name IS NOT NULL
      AND name != ''
      AND name != 'WhatsApp Web'
    GROUP BY name
    HAVING COUNT(*) > 1
),
contacts_by_name AS (
    SELECT 
        c.id,
        c.name,
        c.number,
        LENGTH(c.number) as num_length,
        c."createdAt",
        ROW_NUMBER() OVER (
            PARTITION BY c.name 
            ORDER BY LENGTH(c.number) ASC, c."createdAt" ASC
        ) as priority
    FROM "Contacts" c
    INNER JOIN duplicates d ON d.name = c.name
    WHERE c."isGroup" = false
)
SELECT 
    c_keep.id as keep_id,
    c_merge.id as merge_id,
    c_keep.name,
    c_merge.number as lid_number
FROM contacts_by_name c_keep
INNER JOIN contacts_by_name c_merge ON 
    c_merge.name = c_keep.name
    AND c_merge.priority > 1
    AND c_merge.num_length > 14
WHERE c_keep.priority = 1
  AND c_keep.num_length <= 13;

-- 1. Tratar tickets conflitantes
SELECT '🔧 Tratando tickets conflitantes...' as status;

CREATE TEMP TABLE conflicting_tickets AS
SELECT 
    t1.id as keep_ticket_id,
    t2.id as merge_ticket_id,
    nc.keep_id,
    nc.merge_id
FROM name_consolidation nc
JOIN "Tickets" t1 ON t1."contactId" = nc.keep_id
JOIN "Tickets" t2 ON t2."contactId" = nc.merge_id
    AND t2."companyId" = t1."companyId"
    AND t2."whatsappId" = t1."whatsappId";

-- Mover mensagens de tickets conflitantes
UPDATE "Messages" m
SET "ticketId" = ct.keep_ticket_id
FROM conflicting_tickets ct
WHERE m."ticketId" = ct.merge_ticket_id;

-- Deletar tickets conflitantes
DELETE FROM "Tickets" t
USING conflicting_tickets ct
WHERE t.id = ct.merge_ticket_id;

SELECT '✅ Tickets conflitantes resolvidos: ' || COUNT(*) as resultado
FROM conflicting_tickets;

-- 2. Mover tickets restantes
UPDATE "Tickets" t
SET "contactId" = nc.keep_id
FROM name_consolidation nc
WHERE t."contactId" = nc.merge_id;

-- 3. Mover mensagens
UPDATE "Messages" m
SET "contactId" = nc.keep_id
FROM name_consolidation nc
WHERE m."contactId" = nc.merge_id;

-- 4. Salvar LIDs no remoteJid
UPDATE "Contacts" c
SET "remoteJid" = nc.lid_number || '@lid'
FROM name_consolidation nc
WHERE c.id = nc.keep_id
  AND (c."remoteJid" IS NULL OR c."remoteJid" = '');

-- 5. Deletar contatos LID duplicados
DELETE FROM "Contacts" c
USING name_consolidation nc
WHERE c.id = nc.merge_id;

-- Mostrar resultado
SELECT '=====================================' as separador;
SELECT '✅ CONSOLIDAÇÃO CONCLUÍDA!' as titulo;
SELECT '=====================================' as separador;

SELECT 
    'Contatos consolidados: ' || COUNT(DISTINCT keep_id) as resultado
FROM name_consolidation;

SELECT 
    'Contatos LID removidos: ' || COUNT(*) as resultado
FROM name_consolidation;

COMMIT;
