# 📦 Sistema de Backup e Reversão

## 🎯 Objetivo

Garantir segurança total antes de aplicar correções nos dados do banco de dados, permitindo reversão completa em caso de problemas.

---

## 📋 Arquivos Disponíveis

### 1. `backup-before-fix.sql` 
**Propósito**: Criar backup completo antes de qualquer alteração

**O que faz**:
- ✅ Backup completo da tabela `Contacts`
- ✅ Backup completo da tabela `Tickets` 
- ✅ Backup completo da tabela `Messages`
- ✅ Backup específico dos contatos com nomes inválidos
- ✅ Backup específico dos contatos duplicados
- ✅ Verificação automática da integridade dos backups

**Tabelas criadas**:
```
Contacts_BACKUP_20241220
Tickets_BACKUP_20241220
Messages_BACKUP_20241220
Contacts_InvalidNames_BACKUP_20241220
Contacts_Duplicates_BACKUP_20241220
```

---

### 2. `rollback-changes.sql`
**Propósito**: Reverter todas as alterações para o estado anterior

**O que faz**:
- 🔍 Verifica se os backups existem antes de prosseguir
- 💾 Cria backup do estado atual (antes de reverter)
- ♻️ Restaura `Contacts` do backup
- ♻️ Restaura `Tickets` do backup
- ♻️ Restaura `Messages` do backup
- ✅ Verifica integridade dos dados restaurados
- ✅ Valida foreign keys

**Segurança**:
- ⚠️ Cancela operação se backups não existirem
- 💾 Salva estado atual antes de reverter em `*_BEFORE_ROLLBACK_20241220`
- 🔗 Reconecta todas as foreign keys automaticamente

---

### 3. `fix-contact-names.sql`
**Propósito**: Corrigir nomes inválidos nos contatos

**Aplica após backup!**

---

### 4. `fix-lid-contacts.sql`
**Propósito**: Consolidar contatos duplicados por LID

**Aplica após backup!**

---

## 🚀 Fluxo de Execução Seguro

### Passo 1: Criar Backup
```bash
# No PostgreSQL
\i /home/deploy/remotenyx/backend/scripts/backup-before-fix.sql
```

**Resultado esperado**:
```
✅ BACKUP OK para Contacts (ex: 1523 registros)
✅ BACKUP OK para Tickets (ex: 4521 registros)
✅ BACKUP OK para Messages (ex: 15234 registros)
✅ Backup completo realizado com sucesso!
```

### Passo 2: Aplicar Correções
```bash
# Corrigir nomes
\i /home/deploy/remotenyx/backend/scripts/fix-contact-names.sql

# Consolidar duplicados
\i /home/deploy/remotenyx/backend/scripts/fix-lid-contacts.sql
```

### Passo 3: Testar Sistema
```bash
# Reiniciar backend
pm2 restart remotenyx-backend

# Monitorar logs
pm2 logs remotenyx-backend | grep "CONTACT"

# Testar funcionalidades:
# - Receber mensagens WhatsApp Web
# - Criar novos contatos
# - Enviar mensagens
```

### Passo 4A: Se Tudo OK ✅
```sql
-- Depois de 48h de testes bem-sucedidos, limpar backups
DROP TABLE IF EXISTS "Contacts_BACKUP_20241220";
DROP TABLE IF EXISTS "Tickets_BACKUP_20241220";
DROP TABLE IF EXISTS "Messages_BACKUP_20241220";
DROP TABLE IF EXISTS "Contacts_InvalidNames_BACKUP_20241220";
DROP TABLE IF EXISTS "Contacts_Duplicates_BACKUP_20241220";
```

### Passo 4B: Se Houver Problemas ❌
```bash
# Reverter tudo imediatamente
\i /home/deploy/remotenyx/backend/scripts/rollback-changes.sql

# Reiniciar backend
pm2 restart remotenyx-backend
```

---

## 🔍 Comandos de Verificação

### Verificar se backups existem:
```sql
SELECT 
    tablename, 
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables 
WHERE tablename LIKE '%BACKUP_20241220%'
ORDER BY tablename;
```

### Comparar dados atual vs backup:
```sql
-- Quantidade de registros
SELECT 
    'Atual' as fonte, 
    COUNT(*) as total_contacts 
FROM "Contacts"
UNION ALL
SELECT 
    'Backup' as fonte, 
    COUNT(*) as total_contacts 
FROM "Contacts_BACKUP_20241220";
```

### Verificar integridade após rollback:
```sql
-- Foreign keys órfãs
SELECT COUNT(*) as tickets_orfaos
FROM "Tickets" t
LEFT JOIN "Contacts" c ON t."contactId" = c.id
WHERE c.id IS NULL;
```

---

## ⚠️ Avisos Importantes

1. **Espaço em Disco**: Os backups ocupam aproximadamente o mesmo espaço das tabelas originais. Certifique-se de ter espaço suficiente.

2. **Tempo de Execução**: 
   - Backup: ~10-30 segundos (dependendo do volume)
   - Rollback: ~20-60 segundos (dependendo do volume)

3. **Não Execute em Produção com Tráfego Alto**: Idealmente, execute durante horário de menor uso.

4. **Backup Externo**: Considere também fazer dump do PostgreSQL:
   ```bash
   pg_dump -U postgres -d remotenyx > backup_20241220.sql
   ```

5. **Teste o Rollback**: Após criar backups, você pode testar o script de rollback em ambiente de desenvolvimento primeiro.

---

## 🆘 Troubleshooting

### Problema: "Backup não encontrado"
**Solução**: Execute `backup-before-fix.sql` primeiro

### Problema: "Foreign key constraint failed"
**Solução**: O script de rollback já trata disso, mas se persistir:
```sql
ALTER TABLE "Tickets" DROP CONSTRAINT IF EXISTS "Tickets_contactId_fkey";
ALTER TABLE "Messages" DROP CONSTRAINT IF EXISTS "Messages_contactId_fkey";
-- Execute o rollback novamente
```

### Problema: "Não há espaço em disco"
**Solução**: Limpe backups antigos ou logs desnecessários:
```bash
# Verificar uso de disco
df -h

# Limpar logs do PM2
pm2 flush

# Remover backups antigos (se existirem)
DROP TABLE IF EXISTS "Contacts_BACKUP_20241219";
```

---

## 📊 Estatísticas do Backup

Após executar o backup, você verá:

```
====================================
📦 RESUMO DO BACKUP
====================================
tabela        | registros_backup
--------------+-----------------
Contacts      |            1523
Tickets       |            4521
Messages      |           15234
InvalidNames  |              87
Duplicates    |              24
====================================
✅ Backup completo realizado com sucesso!
Data: 2024-12-20 14:23:45.123456
====================================
```

---

## 🎓 Conclusão

Este sistema garante:
- ✅ **Zero perda de dados** - Todos os dados são preservados
- ✅ **Reversão rápida** - Rollback em menos de 1 minuto
- ✅ **Verificação automática** - Integridade validada automaticamente
- ✅ **Rastreabilidade** - Todos os estados são preservados

**Boa prática**: Sempre execute `backup-before-fix.sql` antes de qualquer alteração em produção! 🚀
