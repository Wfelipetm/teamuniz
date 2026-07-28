import { WAMessage } from "@whiskeysockets/baileys";
import WALegacySocket from "@whiskeysockets/baileys"
import * as Sentry from "@sentry/node";
import AppError from "../../errors/AppError";
import GetTicketWbot from "../../helpers/GetTicketWbot";
import { getCorrectDestinationJid, isValidNumberForSending } from "../../helpers/GetCorrectDestinationJid";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";

import formatBody from "../../helpers/Mustache";
import { logger } from "../../utils/logger";

interface Request {
  body: string;
  ticket: Ticket;
  quotedMsg?: Message;
}

const SendWhatsAppMessage = async ({
  body,
  ticket,
  quotedMsg
}: Request): Promise<WAMessage> => {
  let options = {};
  const wbot = await GetTicketWbot(ticket);
  
  // ============================================================================
  // OBTER JID CORRETO PARA ENVIO - Respeitando LIDs e números reais
  // ============================================================================
  logger.info(`[SEND-MSG] 📤 Preparando envio de mensagem`);
  logger.info(`[SEND-MSG]   Ticket ID: ${ticket.id}`);
  logger.info(`[SEND-MSG]   Contato ID: ${ticket.contact.id}`);
  logger.info(`[SEND-MSG]   Contato Nome: ${ticket.contact.name}`);
  logger.info(`[SEND-MSG]   Contato Número: ${ticket.contact.number || 'NULL (LID-only)'}`);
  logger.info(`[SEND-MSG]   Contato RemoteJid: ${ticket.contact.remoteJid || 'N/A'}`);
  logger.info(`[SEND-MSG]   Contato AddressingMode: ${ticket.contact.addressingMode || 'N/A'}`);
  logger.info(`[SEND-MSG]   É Grupo: ${ticket.isGroup ? 'SIM' : 'NÃO'}`);
  
  // Validação: Verificar se o número do contato é válido para envio
  // EXCEÇÃO: Permitir contatos sem número (null) se forem LID-only
  // Neste caso, getCorrectDestinationJid tentará usar mapeamento LID→PN
  const isLIDOnly = !ticket.contact.number && ticket.contact.addressingMode === 'lid';
  
  if (!isLIDOnly && !isValidNumberForSending(ticket.contact.number, ticket.isGroup)) {
    logger.error(`[SEND-MSG] ❌ ERRO: Número do contato inválido para envio`);
    logger.error(`[SEND-MSG]   Contato ID: ${ticket.contact.id}`);
    logger.error(`[SEND-MSG]   Nome: ${ticket.contact.name}`);
    logger.error(`[SEND-MSG]   Número: ${ticket.contact.number}`);
    logger.error(`[SEND-MSG]   É Grupo: ${ticket.isGroup ? 'SIM' : 'NÃO'}`);
    logger.error(`[SEND-MSG]   RemoteJid: ${ticket.contact.remoteJid || 'N/A'}`);
    logger.error(`[SEND-MSG]   `);
    logger.error(`[SEND-MSG] ℹ️ EXPLICAÇÃO:`);
    logger.error(`[SEND-MSG]   Este contato foi criado a partir de uma mensagem do WhatsApp Web`);
    logger.error(`[SEND-MSG]   LIDs (Local Identifiers) servem apenas para RECEBER mensagens`);
    logger.error(`[SEND-MSG]   Não é possível ENVIAR mensagens de volta para um LID via número`);
    logger.error(`[SEND-MSG]   `);
    logger.error(`[SEND-MSG] 💡 SOLUÇÃO:`);
    logger.error(`[SEND-MSG]   O sistema tentará usar o remoteJid correto automaticamente`);
    logger.error(`[SEND-MSG]   Se não houver remoteJid, peça ao contato para enviar msg do celular`);
  }
  
  // Obter JID correto (prioriza última msg recebida, incluindo LIDs)
  const destinationJid = await getCorrectDestinationJid(ticket);
  
  logger.info(`[SEND-MSG] ✅ JID de destino determinado: ${destinationJid}`);
  
  if (destinationJid.includes('@lid')) {
    logger.warn(`[SEND-MSG] ⚠️ Enviando para LID (WhatsApp Web/Business)`);
    logger.warn(`[SEND-MSG]   O usuário está usando WhatsApp Web ou Business`);
    logger.warn(`[SEND-MSG]   Mensagem será enviada para o dispositivo específico`);
  }

  logger.info(`[SEND-MSG] 📨 Enviando mensagem para: ${destinationJid}`);

  if (quotedMsg) {
      const chatMessages = await Message.findOne({
        where: {
          id: quotedMsg.id
        }
      });

      if (chatMessages) {
        const msgFound = JSON.parse(chatMessages.dataJson);

        options = {
          quoted: {
            key: msgFound.key,
            message: {
              extendedTextMessage: msgFound.message.extendedTextMessage
            }
          }
        };
      }
    
  }

  try {
    const sentMessage = await wbot.sendMessage(destinationJid,{
        text: formatBody(body, ticket.contact)
      },
      {
        ...options
      }
    );

    await ticket.update({ lastMessage: formatBody(body, ticket.contact) });
    
    logger.info(`[SEND-MSG] ✅ Mensagem enviada com sucesso!`);
    logger.info(`[SEND-MSG]   Message ID: ${sentMessage.key.id}`);
    logger.info(`[SEND-MSG]   Destination: ${destinationJid}`);
    
    return sentMessage;
  } catch (err) {
    Sentry.captureException(err);
    logger.error(`[SEND-MSG] ❌ Erro ao enviar mensagem:`);
    logger.error(`[SEND-MSG]   ${err}`);
    throw new AppError("ERR_SENDING_WAPP_MSG");
  }
};

export default SendWhatsAppMessage;
