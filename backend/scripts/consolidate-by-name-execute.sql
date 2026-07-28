-- ============================================================================
-- CONSOLIDAÇÃO DIRETA DE DUPLICADOS POR NOME
-- ============================================================================
BEGIN;

SELECT '🔧 Iniciando consolidação...' as status;

-- Criar tabela de mapeamento
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

SELECT '📊 Total para consolidar: ' || COUNT(*) as info FROM name_consolidation;

-- 1. Tratar tickets conflitantes
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

UPDATE "Messages" m SET "ticketId" = ct.keep_ticket_id FROM conflicting_tickets ct WHERE m."ticketId" = ct.merge_ticket_id;
DELETE FROM "Tickets" t USING conflicting_tickets ct WHERE t.id = ct.merge_ticket_id;

SELECT '✅ Tickets conflitantes: ' || COUNT(*) as r FROM conflicting_tickets;

-- 2. Mover tickets
UPDATE "Tickets" t SET "contactId" = nc.keep_id FROM name_consolidation nc WHERE t."contactId" = nc.merge_id;

-- 3. Mover mensagens
UPDATE "Messages" m SET "contactId" = nc.keep_id FROM name_consolidation nc WHERE m."contactId" = nc.merge_id;

-- 4. Salvar LIDs
UPDATE "Contacts" c SET "remoteJid" = nc.lid_number || '@lid' FROM name_consolidation nc WHERE c.id = nc.keep_id AND (c."remoteJid" IS NULL OR c."remoteJid" = '');

-- 5. Deletar duplicados
DELETE FROM "Contacts" c USING name_consolidation nc WHERE c.id = nc.merge_id;

SELECT '✅ Consolidados: ' || COUNT(DISTINCT keep_id) as r FROM name_consolidation;
SELECT '✅ Removidos: ' || COUNT(*) as r FROM name_consolidation;

COMMIT;
SELECT '🎉 CONCLUÍDO!' as status;
