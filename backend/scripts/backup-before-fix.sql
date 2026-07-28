-- ============================================================================
-- BACKUP COMPLETO DOS DADOS ANTES DA CORREÇÃO
-- Data: 2024-12-20
-- Objetivo: Permitir reversão total em caso de problemas
-- ============================================================================

-- 1. BACKUP DA TABELA CONTACTS COMPLETA
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS "Contacts_BACKUP_20241220";

CREATE TABLE "Contacts_BACKUP_20241220" AS 
SELECT * FROM "Contacts";

-- Verificar backup
SELECT 
    'Contacts' as tabela,
    (SELECT COUNT(*) FROM "Contacts") as original_count,
    (SELECT COUNT(*) FROM "Contacts_BACKUP_20241220") as backup_count,
    CASE 
        WHEN (SELECT COUNT(*) FROM "Contacts") = (SELECT COUNT(*) FROM "Contacts_BACKUP_20241220")
        THEN '✅ BACKUP OK'
        ELSE '❌ BACKUP FALHOU'
    END as status;


-- 2. BACKUP DA TABELA TICKETS (referências aos contatos)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS "Tickets_BACKUP_20241220";

CREATE TABLE "Tickets_BACKUP_20241220" AS 
SELECT * FROM "Tickets";

-- Verificar backup
SELECT 
    'Tickets' as tabela,
    (SELECT COUNT(*) FROM "Tickets") as original_count,
    (SELECT COUNT(*) FROM "Tickets_BACKUP_20241220") as backup_count,
    CASE 
        WHEN (SELECT COUNT(*) FROM "Tickets") = (SELECT COUNT(*) FROM "Tickets_BACKUP_20241220")
        THEN '✅ BACKUP OK'
        ELSE '❌ BACKUP FALHOU'
    END as status;


-- 3. BACKUP DA TABELA MESSAGES (referências aos contatos)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS "Messages_BACKUP_20241220";

CREATE TABLE "Messages_BACKUP_20241220" AS 
SELECT * FROM "Messages";

-- Verificar backup
SELECT 
    'Messages' as tabela,
    (SELECT COUNT(*) FROM "Messages") as original_count,
    (SELECT COUNT(*) FROM "Messages_BACKUP_20241220") as backup_count,
    CASE 
        WHEN (SELECT COUNT(*) FROM "Messages") = (SELECT COUNT(*) FROM "Messages_BACKUP_20241220")
        THEN '✅ BACKUP OK'
        ELSE '❌ BACKUP FALHOU'
    END as status;


-- 4. EXPORTAR DADOS DOS CONTATOS PROBLEMÁTICOS EM FORMATO LEGÍVEL
-- ----------------------------------------------------------------------------
-- Contatos com nomes inválidos
DROP TABLE IF EXISTS "Contacts_InvalidNames_BACKUP_20241220";

CREATE TABLE "Contacts_InvalidNames_BACKUP_20241220" AS
SELECT 
    id,
    name,
    number,
    "profilePicUrl",
    "remoteJid",
    "createdAt",
    "updatedAt"
FROM "Contacts"
WHERE 
    name = '.'
    OR name ~ '^[0-9]+$'
    OR (LENGTH(name) > 10 AND name ~ '^[0-9]+$');

-- Verificar contatos problemáticos
SELECT 
    'Contatos com nomes inválidos' as categoria,
    COUNT(*) as total,
    '✅ Backup salvo' as status
FROM "Contacts_InvalidNames_BACKUP_20241220";


-- 5. BACKUP DOS CONTATOS DUPLICADOS (LID)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS "Contacts_Duplicates_BACKUP_20241220";

CREATE TABLE "Contacts_Duplicates_BACKUP_20241220" AS
SELECT 
    c1.id as contact_id,
    c1.name,
    c1.number,
    c1."profilePicUrl",
    c1."remoteJid",
    COUNT(*) OVER (PARTITION BY c1."profilePicUrl") as duplicate_count
FROM "Contacts" c1
WHERE c1."profilePicUrl" IS NOT NULL
  AND c1."profilePicUrl" != ''
  AND EXISTS (
      SELECT 1 
      FROM "Contacts" c2 
      WHERE c2."profilePicUrl" = c1."profilePicUrl" 
        AND c2.id != c1.id
  );

-- Verificar duplicados
SELECT 
    'Contatos duplicados por foto' as categoria,
    COUNT(*) as total,
    '✅ Backup salvo' as status
FROM "Contacts_Duplicates_BACKUP_20241220";


-- ============================================================================
-- RESUMO DO BACKUP
-- ============================================================================
SELECT '=====================================' as separador;
SELECT '📦 RESUMO DO BACKUP' as titulo;
SELECT '=====================================' as separador;

SELECT 
    'Contacts' as tabela,
    (SELECT COUNT(*) FROM "Contacts_BACKUP_20241220") as registros_backup
UNION ALL
SELECT 
    'Tickets' as tabela,
    (SELECT COUNT(*) FROM "Tickets_BACKUP_20241220") as registros_backup
UNION ALL
SELECT 
    'Messages' as tabela,
    (SELECT COUNT(*) FROM "Messages_BACKUP_20241220") as registros_backup
UNION ALL
SELECT 
    'InvalidNames' as tabela,
    (SELECT COUNT(*) FROM "Contacts_InvalidNames_BACKUP_20241220") as registros_backup
UNION ALL
SELECT 
    'Duplicates' as tabela,
    (SELECT COUNT(*) FROM "Contacts_Duplicates_BACKUP_20241220") as registros_backup;

SELECT '=====================================' as separador;
SELECT '✅ Backup completo realizado com sucesso!' as status;
SELECT 'Data: ' || NOW()::TEXT as timestamp;
SELECT '=====================================' as separador;
