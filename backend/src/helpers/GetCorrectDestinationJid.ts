import Ticket from "../models/Ticket";
import Message from "../models/Message";
import { logger } from "../utils/logger";
import { jidNormalizedUser } from "@whiskeysockets/baileys";
import LIDMappingService from "../services/LIDMappingService";

/**
 * Obtém o JID correto para enviar mensagens ao usuário, respeitando:
 * 1. Participant (se existir) - grupos ou mensagens específicas
 * 2. RemoteJid da última mensagem recebida - incluindo @lid
 * 3. ticket.lastRemoteJid salvo anteriormente
 * 4. Fallback: contact.number@s.whatsapp.net
 * 
 * IMPORTANTE: Isso resolve o problema de LIDs, garantindo que respostas
 * sejam enviadas para o mesmo JID que o usuário usou para nos contatar
 */
export async function getCorrectDestinationJid(
  ticket: Ticket
): Promise<string> {
  logger.info(`[GET-DEST-JID] 🎯 Obtendo JID correto para ticket ${ticket.id}`);
  
  // ESTRATÉGIA 1: Buscar última mensagem RECEBIDA (não fromMe) do ticket
  const lastIncomingMessage = await Message.findOne({
    where: {
      ticketId: ticket.id,
      fromMe: false
    },
    order: [['createdAt', 'DESC']],
    limit: 1
  });

  if (lastIncomingMessage) {
    // PRIORIDADE 1: Se tem participant E NÃO é grupo, usar ele
    // Para GRUPOS, devemos IGNORAR participant e usar remoteJid (ID do grupo)
    if (lastIncomingMessage.participant && !ticket.isGroup) {
      const normalizedParticipant = jidNormalizedUser(lastIncomingMessage.participant);
      logger.info(`[GET-DEST-JID] ✅ Usando PARTICIPANT da última msg: ${normalizedParticipant}`);
      logger.info(`[GET-DEST-JID]   Msg ID: ${lastIncomingMessage.id}`);
      logger.info(`[GET-DEST-JID]   Criada em: ${lastIncomingMessage.createdAt}`);
      return normalizedParticipant;
    }

    // PRIORIDADE 2: Usar remoteJid da última mensagem recebida (INCLUINDO @lid!)
    if (lastIncomingMessage.remoteJid) {
      logger.info(`[GET-DEST-JID] ✅ Usando REMOTE_JID da última msg: ${lastIncomingMessage.remoteJid}`);
      logger.info(`[GET-DEST-JID]   Msg ID: ${lastIncomingMessage.id}`);
      logger.info(`[GET-DEST-JID]   Criada em: ${lastIncomingMessage.createdAt}`);
      
      // Verificar se é LID e tentar usar número real ao invés
      if (lastIncomingMessage.remoteJid.includes('@lid')) {
        logger.warn(`[GET-DEST-JID] ⚠️ JID é um LID (WhatsApp Web/Business)`);
        logger.warn(`[GET-DEST-JID]   LID original: ${lastIncomingMessage.remoteJid}`);
        
        // ESTRATÉGIA 2.1: Buscar mapeamento LID→PN no LIDMappingService
        logger.info(`[GET-DEST-JID]   🔍 Buscando mapeamento LID→PN...`);
        const phoneNumber = await LIDMappingService.getPhoneNumberForLID(
          lastIncomingMessage.remoteJid,
          ticket.companyId
        );
        
        if (phoneNumber) {
          logger.info(`[GET-DEST-JID] ✅ Mapeamento encontrado! Usando PN: ${phoneNumber}`);
          return phoneNumber;
        }
        
        logger.warn(`[GET-DEST-JID]   ⚠️ Nenhum mapeamento LID→PN encontrado`);
        
        // ESTRATÉGIA 2.2: Verificar alternativeJid do contato
        if (ticket.contact.alternativeJid) {
          logger.info(`[GET-DEST-JID] ✅ Usando alternativeJid do contato: ${ticket.contact.alternativeJid}`);
          return ticket.contact.alternativeJid;
        }
        
        // ESTRATÉGIA 2.3: Tentar usar número real do contato
        logger.warn(`[GET-DEST-JID]   Tentando usar número real do contato...`);
        
        if (ticket.contact.number && 
            ticket.contact.number.length >= 10 && 
            !ticket.contact.number.startsWith('WEB_')) {
          const realNumber = ticket.contact.number.replace(/\D/g, '');
          const realJid = `${realNumber}@s.whatsapp.net`;
          logger.info(`[GET-DEST-JID] ✅ Usando número real: ${realJid}`);
          return realJid;
        } else {
          logger.error(`[GET-DEST-JID] ❌ Número do contato inválido: ${ticket.contact.number || 'NULL'}`);
          logger.error(`[GET-DEST-JID]   Não é possível enviar - contato precisa mandar msg do celular!`);
          logger.error(`[GET-DEST-JID]   🚫 ENVIANDO PARA LID (pode falhar se device foi removido)`);
          // Como último recurso, tentar enviar para o LID mesmo (pode não funcionar)
          return lastIncomingMessage.remoteJid;
        }
      }
      
      return lastIncomingMessage.remoteJid;
    }
  }

  // ESTRATÉGIA 2: Usar lastRemoteJid salvo no ticket
  if (ticket.lastRemoteJid) {
    logger.info(`[GET-DEST-JID] ✅ Usando LAST_REMOTE_JID do ticket: ${ticket.lastRemoteJid}`);
    return ticket.lastRemoteJid;
  }

  // ESTRATÉGIA 3: Verificar remoteJid do próprio contato
  if (ticket.contact.remoteJid) {
    logger.info(`[GET-DEST-JID] ✅ Usando REMOTE_JID do contato: ${ticket.contact.remoteJid}`);
    return ticket.contact.remoteJid;
  }

  // ESTRATÉGIA 4 (FALLBACK): Usar número do contato com sufixo padrão
  const isGroup = ticket.isGroup;
  const suffix = isGroup ? '@g.us' : '@s.whatsapp.net';
  const fallbackJid = `${ticket.contact.number}${suffix}`;
  
  logger.warn(`[GET-DEST-JID] ⚠️ FALLBACK: Usando número do contato: ${fallbackJid}`);
  logger.warn(`[GET-DEST-JID]   Nenhuma mensagem recebida anterior encontrada`);
  logger.warn(`[GET-DEST-JID]   Isso pode falhar se contato for LID ou número inválido`);
  
  return fallbackJid;
}

/**
 * Helper para validar se um número/JID é válido para envio
 * Retorna false se for LID com número temporário ou número inválido
 */
export function isValidNumberForSending(number: string, isGroup: boolean = false): boolean {
  // Verificar se é identificador temporário "somente leitura"
  if (number.startsWith('WEB_') && number.includes('_READONLY')) {
    logger.error(`[VALIDATE-NUMBER] ❌ Número é identificador temporário: ${number}`);
    return false;
  }

  // Verificar se é identificador LID antigo
  if (number.startsWith('LID_')) {
    logger.error(`[VALIDATE-NUMBER] ❌ Número é identificador LID antigo: ${number}`);
    return false;
  }

  // Extrair apenas dígitos
  const cleanNumber = number.replace(/\D/g, '');
  
  // Validar tamanho
  // Grupos: 15-20 dígitos (IDs de grupos são mais longos)
  // Contatos: 10-15 dígitos (números de telefone válidos)
  const minLength = isGroup ? 15 : 10;
  const maxLength = isGroup ? 20 : 15;
  
  if (cleanNumber.length < minLength || cleanNumber.length > maxLength) {
    logger.error(`[VALIDATE-NUMBER] ❌ Número tem tamanho inválido: ${cleanNumber} (${cleanNumber.length} dígitos)`);
    logger.error(`[VALIDATE-NUMBER]   Tipo: ${isGroup ? 'GRUPO' : 'CONTATO'} (esperado ${minLength}-${maxLength} dígitos)`);
    return false;
  }

  return true;
}
