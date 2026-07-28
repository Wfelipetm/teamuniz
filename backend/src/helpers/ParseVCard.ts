import { logger } from "../utils/logger";

/**
 * Interface para dados extraídos de um vCard
 */
interface VCardData {
  name: string;
  phones: Array<{
    number: string;
    waid?: string;
    label?: string;
  }>;
  emails?: string[];
  organization?: string;
}

/**
 * Parse de vCard para extrair informações de contato
 * Converte formato RAW vCard para texto legível
 * 
 * Exemplo entrada:
 * BEGIN:VCARD
 * VERSION:3.0
 * N:Brasil;Maria de León;Acevedo;;
 * FN:Maria de León Acevedo Brasil
 * item1.TEL;waid=573024624623:+57 302 4624623
 * item1.X-ABLabel:Celular
 * END:VCARD
 * 
 * Exemplo saída:
 * 📇 Maria de León Acevedo Brasil
 * 📱 +57 302 4624623 (Celular)
 */
export function parseVCard(vcard: string): string {
  try {
    if (!vcard || typeof vcard !== 'string') {
      return '📇 Contato compartilhado';
    }

    logger.info(`[VCARD-PARSE] 🔍 Parseando vCard...`);
    
    const lines = vcard.split('\n').map(line => line.trim());
    const data: VCardData = {
      name: '',
      phones: []
    };

    // Extrair nome completo (FN - Formatted Name)
    const fnLine = lines.find(line => line.startsWith('FN:'));
    if (fnLine) {
      data.name = fnLine.replace('FN:', '').trim();
    }

    // Fallback: extrair nome do campo N (Name)
    if (!data.name) {
      const nLine = lines.find(line => line.startsWith('N:'));
      if (nLine) {
        // Formato: N:Sobrenome;Nome;NomeMeio;Prefixo;Sufixo
        const nameParts = nLine.replace('N:', '').split(';').filter(p => p.trim());
        // Reorganizar: Nome NomeMeio Sobrenome
        data.name = [nameParts[1], nameParts[2], nameParts[0]]
          .filter(p => p)
          .join(' ')
          .trim();
      }
    }

    // Extrair telefones
    const telLines = lines.filter(line => 
      line.includes('TEL') || 
      line.startsWith('item') && line.includes('TEL')
    );

    for (const telLine of telLines) {
      const phone: any = {};
      
      // Extrair waid (WhatsApp ID)
      const waidMatch = telLine.match(/waid=(\d+)/);
      if (waidMatch) {
        phone.waid = waidMatch[1];
      }

      // Extrair número
      const numberMatch = telLine.match(/:([+\d\s\-()]+)$/);
      if (numberMatch) {
        phone.number = numberMatch[1].trim();
      }

      // Extrair label (tipo de telefone)
      const itemMatch = telLine.match(/^item(\d+)\./);
      if (itemMatch) {
        const itemNum = itemMatch[1];
        const labelLine = lines.find(line => 
          line.startsWith(`item${itemNum}.X-ABLabel:`)
        );
        if (labelLine) {
          phone.label = labelLine.replace(`item${itemNum}.X-ABLabel:`, '').trim();
        }
      }

      if (phone.number) {
        data.phones.push(phone);
      }
    }

    // Extrair emails
    const emailLines = lines.filter(line => line.startsWith('EMAIL:'));
    if (emailLines.length > 0) {
      data.emails = emailLines.map(line => line.replace('EMAIL:', '').trim());
    }

    // Extrair organização
    const orgLine = lines.find(line => line.startsWith('ORG:'));
    if (orgLine) {
      data.organization = orgLine.replace('ORG:', '').trim();
    }

    // Formatar saída legível
    return formatVCardData(data);

  } catch (error) {
    logger.error(`[VCARD-PARSE] ❌ Erro ao parsear vCard:`, error);
    return '📇 Contato compartilhado (erro ao processar)';
  }
}

/**
 * Formata dados extraídos do vCard para exibição legível
 */
function formatVCardData(data: VCardData): string {
  const lines: string[] = [];

  // Nome
  if (data.name) {
    lines.push(`📇 ${data.name}`);
  } else {
    lines.push('📇 Contato compartilhado');
  }

  // Telefones
  if (data.phones.length > 0) {
    for (const phone of data.phones) {
      let phoneLine = `📱 ${phone.number}`;
      
      // Adicionar label se existir
      if (phone.label) {
        phoneLine += ` (${phone.label})`;
      }
      
      // Adicionar WhatsApp ID se existir
      if (phone.waid) {
        phoneLine += ` • WhatsApp: ${phone.waid}`;
      }
      
      lines.push(phoneLine);
    }
  }

  // Organização
  if (data.organization) {
    lines.push(`🏢 ${data.organization}`);
  }

  // Emails
  if (data.emails && data.emails.length > 0) {
    for (const email of data.emails) {
      lines.push(`📧 ${email}`);
    }
  }

  const result = lines.join('\n');
  
  logger.info(`[VCARD-PARSE] ✅ vCard formatado:`);
  logger.info(`[VCARD-PARSE]   ${result.replace(/\n/g, '\n[VCARD-PARSE]   ')}`);
  
  return result;
}

/**
 * Verifica se uma string é um vCard válido
 */
export function isVCard(content: string): boolean {
  if (!content || typeof content !== 'string') {
    return false;
  }
  
  return content.includes('BEGIN:VCARD') && content.includes('END:VCARD');
}

/**
 * Extrai apenas o número de telefone de um vCard (para uso em automações)
 */
export function extractPhoneFromVCard(vcard: string): string | null {
  try {
    const lines = vcard.split('\n').map(line => line.trim());
    
    // Buscar linha com waid (WhatsApp ID) - mais confiável
    const waidLine = lines.find(line => line.includes('waid='));
    if (waidLine) {
      const waidMatch = waidLine.match(/waid=(\d+)/);
      if (waidMatch) {
        return waidMatch[1];
      }
    }

    // Fallback: extrair primeiro número encontrado
    const telLine = lines.find(line => line.includes('TEL'));
    if (telLine) {
      const numberMatch = telLine.match(/:([+\d\s\-()]+)$/);
      if (numberMatch) {
        // Limpar formatação
        return numberMatch[1].replace(/[^\d+]/g, '');
      }
    }

    return null;
  } catch (error) {
    logger.error(`[VCARD-PARSE] ❌ Erro ao extrair telefone:`, error);
    return null;
  }
}
