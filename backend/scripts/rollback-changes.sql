-- ============================================================================
-- SCRIPT DE REVERSÃO (ROLLBACK)
-- Data: 2024-12-20
-- Objetivo: Reverter todas as alterações feitas pelos scripts de correção
-- ============================================================================

-- ATENÇÃO: Execute este script apenas se houver problemas após as correções!

-- ============================================================================
-- ETAPA 1: VERIFICAR SE OS BACKUPS EXISTEM
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE tablename = 'Contacts_BACKUP_20241220') THEN
        RAISE EXCEPTION '❌ Backup Contacts_BACKUP_20241220 não encontrado! Não é seguro prosseguir.';
    END IF;
    
    IF NOT EXISTS (SELECT FROM pg_tables WHERE tablename = 'Tickets_BACKUP_20241220') THEN
        RAISE EXCEPTION '❌ Backup Tickets_BACKUP_20241220 não encontrado! Não é seguro prosseguir.';
    END IF;
    
    IF NOT EXISTS (SELECT FROM pg_tables WHERE tablename = 'Messages_BACKUP_20241220') THEN
        RAISE EXCEPTION '❌ Backup Messages_BACKUP_20241220 não encontrado! Não é seguro prosseguir.';
    END IF;
    
    RAISE NOTICE '✅ Todos os backups encontrados. Prosseguindo com rollback...';
END $$;


-- ============================================================================
-- ETAPA 2: CRIAR BACKUP DO ESTADO ATUAL (antes de reverter)
-- ============================================================================
DROP TABLE IF EXISTS "Contacts_BEFORE_ROLLBACK_20241220";
CREATE TABLE "Contacts_BEFORE_ROLLBACK_20241220" AS SELECT * FROM "Contacts";

DROP TABLE IF EXISTS "Tickets_BEFORE_ROLLBACK_20241220";
CREATE TABLE "Tickets_BEFORE_ROLLBACK_20241220" AS SELECT * FROM "Tickets";

DROP TABLE IF EXISTS "Messages_BEFORE_ROLLBACK_20241220";
CREATE TABLE "Messages_BEFORE_ROLLBACK_20241220" AS SELECT * FROM "Messages";

SELECT '✅ Backup do estado atual criado' as status;


-- ============================================================================
-- ETAPA 3: RESTAURAR TABELA CONTACTS
-- ============================================================================
BEGIN;

-- Desabilitar constraints temporariamente
ALTER TABLE "Tickets" DROP CONSTRAINT IF EXISTS "Tickets_contactId_fkey";
ALTER TABLE "Messages" DROP CONSTRAINT IF EXISTS "Messages_contactId_fkey";

-- Limpar tabela atual
TRUNCATE TABLE "Contacts" CASCADE;

-- Restaurar do backup
INSERT INTO "Contacts" SELECT * FROM "Contacts_BACKUP_20241220";

-- Reabilitar constraints
ALTER TABLE "Tickets" ADD CONSTRAINT "Tickets_contactId_fkey" 
    FOREIGN KEY ("contactId") REFERENCES "Contacts"(id) 
    ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "Messages" ADD CONSTRAINT "Messages_contactId_fkey" 
    FOREIGN KEY ("contactId") REFERENCES "Contacts"(id) 
    ON UPDATE CASCADE ON DELETE CASCADE;

COMMIT;

SELECT 
    '✅ Tabela Contacts restaurada' as status,
    COUNT(*) as registros_restaurados
FROM "Contacts";


-- ============================================================================
-- ETAPA 4: RESTAURAR TABELA TICKETS
-- ============================================================================
BEGIN;

TRUNCATE TABLE "Tickets" CASCADE;
INSERT INTO "Tickets" SELECT * FROM "Tickets_BACKUP_20241220";

COMMIT;

SELECT 
    '✅ Tabela Tickets restaurada' as status,
    COUNT(*) as registros_restaurados
FROM "Tickets";


-- ============================================================================
-- ETAPA 5: RESTAURAR TABELA MESSAGES
-- ============================================================================
BEGIN;

TRUNCATE TABLE "Messages" CASCADE;
INSERT INTO "Messages" SELECT * FROM "Messages_BACKUP_20241220";

COMMIT;

SELECT 
    '✅ Tabela Messages restaurada' as status,
    COUNT(*) as registros_restaurados
FROM "Messages";


-- ============================================================================
-- ETAPA 6: VERIFICAR INTEGRIDADE PÓS-ROLLBACK
-- ============================================================================
-- Verificar se os counts batem
SELECT '=====================================' as separador;
SELECT '🔍 VERIFICAÇÃO DE INTEGRIDADE' as titulo;
SELECT '=====================================' as separador;

SELECT 
    'Contacts' as tabela,
    (SELECT COUNT(*) FROM "Contacts") as count_atual,
    (SELECT COUNT(*) FROM "Contacts_BACKUP_20241220") as count_backup,
    CASE 
        WHEN (SELECT COUNT(*) FROM "Contacts") = (SELECT COUNT(*) FROM "Contacts_BACKUP_20241220")
        THEN '✅ OK'
        ELSE '❌ DIFERENÇA DETECTADA'
    END as status
UNION ALL
SELECT 
    'Tickets' as tabela,
    (SELECT COUNT(*) FROM "Tickets") as count_atual,
    (SELECT COUNT(*) FROM "Tickets_BACKUP_20241220") as count_backup,
    CASE 
        WHEN (SELECT COUNT(*) FROM "Tickets") = (SELECT COUNT(*) FROM "Tickets_BACKUP_20241220")
        THEN '✅ OK'
        ELSE '❌ DIFERENÇA DETECTADA'
    END as status
UNION ALL
SELECT 
    'Messages' as tabela,
    (SELECT COUNT(*) FROM "Messages") as count_atual,
    (SELECT COUNT(*) FROM "Messages_BACKUP_20241220") as count_backup,
    CASE 
        WHEN (SELECT COUNT(*) FROM "Messages") = (SELECT COUNT(*) FROM "Messages_BACKUP_20241220")
        THEN '✅ OK'
        ELSE '❌ DIFERENÇA DETECTADA'
    END as status;

-- Verificar foreign keys
SELECT 
    '🔗 Foreign Keys' as verificacao,
    COUNT(*) as tickets_com_contato_invalido
FROM "Tickets" t
LEFT JOIN "Contacts" c ON t."contactId" = c.id
WHERE c.id IS NULL;

SELECT 
    '🔗 Foreign Keys' as verificacao,
    COUNT(*) as mensagens_com_contato_invalido
FROM "Messages" m
LEFT JOIN "Contacts" c ON m."contactId" = c.id
WHERE c.id IS NULL;


-- ============================================================================
-- RESUMO DO ROLLBACK
-- ============================================================================
SELECT '=====================================' as separador;
SELECT '✅ ROLLBACK CONCLUÍDO COM SUCESSO!' as titulo;
SELECT '=====================================' as separador;
SELECT 'Todas as tabelas foram restauradas para o estado anterior.' as info;
SELECT 'Os dados pós-correção foram salvos em *_BEFORE_ROLLBACK_20241220' as info;
SELECT 'Data: ' || NOW()::TEXT as timestamp;
SELECT '=====================================' as separador;


-- ============================================================================
-- INSTRUÇÕES PÓS-ROLLBACK
-- ============================================================================
SELECT '📝 PRÓXIMOS PASSOS:' as titulo;
SELECT '1. Reinicie o backend: pm2 restart remotenyx-backend' as passo;
SELECT '2. Verifique os logs: pm2 logs remotenyx-backend' as passo;
SELECT '3. Teste criação de novos contatos' as passo;
SELECT '4. Se tudo estiver OK, você pode excluir as tabelas de backup' as passo;
