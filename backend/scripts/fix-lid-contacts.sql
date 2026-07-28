-- ============================================================================
-- SCRIPT DE CORREÇÃO: Consolidar Contatos Duplicados (LIDs e Números Reais)
-- ============================================================================
-- Este script identifica e consolida contatos duplicados causados por LIDs
-- do WhatsApp Web/Business, preservando TODAS as mensagens
-- ============================================================================

-- PASSO 1: Identificar contatos duplicados pela foto de perfil
-- ============================================================================
WITH duplicates AS (
  SELECT 
    "profilePicUrl",
    COUNT(*) as total,
    array_agg(id ORDER BY "createdAt" ASC) as contact_ids,
    array_agg(number ORDER BY LENGTH(number) ASC) as numbers,
    array_agg(name) as names
  FROM "Contacts"
  WHERE "profilePicUrl" IS NOT NULL 
    AND "profilePicUrl" NOT LIKE '%nopicture%'
    AND "isGroup" = false
  GROUP BY "profilePicUrl"
  HAVING COUNT(*) > 1
),
contact_mapping AS (
  SELECT 
    d."profilePicUrl",
    d.contact_ids[1] as keep_id,  -- ID mais antigo (correto)
    unnest(d.contact_ids[2:array_length(d.contact_ids, 1)]) as merge_id,  -- IDs duplicados
    d.numbers[1] as correct_number,  -- Número mais curto (correto)
    d.contact_ids,
    d.numbers
  FROM duplicates d
  WHERE array_length(d.contact_ids, 1) > 1
)
SELECT 
  cm.keep_id as "ID_Manter",
  cm.merge_id as "ID_Duplicado",
  c1.name as "Nome_Principal",
  c1.number as "Numero_Principal",
  c2.name as "Nome_Duplicado",
  c2.number as "Numero_Duplicado",
  LENGTH(c2.number) as "Tamanho_Num_Dup",
  cm."profilePicUrl" as "Foto"
FROM contact_mapping cm
JOIN "Contacts" c1 ON c1.id = cm.keep_id
JOIN "Contacts" c2 ON c2.id = cm.merge_id
ORDER BY cm.keep_id;

-- ============================================================================
-- PASSO 2: Ver quantas mensagens serão afetadas
-- ============================================================================
WITH duplicates AS (
  SELECT 
    "profilePicUrl",
    array_agg(id ORDER BY "createdAt" ASC) as contact_ids
  FROM "Contacts"
  WHERE "profilePicUrl" IS NOT NULL 
    AND "profilePicUrl" NOT LIKE '%nopicture%'
    AND "isGroup" = false
  GROUP BY "profilePicUrl"
  HAVING COUNT(*) > 1
),
contact_mapping AS (
  SELECT 
    d.contact_ids[1] as keep_id,
    unnest(d.contact_ids[2:array_length(d.contact_ids, 1)]) as merge_id
  FROM duplicates d
)
SELECT 
  cm.merge_id as "Contato_Duplicado",
  COUNT(t.id) as "Total_Tickets",
  COUNT(m.id) as "Total_Mensagens"
FROM contact_mapping cm
LEFT JOIN "Tickets" t ON t."contactId" = cm.merge_id
LEFT JOIN "Messages" m ON m."contactId" = cm.merge_id
GROUP BY cm.merge_id
ORDER BY "Total_Mensagens" DESC;

-- ============================================================================
-- PASSO 3: CONSOLIDAÇÃO (executar apenas após revisar os passos 1 e 2)
-- ============================================================================
-- ATENÇÃO: Este comando IRÁ MODIFICAR O BANCO DE DADOS!
-- Revise cuidadosamente antes de executar
-- ============================================================================

-- DESCOMENTE AS LINHAS ABAIXO PARA EXECUTAR A CONSOLIDAÇÃO:

/*
BEGIN;

-- Criar tabela temporária com mapeamento
CREATE TEMP TABLE contact_consolidation AS
WITH duplicates AS (
  SELECT 
    "profilePicUrl",
    array_agg(id ORDER BY "createdAt" ASC) as contact_ids,
    array_agg(number ORDER BY LENGTH(number) ASC) as numbers
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
  d.numbers[1] as correct_number
FROM duplicates d;

-- 1. Atualizar Tickets para apontar para o contato correto
UPDATE "Tickets" t
SET "contactId" = cc.keep_id
FROM contact_consolidation cc
WHERE t."contactId" = cc.merge_id;

-- 2. Atualizar Messages para apontar para o contato correto
UPDATE "Messages" m
SET "contactId" = cc.keep_id
FROM contact_consolidation cc
WHERE m."contactId" = cc.merge_id;

-- 3. Salvar números inválidos (LIDs) no campo remoteJid do contato principal
UPDATE "Contacts" c
SET "remoteJid" = c_dup.number
FROM contact_consolidation cc
JOIN "Contacts" c_dup ON c_dup.id = cc.merge_id
WHERE c.id = cc.keep_id
  AND LENGTH(c_dup.number) > 15;

-- 4. Remover contatos duplicados (agora vazios)
DELETE FROM "Contacts" c
USING contact_consolidation cc
WHERE c.id = cc.merge_id;

-- Mostrar resultado
SELECT 
  'Consolidação concluída!' as status,
  COUNT(DISTINCT keep_id) as "Contatos_Mantidos",
  COUNT(DISTINCT merge_id) as "Contatos_Removidos"
FROM contact_consolidation;

COMMIT;
*/

-- ============================================================================
-- PASSO 4: Verificação pós-consolidação (executar após o COMMIT)
-- ============================================================================
/*
-- Ver contatos que ainda têm números grandes
SELECT 
  id,
  name,
  number,
  LENGTH(number) as tamanho,
  "remoteJid",
  "profilePicUrl"
FROM "Contacts"
WHERE LENGTH(number) > 15
ORDER BY LENGTH(number) DESC;

-- Ver contatos com remoteJid preenchido
SELECT 
  id,
  name,
  number,
  "remoteJid"
FROM "Contacts"
WHERE "remoteJid" IS NOT NULL
LIMIT 20;
*/
