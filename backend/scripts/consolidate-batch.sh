#!/bin/bash
# Consolidação em lote de duplicados por nome

PGPASSWORD=123456
export PGPASSWORD

# Buscar top 20 nomes duplicados com LID
psql -U remotenyx -d remotenyx -h localhost -t << 'SQL' | while read -r name count; do
    [ -z "$name" ] && continue
    
    echo "Processando: $name ($count duplicados)"
    
    # Consolidar esse nome específico
    psql -U remotenyx -d remotenyx -h localhost << EOF
BEGIN;

WITH contacts AS (
    SELECT id, number, LENGTH(number) as len
    FROM "Contacts"
    WHERE name = '$name' AND "isGroup" = false
    ORDER BY LENGTH(number), "createdAt"
),
keep AS (SELECT id FROM contacts WHERE len <= 13 LIMIT 1),
merge AS (SELECT id FROM contacts WHERE len > 14)
UPDATE "Messages" m SET "contactId" = (SELECT id FROM keep)
WHERE m."contactId" IN (SELECT id FROM merge);

DELETE FROM "Tickets" WHERE "contactId" IN (
    SELECT id FROM "Contacts" 
    WHERE name = '$name' AND LENGTH(number) > 14
);

DELETE FROM "Contacts" 
WHERE name = '$name' AND LENGTH(number) > 14;

COMMIT;
EOF
    
    echo "✅ $name consolidado"
    sleep 1
done

SELECT name, COUNT(*) as cnt
FROM "Contacts"
WHERE "isGroup" = false
  AND name IN (
    SELECT name FROM "Contacts"
    WHERE LENGTH(number) > 14
    GROUP BY name
    HAVING COUNT(*) > 1
  )
GROUP BY name
ORDER BY COUNT(*) DESC
LIMIT 20;
SQL

echo "🎉 Consolidação concluída!"
