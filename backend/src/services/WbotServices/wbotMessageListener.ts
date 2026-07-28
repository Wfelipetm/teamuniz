import path, { join } from "path";
import { promisify } from "util";
import { readFile, writeFile } from "fs";
import * as Sentry from "@sentry/node";
import { isNil, isNull, head } from "lodash";
import { extension as mimeExtension } from "mime-types";

import {
  downloadMediaMessage,
  extractMessageContent,
  getContentType,
  jidNormalizedUser,
  MessageUpsertType,
  proto,
  WAMessage,
  WAMessageStubType,
  WAMessageUpdate,
  WASocket
} from "@whiskeysockets/baileys";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";

import { getIO } from "../../libs/socket";
import CreateMessageService from "../MessageServices/CreateMessageService";
import { logger } from "../../utils/logger";
import CreateOrUpdateContactService from "../ContactServices/CreateOrUpdateContactService";
import LidMappingService from "../ContactServices/LidMappingService";
import FindOrCreateTicketService from "../TicketServices/FindOrCreateTicketService";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import formatBody from "../../helpers/Mustache";
import { Store } from "../../libs/store";
import TicketTraking from "../../models/TicketTraking";
import UserRating from "../../models/UserRating";
import SendWhatsAppMessage from "./SendWhatsAppMessage";
import moment from "moment";
import Queue from "../../models/Queue";
import QueueOption from "../../models/QueueOption";
import FindOrCreateATicketTrakingService from "../TicketServices/FindOrCreateATicketTrakingService";
import VerifyCurrentSchedule from "../CompanyService/VerifyCurrentSchedule";
import Campaign from "../../models/Campaign";
import CampaignShipping from "../../models/CampaignShipping";
import { Op } from "sequelize";
import { campaignQueue, parseToMilliseconds, randomValue } from "../../queues";
import User from "../../models/User";
import Setting from "../../models/Setting";
import { cacheLayer } from "../../libs/cache";
import { provider } from "./providers";
import { debounce } from "../../helpers/Debounce";
import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from "openai";
import ffmpeg from "fluent-ffmpeg";
import {
  SpeechConfig,
  SpeechSynthesizer,
  AudioConfig
} from "microsoft-cognitiveservices-speech-sdk";
import typebotListener from "../TypebotServices/typebotListener";
import QueueIntegrations from "../../models/QueueIntegrations";
import ShowQueueIntegrationService from "../QueueIntegrationServices/ShowQueueIntegrationService";

import { FlowBuilderModel } from "../../models/FlowBuilder";
import { FlowDefaultModel } from "../../models/FlowDefault";
import { FlowCampaignModel } from "../../models/FlowCampaign";
import { IOpenAi } from "../../@types/openai";

import { IConnections, INodes } from "../WebhookService/DispatchWebHookService";
import { ActionsWebhookService } from "../WebhookService/ActionsWebhookService";
import { WebhookModel } from "../../models/Webhook";

import {differenceInMilliseconds} from "date-fns";
import Whatsapp from "../../models/Whatsapp";
import { parseVCard } from "../../helpers/ParseVCard";
import LIDMappingService from "../LIDMappingService";

const request = require("request");

const fs = require("fs");

type Session = WASocket & {
  id?: number;
  store?: Store;
};

interface SessionOpenAi extends OpenAIApi {
  id?: number;
}
const sessionsOpenAi: SessionOpenAi[] = [];

interface ImessageUpsert {
  messages: proto.IWebMessageInfo[];
  type: MessageUpsertType;
}

interface IMe {
  name: string;
  id: string;
}

interface IMessage {
  messages: WAMessage[];
  isLatest: boolean;
}

export const isNumeric = (value: string) => /^-?\d+$/.test(value);

const writeFileAsync = promisify(writeFile);

// Função para otimizar o JSON das mensagens e evitar vazamentos de memória
const optimizeMessageJson = (msg: proto.IWebMessageInfo): string => {
  try {
    const optimizedMsg = {
      key: msg.key,
      messageTimestamp: msg.messageTimestamp,
      status: msg.status,
      message: msg.message ? {
        conversation: msg.message.conversation,
        extendedTextMessage: msg.message.extendedTextMessage ? {
          text: msg.message.extendedTextMessage.text,
          contextInfo: msg.message.extendedTextMessage.contextInfo
        } : undefined,
        imageMessage: msg.message.imageMessage ? {
          caption: msg.message.imageMessage.caption,
          mimetype: msg.message.imageMessage.mimetype,
          url: msg.message.imageMessage.url
        } : undefined,
        videoMessage: msg.message.videoMessage ? {
          caption: msg.message.videoMessage.caption,
          mimetype: msg.message.videoMessage.mimetype
        } : undefined,
        audioMessage: msg.message.audioMessage ? {
          mimetype: msg.message.audioMessage.mimetype,
          ptt: msg.message.audioMessage.ptt
        } : undefined,
        documentMessage: msg.message.documentMessage ? {
          title: msg.message.documentMessage.title,
          fileName: msg.message.documentMessage.fileName,
          mimetype: msg.message.documentMessage.mimetype
        } : undefined
      } : undefined
    };
    
    // Remove campos undefined para economizar espaço
    return JSON.stringify(optimizedMsg, (key, value) => value === undefined ? null : value);
  } catch (error) {
    logger.error("Erro ao otimizar JSON da mensagem:", error);
    // Fallback para objeto mínimo
    return JSON.stringify({
      key: msg.key,
      messageTimestamp: msg.messageTimestamp,
      status: msg.status
    });
  }
};

const getTypeMessage = (msg: proto.IWebMessageInfo): string => {
  return getContentType(msg.message);
};

function hasCaption(title: string, fileName: string) {
  if(!title || !fileName) return false;

  const fileNameExtension = fileName.substring(fileName.lastIndexOf('.') + 1);

  return !fileName.includes(`${title}.${fileNameExtension}`)
}

export function validaCpfCnpj(val) {
  if (val.length == 11) {
    var cpf = val.trim();

    cpf = cpf.replace(/\./g, "");
    cpf = cpf.replace("-", "");
    cpf = cpf.split("");

    var v1 = 0;
    var v2 = 0;
    var aux = false;

    for (var i = 1; cpf.length > i; i++) {
      if (cpf[i - 1] != cpf[i]) {
        aux = true;
      }
    }

    if (aux == false) {
      return false;
    }

    for (var i = 0, p = 10; cpf.length - 2 > i; i++, p--) {
      v1 += cpf[i] * p;
    }

    v1 = (v1 * 10) % 11;

    if (v1 == 10) {
      v1 = 0;
    }

    if (v1 != cpf[9]) {
      return false;
    }

    for (var i = 0, p = 11; cpf.length - 1 > i; i++, p--) {
      v2 += cpf[i] * p;
    }

    v2 = (v2 * 10) % 11;

    if (v2 == 10) {
      v2 = 0;
    }

    if (v2 != cpf[10]) {
      return false;
    } else {
      return true;
    }
  } else if (val.length == 14) {
    var cnpj = val.trim();

    cnpj = cnpj.replace(/\./g, "");
    cnpj = cnpj.replace("-", "");
    cnpj = cnpj.replace("/", "");
    cnpj = cnpj.split("");

    var v1 = 0;
    var v2 = 0;
    var aux = false;

    for (var i = 1; cnpj.length > i; i++) {
      if (cnpj[i - 1] != cnpj[i]) {
        aux = true;
      }
    }

    if (aux == false) {
      return false;
    }

    for (var i = 0, p1 = 5, p2 = 13; cnpj.length - 2 > i; i++, p1--, p2--) {
      if (p1 >= 2) {
        v1 += cnpj[i] * p1;
      } else {
        v1 += cnpj[i] * p2;
      }
    }

    v1 = v1 % 11;

    if (v1 < 2) {
      v1 = 0;
    } else {
      v1 = 11 - v1;
    }

    if (v1 != cnpj[12]) {
      return false;
    }

    for (var i = 0, p1 = 6, p2 = 14; cnpj.length - 1 > i; i++, p1--, p2--) {
      if (p1 >= 2) {
        v2 += cnpj[i] * p1;
      } else {
        v2 += cnpj[i] * p2;
      }
    }

    v2 = v2 % 11;

    if (v2 < 2) {
      v2 = 0;
    } else {
      v2 = 11 - v2;
    }

    if (v2 != cnpj[13]) {
      return false;
    } else {
      return true;
    }
  } else {
    return false;
  }
}

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function sleep(time) {
  await timeout(time);
}

/**
 * Captura e salva mapeamento LID ↔ Phone Number quando disponível
 * Baseado na documentação Baileys v7.0.0 - LIDMappingStore
 * 
 * Esta função detecta quando temos ambos LID e PN para o mesmo contato e salva o mapeamento
 * Casos de uso:
 * 1. Mensagem de grupo: participant (LID) vs participantAlt (PN)
 * 2. Contato atualizado: remoteJid (LID) vs alternativeJid (PN)
 * 3. Mensagem individual: remoteJid pode mudar de LID→PN quando usuário responde do celular
 */
const captureLIDMapping = async (
  msg: proto.IWebMessageInfo,
  contact: Contact,
  companyId: number
): Promise<void> => {
  try {
    const remoteJid = msg.key.remoteJid;
    const participant = msg.key.participant;
    const isGroup = remoteJid?.includes("@g.us");

    // CASO 1: Mensagem de grupo com participant (pode ter LID e PN)
    // Baileys v7.0.0: msg.userReceipt tem participant e participantAlt
    if (isGroup && participant) {
      const isParticipantLID = participant.includes("@lid") || participant.includes(":");
      
      // Verificar se temos alternativeJid (PN) no contato
      if (isParticipantLID && contact.alternativeJid && contact.alternativeJid.includes("@s.whatsapp.net")) {
        await LIDMappingService.createOrUpdateMapping({
          lid: participant,
          phoneNumber: contact.alternativeJid,
          companyId,
          contactId: contact.id,
          source: "group_message",
          metadata: {
            groupJid: remoteJid,
            timestamp: msg.messageTimestamp,
            pushName: msg.pushName
          }
        });
        logger.debug(`[LID-MAPPING] Caso1 grupo: ${participant} ↔ ${contact.alternativeJid}`);
      }
    }

    // CASO 2: Contato tem ambos remoteJid (LID) e alternativeJid (PN)
    // Isso acontece quando sistema já descobriu o número real de um contato LID
    if (contact.remoteJid && contact.alternativeJid) {
      const isRemoteJidLID = contact.remoteJid.includes("@lid") || 
                            (contact.remoteJid.includes(":") && !contact.remoteJid.includes("@g.us"));
      const isAlternativeJidPN = contact.alternativeJid.includes("@s.whatsapp.net");
      
      if (isRemoteJidLID && isAlternativeJidPN) {
        await LIDMappingService.createOrUpdateMapping({
          lid: contact.remoteJid,
          phoneNumber: contact.alternativeJid,
          companyId,
          contactId: contact.id,
          source: "contact_update",
          metadata: {
            contactName: contact.name,
            timestamp: new Date()
          }
        });
        logger.debug(`[LID-MAPPING] Caso2 contato: ${contact.remoteJid} ↔ ${contact.alternativeJid}`);
      }
    }

    // CASO 3: remoteJid mudou de LID→PN (usuário respondeu do celular)
    // Verificar se contato tinha LID mas agora mensagem vem de PN
    if (contact.remoteJid && remoteJid && contact.remoteJid !== remoteJid) {
      const wasLID = contact.remoteJid.includes("@lid") || 
                     (contact.remoteJid.includes(":") && !contact.remoteJid.includes("@g.us"));
      const nowPN = remoteJid.includes("@s.whatsapp.net");
      
      if (wasLID && nowPN && !isGroup) {
        await LIDMappingService.createOrUpdateMapping({
          lid: contact.remoteJid,
          phoneNumber: remoteJid,
          companyId,
          contactId: contact.id,
          source: "lid_to_pn_migration",
          metadata: {
            previousRemoteJid: contact.remoteJid,
            newRemoteJid: remoteJid,
            pushName: msg.pushName,
            timestamp: msg.messageTimestamp
          }
        });
        logger.debug(`[LID-MAPPING] Caso3 migração: ${contact.remoteJid} → ${remoteJid}`);
        
        // Atualizar contato: mover LID para alternativeJid, PN para remoteJid
        await contact.update({
          alternativeJid: contact.remoteJid,
          remoteJid: remoteJid,
          addressingMode: "pn"
        });
      }
    }
  } catch (error) {
    logger.error(`[LID-MAPPING] Erro ao capturar mapeamento LID: ${error.message}`);
  }
};

export const sendMessageImage = async (
  wbot: Session,
  contact,
  ticket: Ticket,
  url: string,
  caption: string
) => {
  let sentMessage;
  try {
    sentMessage = await wbot.sendMessage(
      `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
      {
        image: url
          ? { url }
          : fs.readFileSync(`public/temp/${caption}-${makeid(10)}`),
        fileName: caption,
        caption: caption,
        mimetype: "image/jpeg"
      }
    );
  } catch (error) {
    sentMessage = await wbot.sendMessage(
      `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
      {
        text: formatBody(
          "Não consegui enviar a imagem, tente novamente!",
          contact
        )
      }
    );
  }
  verifyMessage(sentMessage, ticket, contact);
};

export const sendMessageLink = async (
  wbot: Session,
  contact: Contact,
  ticket: Ticket,
  url: string,
  caption: string
) => {
  let sentMessage;
  try {
    sentMessage = await wbot.sendMessage(
      `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
      {
        document: url
          ? { url }
          : fs.readFileSync(`public/temp/${caption}-${makeid(10)}`),
        fileName: caption,
        caption: caption,
        mimetype: "application/pdf"
      }
    );
  } catch (error) {
    sentMessage = await wbot.sendMessage(
      `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
      {
        text: formatBody("Não consegui enviar o PDF, tente novamente!", contact)
      }
    );
  }
  verifyMessage(sentMessage, ticket, contact);
};

export function makeid(length) {
  var result = "";
  var characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  var charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

const getBodyButton = (msg: proto.IWebMessageInfo): string => {
  if (
    msg.key.fromMe &&
    msg?.message?.viewOnceMessage?.message?.buttonsMessage?.contentText
  ) {
    let bodyMessage = `*${msg?.message?.viewOnceMessage?.message?.buttonsMessage?.contentText}*`;

    for (const buton of msg.message?.viewOnceMessage?.message?.buttonsMessage
      ?.buttons) {
      bodyMessage += `\n\n${buton.buttonText?.displayText}`;
    }
    return bodyMessage;
  }

  if (msg.key.fromMe && msg?.message?.viewOnceMessage?.message?.listMessage) {
    let bodyMessage = `*${msg?.message?.viewOnceMessage?.message?.listMessage?.description}*`;
    for (const buton of msg.message?.viewOnceMessage?.message?.listMessage
      ?.sections) {
      for (const rows of buton.rows) {
        bodyMessage += `\n\n${rows.title}`;
      }
    }

    return bodyMessage;
  }
};

const msgLocation = (image, latitude, longitude) => {
  if (image) {
    var b64 = Buffer.from(image).toString("base64");

    let data = `data:image/png;base64, ${b64} | https://maps.google.com/maps?q=${latitude}%2C${longitude}&z=17&hl=pt-BR|${latitude}, ${longitude} `;
    return data;
  }
};

export const getBodyMessage = (msg: proto.IWebMessageInfo): string | null => {
  try {
    let type = getTypeMessage(msg);

    const types = {
      conversation: msg?.message?.conversation,
      editedMessage:
        msg?.message?.editedMessage?.message?.protocolMessage?.editedMessage
          ?.conversation,
      imageMessage: msg.message?.imageMessage?.caption,
      videoMessage: msg.message?.videoMessage?.caption,
      extendedTextMessage: msg.message?.extendedTextMessage?.text,
      buttonsResponseMessage:
        msg.message?.buttonsResponseMessage?.selectedButtonId,
      templateButtonReplyMessage:
        msg.message?.templateButtonReplyMessage?.selectedId,
      messageContextInfo:
        msg.message?.buttonsResponseMessage?.selectedButtonId ||
        msg.message?.listResponseMessage?.title,
      buttonsMessage:
        getBodyButton(msg) ||
        msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
      viewOnceMessage:
        getBodyButton(msg) ||
        msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
      stickerMessage: "sticker",
      contactMessage: msg.message?.contactMessage?.vcard 
        ? parseVCard(msg.message.contactMessage.vcard)
        : "📇 Contato compartilhado",
      contactsArrayMessage: "📇 Vários contatos compartilhados",
      //locationMessage: `Latitude: ${msg.message.locationMessage?.degreesLatitude} - Longitude: ${msg.message.locationMessage?.degreesLongitude}`,
      locationMessage: msgLocation(
        msg.message?.locationMessage?.jpegThumbnail,
        msg.message?.locationMessage?.degreesLatitude,
        msg.message?.locationMessage?.degreesLongitude
      ),
      liveLocationMessage: `Latitude: ${msg.message?.liveLocationMessage?.degreesLatitude} - Longitude: ${msg.message?.liveLocationMessage?.degreesLongitude}`,
      documentMessage: msg.message?.documentMessage?.caption,
      documentWithCaptionMessage:
        msg.message?.documentWithCaptionMessage?.message?.documentMessage
          ?.caption,
      audioMessage: "Áudio",
      listMessage:
        getBodyButton(msg) || msg.message?.listResponseMessage?.title,
      listResponseMessage:
        msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
      reactionMessage: msg.message?.reactionMessage?.text || "reaction"
    };

    const objKey = Object.keys(types).find(key => key === type);

    if (!objKey) {
      logger.warn(`#### Nao achou o type 152: ${type}
${optimizeMessageJson(msg)}`);
      Sentry.setExtra("Mensagem", { BodyMsg: msg.message, type });
      Sentry.captureException(
        new Error("Novo Tipo de Mensagem em getTypeMessage")
      );
    }
    return types[type];
  } catch (error) {
    Sentry.setExtra("Error getTypeMessage", { msg, BodyMsg: msg.message });
    Sentry.captureException(error);
    console.log(error);
  }
};

export const getQuotedMessage = (msg: proto.IWebMessageInfo): any => {
  const body =
    msg.message.imageMessage.contextInfo ||
    msg.message.videoMessage.contextInfo ||
    msg.message?.documentMessage ||
    msg.message.extendedTextMessage.contextInfo ||
    msg.message.buttonsResponseMessage.contextInfo ||
    msg.message.listResponseMessage.contextInfo ||
    msg.message.templateButtonReplyMessage.contextInfo ||
    msg.message.buttonsResponseMessage?.contextInfo ||
    msg?.message?.buttonsResponseMessage?.selectedButtonId ||
    msg.message.listResponseMessage?.singleSelectReply?.selectedRowId ||
    msg?.message?.listResponseMessage?.singleSelectReply.selectedRowId ||
    msg.message.listResponseMessage?.contextInfo;
  msg.message.senderKeyDistributionMessage;

  // testar isso

  return extractMessageContent(body[Object.keys(body).values().next().value]);
};
export const getQuotedMessageId = (msg: proto.IWebMessageInfo) => {
  const body = extractMessageContent(msg.message)[
    Object.keys(msg?.message).values().next().value
  ];

  return body?.contextInfo?.stanzaId;
};

const getMeSocket = (wbot: Session): IMe => {
  return {
    id: jidNormalizedUser((wbot as WASocket).user.id),
    name: (wbot as WASocket).user.name
  };
};

const getSenderMessage = (
  msg: proto.IWebMessageInfo,
  wbot: Session
): string => {
  const me = getMeSocket(wbot);
  if (msg.key.fromMe) return me.id;

  const senderId =
    msg.participant || msg.key.participant || msg.key.remoteJid || undefined;

  return senderId && jidNormalizedUser(senderId);
};

const getContactMessage = async (msg: proto.IWebMessageInfo, wbot: Session) => {
  const isGroup = msg.key.remoteJid.includes("g.us");
  const rawNumber = msg.key.remoteJid.replace(/\D/g, "");
  
  // Análise do formato do remoteJid
  const msgKeyAny = msg.key as any;
  if (!isGroup) {
    const patterns = {
      statusBroadcast: msg.key.remoteJid === 'status@broadcast',
      isBroadcast: msg.key.remoteJid?.includes('broadcast'),
      isNewsletter: msg.key.remoteJid?.includes('newsletter'),
      isLid: msg.key.remoteJid?.includes('@lid'),
      hasColon: msg.key.remoteJid?.includes(':'),
      normalPhone: msg.key.remoteJid?.match(/^\d+@s\.whatsapp\.net$/),
    };
    
    // Verificações de validade
    const isValidLength = rawNumber.length >= 10 && rawNumber.length <= 15;
    
    // ⚠️ TRATAMENTO ESPECIAL: IDs LID (@lid) - Mensagem é genuína mas ID não é telefone
    if (patterns.isLid) {
      logger.info(`[CONTACT-FORENSIC] ℹ️ ID LID DETECTADO - Processando mensagem de WhatsApp Business/Web`);
      logger.info(`[CONTACT-FORENSIC]   remoteJid: "${msg.key.remoteJid}"`);
      logger.info(`[CONTACT-FORENSIC]   pushName: "${msg.pushName}"`);
      
      // ============================================================================
      // 🎯 SOLUÇÃO 1: Verificar se WhatsApp enviou o número real via remoteJidAlt
      // Baileys 7.0.0+ inclui remoteJidAlt com o número real quando remoteJid é LID
      // ============================================================================
      const msgKeyAny = msg.key as any;
      if (msgKeyAny.remoteJidAlt && msgKeyAny.remoteJidAlt.includes('@s.whatsapp.net')) {
        const realNumber = msgKeyAny.remoteJidAlt.split('@')[0].replace(/\D/g, '');
        logger.debug(`[CONTACT-FORENSIC] remoteJidAlt encontrado: ${msgKeyAny.remoteJidAlt} → ${realNumber}`);
        
        // Validar se é número de telefone real (10-15 dígitos)
        if (realNumber && realNumber.length >= 10 && realNumber.length <= 15) {
          return {
            id: msgKeyAny.remoteJidAlt,  // Usar o JID real com número
            name: msg.pushName || realNumber,
            lidOrigin: msg.key.remoteJid,  // Guardar LID original para referência
            number: realNumber  // Passar número extraído
          };
        } else {
          logger.warn(`[CONTACT-FORENSIC] remoteJidAlt com número inválido: "${realNumber}"`);
        }
      }
      
      // ============================================================================
      // 🎯 SOLUÇÃO 2: Verificar se WhatsApp enviou o número real via senderPn
      // O WhatsApp pode enviar o número real no campo msg.key.senderPn
      // Referência: https://github.com/WhiskeySockets/Baileys/issues/2133
      // ============================================================================
      if (msgKeyAny.senderPn) {
        const realNumber = msgKeyAny.senderPn.split(':')[0].replace(/\D/g, '');
        logger.debug(`[CONTACT-FORENSIC] senderPn encontrado: ${msgKeyAny.senderPn} → ${realNumber}`);
        
        // Validar se é número de telefone real (10-15 dígitos)
        if (realNumber && realNumber.length >= 10 && realNumber.length <= 15) {
          return {
            id: `${realNumber}@s.whatsapp.net`,
            name: msg.pushName || realNumber,
            lidOrigin: msg.key.remoteJid,  // Guardar LID original para referência
            number: realNumber  // Passar número extraído
          };
        } else {
          logger.warn(`[CONTACT-FORENSIC] senderPn com número inválido: "${realNumber}"`);
        }
      }
      
      // ⛔ IMPORTANTE: LID NÃO É NÚMERO DE TELEFONE!
      // LID é um identificador temporário do WhatsApp Business/Web
      // Não podemos extrair número de telefone de LID porque:
      // - O número no LID (ex: 140969836040238) NÃO é um telefone válido
      // - É um ID interno do WhatsApp que muda conforme dispositivo
      // - Extrair e usar causaria criação de contatos duplicados com números inválidos
      
      logger.debug(`[CONTACT-FORENSIC] LID sem remoteJidAlt/senderPn: ${msg.key.remoteJid}`);
      
      // Retornar o LID original - verifyContact() fará o mapeamento inteligente
      return {
        id: msg.key.remoteJid,
        name: msg.pushName || msg.key.remoteJid.split('@')[0]
      };
    }
    
    if (!isValidLength) {
      logger.warn(`[CONTACT-FORENSIC] Número inválido (${rawNumber.length} dígitos): ${msg.key.remoteJid}`);
      return null;
    }
    
    // ⚡ CORREÇÃO CRÍTICA: Normalização de números brasileiros
    // NÃO assumir que todo número <= 11 dígitos é brasileiro!
    // Números internacionais podem ter 11 dígitos:
    // - Bolívia (591): 59170088585 (11 dígitos)
    // - Paraguai (595): 59512345678 (11 dígitos)
    // - Uruguai (598): 59812345678 (11 dígitos)
    
    // Só adicionar DDI 55 se:
    // 1. Tem exatamente 10 ou 11 dígitos (celular/fixo brasileiro)
    // 2. E NÃO começa com outro DDI internacional conhecido
    
    const knownInternationalDDI = ['591', '595', '598', '593', '51', '52', '54', '56', '57', '58']; // Bolivia, Paraguay, Uruguay, Ecuador, Peru, Mexico, Argentina, Chile, Colombia, Venezuela
    const hasInternationalDDI = knownInternationalDDI.some(ddi => rawNumber.startsWith(ddi));
    
    if (!hasInternationalDDI && (rawNumber.length === 10 || rawNumber.length === 11)) {
      // Número brasileiro SEM DDI - adicionar 55
      const normalizedNumber = '55' + rawNumber;
      return {
        id: `${normalizedNumber}@s.whatsapp.net`,
        name: msg.key.fromMe ? normalizedNumber : msg.pushName
      };
    }
  }
  
  // ============================================================================
  // SANITIZAÇÃO DO NOME - Evitar nomes inválidos
  // ============================================================================
  // 🔍 CAUSA RAIZ DO PROBLEMA:
  // O pushName é o nome que a pessoa SE IDENTIFICA no WhatsApp (perfil dela)
  // NUNCA é o nome que ela tem você salvo!
  // 
  // O store do Baileys contém:
  // - notify: pushName salvo em cache (pode estar desatualizado)
  // - name: como VOCÊ tem ela salva (não queremos isso!)
  // - verifiedName: nome verificado de conta Business
  //
  // SOLUÇÃO CORRETA: Usar msg.pushName diretamente quando válido!
  // Só buscar no store se pushName vier vazio/inválido
  // ============================================================================
  
  let contactName = msg.key.fromMe ? rawNumber : (msg.pushName || '');
  
  // Verificar se pushName é válido
  const isPushNameValid = contactName && 
    contactName.trim() !== '' && 
    contactName !== '.' &&
    !contactName.match(/^[.\s]+$/) &&
    contactName !== rawNumber &&
    !(contactName.match(/^[0-9]+$/) && contactName.length > 15);
  
  // 🆕 SOMENTE buscar no store se pushName for INVÁLIDO
  if (!msg.key.fromMe && !isPushNameValid) {
    try {
      const contactFromStore = wbot.store?.contacts?.[msg.key.remoteJid];
      if (contactFromStore) {
        // Prioridade: verifiedName (mais confiável) > notify
        // NÃO usar 'name' pois é como você tem a pessoa salva!
        const storeName = contactFromStore.verifiedName || contactFromStore.notify;
        if (storeName && storeName.trim() !== '' && storeName !== '.') {
          contactName = storeName;
        }
      }
    } catch (err) {
      logger.warn(`[CONTACT-NAME] Erro ao buscar no store: ${err?.message}`);
    }
  }
  
  // Verificar se o nome precisa ser sanitizado
  const needsSanitization = 
    !contactName ||                          // Vazio
    contactName.trim() === '' ||             // Apenas espaços
    contactName === '.' ||                   // Apenas ponto
    contactName.match(/^[.\s]+$/) ||        // Apenas pontos/espaços
    contactName === rawNumber ||             // Nome igual ao número
    (contactName.match(/^[0-9]+$/) && contactName.length > 15); // Número muito longo
  
  if (needsSanitization) {
    // Gerar nome formatado baseado no número
    if (rawNumber.startsWith('55') && rawNumber.length >= 12) {
      // Brasileiro: +55 (DDD) XXXXX-XXXX
      const ddd = rawNumber.substring(2, 4);
      const rest = rawNumber.substring(4);
      contactName = `+55 (${ddd}) ${rest}`;
    } else if (rawNumber.length >= 10 && rawNumber.length <= 15) {
      // Internacional: +CÓDIGO
      contactName = `+${rawNumber}`;
    } else {
      // Fallback
      contactName = `Contato ${rawNumber.substring(0, 8)}`;
    }
    
  }
  
  return isGroup
    ? {
        id: getSenderMessage(msg, wbot),
        name: msg.pushName || contactName
      }
    : {
        id: msg.key.remoteJid,
        name: msg.pushName || contactName  // ✅ Priorizar nome real do WhatsApp
      };
};

const downloadMedia = async (msg: proto.IWebMessageInfo) => {
  let buffer;
  try {
    buffer = await downloadMediaMessage(msg as WAMessage, "buffer", {});
  } catch (err) {
    // ⚠️ ERRO COMUM: Mídia expirada (410 Gone) ou indisponível
    // Isso acontece quando o WhatsApp remove arquivos antigos dos servidores
    if (err?.output?.statusCode === 410) {
      logger.warn(`[DOWNLOAD-MEDIA] ⚠️ Mídia expirada (410 Gone) - Arquivo não está mais disponível no servidor do WhatsApp`);
      logger.warn(`[DOWNLOAD-MEDIA]   MessageID: ${msg.key.id}`);
    } else {
      logger.error(`[DOWNLOAD-MEDIA] ❌ Erro ao baixar mídia:`, err);
      Sentry.captureException(err);
    }
    
    // Retornar null para indicar que o download falhou
    return null;
  }

  // ⚠️ PROTEÇÃO: Se o buffer falhou, retornar null
  if (!buffer) {
    logger.warn(`[DOWNLOAD-MEDIA] ⚠️ Buffer vazio - não foi possível baixar a mídia`);
    return null;
  }

  let filename = msg.message?.documentMessage?.fileName || "";

  const mineType =
    msg.message?.imageMessage ||
    msg.message?.audioMessage ||
    msg.message?.videoMessage ||
    msg.message?.stickerMessage ||
    msg.message?.documentMessage ||
    msg.message?.documentWithCaptionMessage?.message?.documentMessage ||
    msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
      ?.imageMessage ||
    msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage;

  if (!mineType) {
    logger.warn(`[DOWNLOAD-MEDIA] ⚠️ Tipo de mídia não identificado`);
    console.log(msg);
    return null;
  }

  if (!filename) {
    const ext = mimeExtension(mineType.mimetype);
    filename = `${new Date().getTime()}.${ext}`;
  } else {
    filename = `${new Date().getTime()}_${filename}`;
  }

  const media = {
    data: buffer,
    mimetype: mineType.mimetype,
    filename
  };

  return media;
};

const verifyContact = async (
  msgContact: IMe,
  wbot: Session,
  companyId: number,
  fromMe: boolean = false // 🆕 Indica se a mensagem foi enviada por nós
): Promise<Contact> => {
  // ============================================================================
  // ESTRATÉGIA PARA IDs LID (WhatsApp Web/Business)
  // ============================================================================
  // LIDs são IDs temporários no formato: 123456789:10@lid
  // Eles representam usuários reais mas não são números de telefone
  // SOLUÇÃO: Mapear LID → Contato Real usando foto de perfil + nome
  // ============================================================================
  
  const isLid = msgContact.id.includes('@lid');
  const isGroup = msgContact.id.includes("g.us");
  
  let profilePicUrl: string;
  try {
    profilePicUrl = await wbot.profilePictureUrl(msgContact.id);
  } catch (e) {
    Sentry.captureException(e);
    profilePicUrl = `${process.env.FRONTEND_URL}/nopicture.png`;
  }
  
  // ============================================================================
  // TRATAMENTO ESPECIAL PARA LIDs
  // ============================================================================
  if (isLid && !isGroup) {
    logger.debug(`[CONTACT-LID] LID detectado: ${msgContact.id} nome=${msgContact?.name}`);
    
    // ESTRATÉGIA 0: Buscar se esse LID foi associado a número real em sessão anterior
    // Verifica se já existe contato com remoteJid = LID MAS número real válido
    const lidWithRealNumber = await Contact.findOne({
      where: {
        remoteJid: msgContact.id,
        companyId: companyId,
        number: {
          [Op.not]: null,
          [Op.notLike]: 'WEB_%'  // Excluir identificadores temporários
        }
      },
      order: [['createdAt', 'DESC']]
    });
    
    if (lidWithRealNumber && 
        lidWithRealNumber.number && 
        !lidWithRealNumber.number.startsWith('WEB_') &&
        lidWithRealNumber.number.length >= 10) {
      // Atualizar foto se veio diferente
      if (profilePicUrl && !profilePicUrl.includes('nopicture') && profilePicUrl !== lidWithRealNumber.profilePicUrl) {
        await lidWithRealNumber.update({ profilePicUrl: profilePicUrl });
      }
      return lidWithRealNumber;
    }
    
    // ============================================================================
    // ESTRATÉGIA 0.5: Consultar cache do Baileys (signalRepository.lidMapping)
    // Referência: https://github.com/WhiskeySockets/Baileys/issues/2133
    // O Baileys mantém um cache em memória de mapeamento LID↔PN
    // NOTA: Este cache se perde ao reiniciar, então é apenas complementar
    // ============================================================================
    try {
      const wbotAny = wbot as any;
      if (wbotAny.signalRepository?.lidMapping?.getPNForLID) {
        const pnFromBaileys = wbotAny.signalRepository.lidMapping.getPNForLID(msgContact.id);
        if (pnFromBaileys) {
          const realNumber = pnFromBaileys.split(':')[0].replace(/\D/g, '');
          logger.debug(`[CONTACT-LID] Baileys cache: LID=${msgContact.id} → PN=${realNumber}`);
          
          if (realNumber && realNumber.length >= 10 && realNumber.length <= 15) {
            // Buscar contato existente com esse número
            const contactByRealNumber = await Contact.findOne({
              where: {
                number: realNumber,
                companyId: companyId
              }
            });
            
            if (contactByRealNumber) {
              await contactByRealNumber.update({ 
                remoteJid: msgContact.id,
                addressingMode: 'lid',
                alternativeJid: `${realNumber}@s.whatsapp.net`
              });
              return contactByRealNumber;
            } else {
              const newContact = await CreateOrUpdateContactService({
                name: msgContact.name || realNumber,
                number: realNumber,
                profilePicUrl,
                isGroup: false,
                companyId,
                remoteJid: msgContact.id,
                addressingMode: 'lid',
                alternativeJid: `${realNumber}@s.whatsapp.net`,
                fromMe // 🆕 Passar fromMe para não atualizar nome quando enviamos
              });
              return newContact;
            }
          }
        }
      }
    } catch (baileysError) {
      logger.warn(`[CONTACT-LID] Erro ao consultar cache do Baileys: ${baileysError.message}`);
    }
    
    // ESTRATÉGIA 1: Buscar por remoteJid já cadastrado
    let existingContact = await Contact.findOne({
      where: {
        remoteJid: msgContact.id,
        companyId: companyId
      }
    });
    
    if (existingContact) {
      // ⚡ ATUALIZAÇÃO AUTOMÁTICA: Se temos dados frescos do WhatsApp, atualizar!
      const needsUpdate = 
        (msgContact?.name && msgContact.name !== existingContact.name && msgContact.name !== '.') ||
        (profilePicUrl && profilePicUrl !== existingContact.profilePicUrl && !profilePicUrl.includes('nopicture'));
      
      if (needsUpdate) {
        const updates: any = {};
        
        // Atualizar nome SOMENTE se vier válido E não parecer nome de contato salvo
        if (msgContact?.name && msgContact.name !== '.' && msgContact.name !== existingContact.name) {
          // Validar que não seja nome inválido
          const isValidName = 
            msgContact.name.trim() !== '' &&
            !msgContact.name.match(/^[.\s]+$/) &&
            !(msgContact.name.match(/^[0-9]+$/) && msgContact.name.length > 15);
          
          // 🆕 PROTEÇÃO ADICIONAL: Não sobrescrever se o nome existente for válido
          // e o novo nome parecer ser um "nome de contato salvo" genérico
          const existingIsGood = 
            existingContact.name &&
            existingContact.name.trim() !== '' &&
            !existingContact.name.match(/^\+?\d[\d\s()-]*$/) && // Não é número formatado
            !existingContact.name.startsWith('Contato ');
          
          const newNameLooksLikeSaved = 
            msgContact.name.includes(' - ') || // Ex: "SMCTIC - Service Desk"
            msgContact.name.match(/\s+(Service|Atendimento|Suporte|Help)/i);
          
          if (isValidName && !(existingIsGood && newNameLooksLikeSaved)) {
            updates.name = msgContact.name;
          }
        }
        
        // Atualizar foto se vier válida
        if (profilePicUrl && !profilePicUrl.includes('nopicture') && profilePicUrl !== existingContact.profilePicUrl) {
          updates.profilePicUrl = profilePicUrl;
        }
        
        if (Object.keys(updates).length > 0) {
          await existingContact.update(updates);
        }
      }
      
      return existingContact;
    }
    
    // ESTRATÉGIA 2: Buscar por mensagens anteriores com mesmo LID
    // Isso resolve duplicatas quando o mesmo LID mandou msgs antes mas sem remoteJid salvo
    const previousMessage = await Message.findOne({
      where: {
        remoteJid: msgContact.id,
        companyId: companyId
      },
      order: [['createdAt', 'DESC']],
      include: [{
        model: Contact,
        as: 'contact',
        required: true,
        where: {
          companyId: companyId  // ⚠️ CRÍTICO: Garantir que contato pertence à mesma company
        }
      }]
    });
    
    if (previousMessage && previousMessage.contact) {
      // Atualizar remoteJid e foto no contato
      await previousMessage.contact.update({ 
        remoteJid: msgContact.id,
        profilePicUrl: profilePicUrl 
      });
      return previousMessage.contact;
    }
    
    // ESTRATÉGIA 3: Buscar pela foto de perfil (mesmo usuário, diferentes dispositivos)
    if (profilePicUrl && !profilePicUrl.includes('nopicture.png')) {
      // Extrair ID da foto (parte antes dos parâmetros de query)
      // Ex: https://pps.whatsapp.net/.../524708449_2073282956808114_4866087062541368293_n.jpg?...
      // Pega: 524708449_2073282956808114_4866087062541368293_n.jpg
      const photoIdMatch = profilePicUrl.match(/\/([^\/]+\.jpg)/);
      const photoId = photoIdMatch ? photoIdMatch[1] : null;
      
      if (photoId) {
        // Buscar por qualquer contato que tenha o mesmo ID de foto
        existingContact = await Contact.findOne({
          where: {
            profilePicUrl: {
              [Op.like]: `%${photoId}%`
            },
            companyId: companyId,
            isGroup: false
          },
          order: [['createdAt', 'DESC']]
        });
        
        if (existingContact) {
          // Vincular o LID ao contato existente
          const updates: any = { remoteJid: msgContact.id };
          
          if (msgContact?.name && 
              msgContact.name !== '.' && 
              msgContact.name !== existingContact.name &&
              msgContact.name.trim() !== '' &&
              !msgContact.name.match(/^[.\s]+$/)) {
            updates.name = msgContact.name;
          }
          
          updates.profilePicUrl = profilePicUrl;
          await existingContact.update(updates);
          return existingContact;
        }
      }
    }
    
    // ESTRATÉGIA 3: Buscar por nome similar (case insensitive)
    if (msgContact?.name) {
      existingContact = await Contact.findOne({
        where: {
          name: {
            [Op.iLike]: msgContact.name
          },
          companyId: companyId,
          isGroup: false
        },
        order: [['createdAt', 'DESC']]
      });
      
      if (existingContact) {
        await existingContact.update({ 
          remoteJid: msgContact.id,
          profilePicUrl: profilePicUrl
        });
        return existingContact;
      }
    }
    
    // ESTRATÉGIA 4: CRIAR contato LID com número NULL
    // CORREÇÃO CRÍTICA: NÃO salvar identificadores inválidos como WEB_*_READONLY
    // Baseado na documentação Baileys v7.0.0 LID handling
    logger.warn(`[CONTACT-LID] ⚠️ Nenhum contato existente encontrado para este LID`);
    logger.warn(`[CONTACT-LID]   Criando contato LID-only (sem número de telefone)`);
    logger.warn(`[CONTACT-LID]   LIMITAÇÃO: Não será possível ENVIAR mensagens para este contato`);
    logger.warn(`[CONTACT-LID]   SOLUÇÃO: Aguardar que pessoa inicie conversa de telefone real`);
    
    // Extrair identificador curto do LID para exibição
    const lidShort = msgContact.id.split('@')[0].substring(0, 12).replace(/:/g, '');
    
    // CORREÇÃO: Salvar NULL no number, LID no remoteJid
    // Quando tivermos o PN real, será atualizado pelo sistema de mapeamento
    const contactData = {
      name: msgContact?.name || `WhatsApp Web (${lidShort})`,
      number: null, // ❌ NÃO salvar WEB_* ou LID_ - deixar NULL
      remoteJid: msgContact.id, // ✅ Salvar LID aqui
      alternativeJid: null, // Será preenchido quando descobrirmos o PN
      addressingMode: "lid", // Marcador de que este é um contato LID-only
      profilePicUrl,
      isGroup: false,
      companyId,
      whatsappId: wbot.id
    };
    
    const newContact = await CreateOrUpdateContactService(contactData);
    logger.warn(`[CONTACT-LID] Contato LID-only criado (sem número): id=${newContact.id} lid=${contactData.remoteJid}`);
    return newContact;
  }
  
  // ============================================================================
  // TRATAMENTO NORMAL PARA NÚMEROS REGULARES
  // ============================================================================
  
  // ⚠️ PROTEÇÃO CRÍTICA: Rejeitar LIDs que não passaram pela Estratégia 4
  // Se chegamos aqui com um LID, algo falhou no fluxo anterior
  if (msgContact.id.includes('@lid')) {
    logger.error(`[CONTACT-VERIFY] ❌ LID DETECTADO NO FLUXO ERRADO!`);
    logger.error(`[CONTACT-VERIFY]   ID: ${msgContact.id}`);
    logger.error(`[CONTACT-VERIFY]   Este LID deveria ter sido tratado pela Estratégia 4 (criar com number=null)`);
    logger.error(`[CONTACT-VERIFY]   REJEITANDO para evitar criar contato com número extraído do LID`);
    
    // Lançar erro para forçar uso da Estratégia 4
    throw new Error(`LID detectado no fluxo normal - use createContactData para LIDs`);
  }
  
  // Extrair número do ID
  let extractedNumber = msgContact.id.replace(/\D/g, "");
  
  // Validar tamanho do número (deve ter entre 10 e 15 dígitos para não-grupos)
  if (!isGroup && (extractedNumber.length < 10 || extractedNumber.length > 15)) {
    logger.error(`[CONTACT-VERIFY] ❌ NÚMERO INVÁLIDO detectado!`);
    logger.error(`[CONTACT-VERIFY]   ID Original: ${msgContact.id}`);
    logger.error(`[CONTACT-VERIFY]   Número extraído: ${extractedNumber}`);
    logger.error(`[CONTACT-VERIFY]   Tamanho: ${extractedNumber.length} dígitos (esperado: 10-15)`);
    
    throw new Error(`Número inválido - tamanho incorreto: ${extractedNumber.length} dígitos`);
  }
  
  // ============================================================================
  // GARANTIR QUE O NOME SEJA VÁLIDO (segunda camada de proteção)
  // ============================================================================
  let finalName = msgContact?.name || '';
  
  // 🆕 PRIMEIRO: Verificar se já existe contato com nome válido no banco
  // Isso evita sobrescrever nome bom por número formatado
  const existingContact = await Contact.findOne({
    where: {
      number: extractedNumber,
      companyId
    }
  });
  
  // Verificar se nome existente é válido (não é número formatado)
  const existingNameIsValid = existingContact?.name && 
    existingContact.name.trim() !== '' &&
    existingContact.name !== '.' &&
    !existingContact.name.match(/^[.\s]+$/) &&
    !existingContact.name.match(/^\+?\d[\d\s()-]*$/) &&  // Não é número formatado
    !existingContact.name.startsWith('Contato ') &&
    !existingContact.name.startsWith('WhatsApp Web');
  
  const isInvalidName = 
    !finalName ||
    finalName.trim() === '' ||
    finalName === '.' ||
    finalName.match(/^[.\s]+$/) ||
    finalName === extractedNumber ||
    (finalName.match(/^[0-9]+$/) && finalName.length > 15);
  
  // Se nome da mensagem é inválido MAS existe nome válido no banco, usar o do banco
  if (isInvalidName && existingNameIsValid) {
    finalName = existingContact.name;
  } else if (isInvalidName) {
    try {
      const contactFromStore = await wbot.store?.contacts?.[msgContact.id];
      if (contactFromStore) {
        if (contactFromStore.verifiedName && contactFromStore.verifiedName.trim() !== '') {
          finalName = contactFromStore.verifiedName;
        } else if (contactFromStore.notify && contactFromStore.notify.trim() !== '') {
          finalName = contactFromStore.notify;
        }
      }
    } catch (err) {
      logger.warn(`[CONTACT-VERIFY] Erro ao buscar no store: ${err.message}`);
    }
    
    // Se ainda não tem nome válido, gerar formatado
    if (!finalName || finalName.trim() === '' || finalName === extractedNumber) {
      // FALLBACK: Gerar nome formatado baseado no número
      if (extractedNumber.startsWith('55') && extractedNumber.length >= 12) {
        const ddd = extractedNumber.substring(2, 4);
        const rest = extractedNumber.substring(4);
        finalName = `+55 (${ddd}) ${rest}`;
      } else {
        finalName = `+${extractedNumber}`;
      }
      logger.warn(`[CONTACT-VERIFY] ⚠️ Usando nome formatado: "${finalName}"`);
    }
  }

  const contactData = {
    name: finalName,
    number: extractedNumber,
    profilePicUrl,
    isGroup: isGroup,
    companyId,
    whatsappId: wbot.id,
    fromMe // 🆕 Passar fromMe para não atualizar nome quando enviamos
  };

  const contact = await CreateOrUpdateContactService(contactData);
  
  // GARANTIR que remoteJid está sempre correto e atualizado
  // Isso previne duplicatas quando o WhatsApp muda o formato do ID
  if (!contact.remoteJid || contact.remoteJid !== msgContact.id) {
    await contact.update({ remoteJid: msgContact.id });
  }

  return contact;
};

const verifyQuotedMessage = async (
  msg: proto.IWebMessageInfo
): Promise<Message | null> => {
  if (!msg) return null;
  const quoted = getQuotedMessageId(msg);

  if (!quoted) return null;

  const quotedMsg = await Message.findOne({
    where: { id: quoted }
  });

  if (!quotedMsg) return null;

  return quotedMsg;
};

const sanitizeName = (name: string): string => {
  let sanitized = name.split(" ")[0];
  sanitized = sanitized.replace(/[^a-zA-Z0-9]/g, "");
  return sanitized.substring(0, 60);
};

export const convertTextToSpeechAndSaveToFile = (
  text: string,
  filename: string,
  subscriptionKey: string,
  serviceRegion: string,
  voice: string = "pt-BR-FabioNeural",
  audioToFormat: string = "mp3"
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const speechConfig = SpeechConfig.fromSubscription(
      subscriptionKey,
      serviceRegion
    );
    speechConfig.speechSynthesisVoiceName = voice;
    const audioConfig = AudioConfig.fromAudioFileOutput(`${filename}.wav`);
    const synthesizer = new SpeechSynthesizer(speechConfig, audioConfig);
    synthesizer.speakTextAsync(
      text,
      result => {
        if (result) {
          convertWavToAnotherFormat(
            `${filename}.wav`,
            `${filename}.${audioToFormat}`,
            audioToFormat
          )
            .then(output => {
              resolve();
            })
            .catch(error => {
              console.error(error);
              reject(error);
            });
        } else {
          reject(new Error("No result from synthesizer"));
        }
        synthesizer.close();
      },
      error => {
        console.error(`Error: ${error}`);
        synthesizer.close();
        reject(error);
      }
    );
  });
};

const convertWavToAnotherFormat = (
  inputPath: string,
  outputPath: string,
  toFormat: string
) => {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(inputPath)
      .toFormat(toFormat)
      .on("end", () => resolve(outputPath))
      .on("error", (err: { message: any }) =>
        reject(new Error(`Error converting file: ${err.message}`))
      )
      .save(outputPath);
  });
};

const deleteFileSync = (path: string): void => {
  try {
    fs.unlinkSync(path);
  } catch (error) {
    console.error("Erro ao deletar o arquivo:", error);
  }
};

export const keepOnlySpecifiedChars = (str: string) => {
  return str.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚâêîôûÂÊÎÔÛãõÃÕçÇ!?.,;:\s]/g, "");
};



const handleOpenAi = async (
  msg: proto.IWebMessageInfo,
  wbot: Session,
  ticket: Ticket,
  contact: Contact,
  mediaSent: Message | undefined,
  ticketTraking: TicketTraking = null,
  openAiSettings = null
): Promise<void> => {

  // REGRA PARA DESABILITAR O BOT PARA ALGUM CONTATO
  if (contact.disableBot) {
    return;
  }

  const bodyMessage = getBodyMessage(msg);

  if (!bodyMessage) return;

  let { prompt } = await ShowWhatsAppService(wbot.id, ticket.companyId);

  if( openAiSettings )
    prompt = openAiSettings;

  if (!prompt && !isNil(ticket?.queue?.prompt)) {
    prompt = ticket.queue.prompt;
  }

  if (!prompt) return;

  if (msg.messageStubType) return;

  const publicFolder: string = path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "public"
  );

  let openai: SessionOpenAi;
  const openAiIndex = sessionsOpenAi.findIndex(s => s.id === wbot.id);

  if (openAiIndex === -1) {
    const configuration = new Configuration({
      apiKey: prompt.apiKey
    });
    openai = new OpenAIApi(configuration);
    openai.id = wbot.id;
    sessionsOpenAi.push(openai);
  } else {
    openai = sessionsOpenAi[openAiIndex];
  }

  let maxMessages = prompt.maxMessages;

  const messages = await Message.findAll({
    where: { ticketId: ticket.id },
    order: [["createdAt", "DESC"]],
    limit: maxMessages
  });

  const promptSystem = `Nas respostas utilize o nome ${sanitizeName(
    contact.name || "Amigo(a)"
  )} para identificar o cliente.\nSua resposta deve usar no máximo ${
    prompt.maxTokens
  } tokens e cuide para não truncar o final.\nSempre que possível, mencione o nome dele para ser mais personalizado o atendimento e mais educado. Quando a resposta requer uma transferência para o setor de atendimento, comece sua resposta com 'Ação: Transferir para o setor de atendimento'.\n
  ${prompt.prompt}\n`;

  let messagesOpenAi: ChatCompletionRequestMessage[] = [];

  if (msg.message?.conversation || msg.message?.extendedTextMessage?.text) {
    messagesOpenAi = [];
    messagesOpenAi.push({ role: "system", content: promptSystem });
    for (let i = 0; i < Math.min(maxMessages, messages.length); i++) {
      const message = messages[i];
      if (
        message.mediaType === "conversation" ||
        message.mediaType === "extendedTextMessage"
      ) {
        if (message.fromMe) {
          messagesOpenAi.push({ role: "assistant", content: message.body });
        } else {
          messagesOpenAi.push({ role: "user", content: message.body });
        }
      }
    }
    messagesOpenAi.push({ role: "user", content: bodyMessage! });

    const chat = await openai.createChatCompletion({
      model: prompt.model,
      messages: messagesOpenAi,
      max_tokens: prompt.maxTokens,
      temperature: prompt.temperature
    });

    let response = chat.data.choices[0].message?.content;

    if (response?.includes("Ação: Transferir para o setor de atendimento")) {
      await transferQueue(prompt.queueId, ticket, contact);
      response = response
        .replace("Ação: Transferir para o setor de atendimento", "")
        .trim();
    }

    const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
      text: response!
    });
    await verifyMessage(sentMessage!, ticket, contact);

    /*
    if (prompt.voice === "texto") {
      const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
        text: response!
      });
      await verifyMessage(sentMessage!, ticket, contact);
    } else {
      const fileNameWithOutExtension = `${ticket.id}_${Date.now()}`;
      convertTextToSpeechAndSaveToFile(
        keepOnlySpecifiedChars(response!),
        `${publicFolder}/${fileNameWithOutExtension}`,
        prompt.voiceKey,
        prompt.voiceRegion,
        prompt.voice,
        "mp3"
      ).then(async () => {
        try {
          const sendMessage = await wbot.sendMessage(msg.key.remoteJid!, {
            audio: { url: `${publicFolder}/${fileNameWithOutExtension}.mp3` },
            mimetype: "audio/mpeg",
            ptt: true
          });
          await verifyMediaMessage(sendMessage!, ticket, contact);
          deleteFileSync(`${publicFolder}/${fileNameWithOutExtension}.mp3`);
          deleteFileSync(`${publicFolder}/${fileNameWithOutExtension}.wav`);
        } catch (error) {
          console.log(`Erro para responder com audio: ${error}`);
        }
      });
    }*/
  } else if (msg.message?.audioMessage) {
    const mediaUrl = mediaSent!.mediaUrl!.split("/").pop();
    const file = fs.createReadStream(`${publicFolder}/${mediaUrl}`) as any;
    const transcription = await openai.createTranscription(file, "whisper-1");

    messagesOpenAi = [];
    messagesOpenAi.push({ role: "system", content: promptSystem });
    for (let i = 0; i < Math.min(maxMessages, messages.length); i++) {
      const message = messages[i];
      if (
        message.mediaType === "conversation" ||
        message.mediaType === "extendedTextMessage"
      ) {
        if (message.fromMe) {
          messagesOpenAi.push({ role: "assistant", content: message.body });
        } else {
          messagesOpenAi.push({ role: "user", content: message.body });
        }
      }
    }
    messagesOpenAi.push({ role: "user", content: transcription.data.text });
    const chat = await openai.createChatCompletion({
      model: prompt.model,
      messages: messagesOpenAi,
      max_tokens: prompt.maxTokens,
      temperature: prompt.temperature
    });
    let response = chat.data.choices[0].message?.content;

    if (response?.includes("Ação: Transferir para o setor de atendimento")) {
      await transferQueue(prompt.queueId, ticket, contact);
      response = response
        .replace("Ação: Transferir para o setor de atendimento", "")
        .trim();
    }
    /*if (prompt.voice === "texto") {
      const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
        text: response!
      });
      await verifyMessage(sentMessage!, ticket, contact);
    } else {
      const fileNameWithOutExtension = `${ticket.id}_${Date.now()}`;
      convertTextToSpeechAndSaveToFile(
        keepOnlySpecifiedChars(response!),
        `${publicFolder}/${fileNameWithOutExtension}`,
        prompt.voiceKey,
        prompt.voiceRegion,
        prompt.voice,
        "mp3"
      ).then(async () => {
        try {
          const sendMessage = await wbot.sendMessage(msg.key.remoteJid!, {
            audio: { url: `${publicFolder}/${fileNameWithOutExtension}.mp3` },
            mimetype: "audio/mpeg",
            ptt: true
          });
          await verifyMediaMessage(sendMessage!, ticket, contact);
          deleteFileSync(`${publicFolder}/${fileNameWithOutExtension}.mp3`);
          deleteFileSync(`${publicFolder}/${fileNameWithOutExtension}.wav`);
        } catch (error) {
          console.log(`Erro para responder com audio: ${error}`);
        }
      });
    }*/
  }
  messagesOpenAi = [];
};

export const transferQueue = async (
  queueId: number,
  ticket: Ticket,
  contact: Contact
): Promise<void> => {
  await UpdateTicketService({
    ticketData: { queueId: queueId },
    ticketId: ticket.id,
    companyId: ticket.companyId
  });
};

export const verifyMediaMessage = async (
  msg: proto.IWebMessageInfo,
  ticket: Ticket,
  contact: Contact,
  ticketTraking: TicketTraking = null,
  isForwarded: boolean = false,
  isPrivate: boolean = false,
  wbot: Session = null
): Promise<Message> => {
  const io = getIO();
  const quotedMsg = await verifyQuotedMessage(msg);
  const media = await downloadMedia(msg);

  if (!media) {
    throw new Error("ERR_WAPP_DOWNLOAD_MEDIA");
  }

  if (!media.filename) {
    const ext = mimeExtension(media.mimetype);
    media.filename = `${new Date().getTime()}.${ext}`;
  }

  try {
    await writeFileAsync(
      join(__dirname, "..", "..", "..", "public", media.filename),
      Buffer.from(media.data, 'base64')
    );
  } catch (err) {
    Sentry.captureException(err);
    logger.error(err);
  }

  const body = getBodyMessage(msg);

  const hasCap = hasCaption(body, media.filename);
  const bodyMessage = body ? hasCap ? formatBody(body, ticket.contact) : "-" : "-";

  const messageData = {
    id: msg.key.id,
    ticketId: ticket.id,
    contactId: msg.key.fromMe ? undefined : contact.id,
    body: bodyMessage,
    fromMe: msg.key.fromMe,
    read: msg.key.fromMe,
    mediaUrl: media.filename,
    mediaType: media.mimetype.split("/")[0],
    quotedMsgId: quotedMsg?.id,
    ack: msg.status,
    remoteJid: msg.key.remoteJid,
    participant: msg.key.participant,
    dataJson: optimizeMessageJson(msg),
    ticketTrakingId: ticketTraking?.id,
  };

  await ticket.update({
    lastMessage: body || "Arquivo de mídia"
  });

  const newMessage = await CreateMessageService({
    messageData,
    companyId: ticket.companyId
  });

  if (!msg.key.fromMe && ticket.status === "closed") {
    await ticket.update({ status: "pending" });
    await ticket.reload({
      include: [
        { model: Queue, as: "queue" },
        { model: User, as: "user" },
        { model: Contact, as: "contact" }
      ]
    });

    io.to(`company-${ticket.companyId}-closed`)
      .to(`queue-${ticket.queueId}-closed`)
      .emit(`company-${ticket.companyId}-ticket`, {
        action: "delete",
        ticket,
        ticketId: ticket.id
      });

    io.to(`company-${ticket.companyId}-${ticket.status}`)
      .to(`queue-${ticket.queueId}-${ticket.status}`)
      .to(ticket.id.toString())
      .emit(`company-${ticket.companyId}-ticket`, {
        action: "update",
        ticket,
        ticketId: ticket.id
      });
  }

  return newMessage;
};

export const verifyMessage = async (
  msg: proto.IWebMessageInfo,
  ticket: Ticket,
  contact: Contact
) => {
  const io = getIO();
  const quotedMsg = await verifyQuotedMessage(msg);
  const body = getBodyMessage(msg);
  const isEdited = getTypeMessage(msg) == "editedMessage";

  const messageData = {
    id: isEdited
      ? msg?.message?.editedMessage?.message?.protocolMessage?.key?.id
      : msg.key.id,
    ticketId: ticket.id,
    contactId: msg.key.fromMe ? undefined : contact.id,
    body,
    fromMe: msg.key.fromMe,
    mediaType: getTypeMessage(msg),
    read: msg.key.fromMe,
    quotedMsgId: quotedMsg?.id,
    ack: msg.status,
    remoteJid: msg.key.remoteJid,
    participant: msg.key.participant,
    dataJson: optimizeMessageJson(msg),
    isEdited: isEdited
  };

  // ============================================================================
  // ATUALIZAR lastRemoteJid do ticket quando receber mensagem (não fromMe)
  // Isso permite responder ao JID correto, incluindo LIDs
  // ============================================================================
  const ticketUpdates: any = {
    lastMessage: body
  };
  
  if (!msg.key.fromMe && msg.key.remoteJid) {
    ticketUpdates.lastRemoteJid = msg.key.remoteJid;
  }
  
  await ticket.update(ticketUpdates);

  await CreateMessageService({ messageData, companyId: ticket.companyId });

  if (!msg.key.fromMe && ticket.status === "closed") {
    await ticket.update({ status: "pending" });
    await ticket.reload({
      include: [
        { model: Queue, as: "queue" },
        { model: User, as: "user" },
        { model: Contact, as: "contact" }
      ]
    });

    io.to(`company-${ticket.companyId}-closed`)
      .to(`queue-${ticket.queueId}-closed`)
      .emit(`company-${ticket.companyId}-ticket`, {
        action: "delete",
        ticket,
        ticketId: ticket.id
      });

    io.to(`company-${ticket.companyId}-${ticket.status}`)
      .to(`queue-${ticket.queueId}-${ticket.status}`)
      .emit(`company-${ticket.companyId}-ticket`, {
        action: "update",
        ticket,
        ticketId: ticket.id
      });
  }
};

const isValidMsg = (msg: proto.IWebMessageInfo): boolean => {
  if (msg.key.remoteJid === "status@broadcast") return false;
  try {
    const msgType = getTypeMessage(msg);
    if (!msgType) {
      return;
    }

    const ifType =
      msgType === "conversation" ||
      msgType === "extendedTextMessage" ||
      msgType === "editedMessage" ||
      msgType === "audioMessage" ||
      msgType === "videoMessage" ||
      msgType === "imageMessage" ||
      msgType === "documentMessage" ||
      msgType === "documentWithCaptionMessage" ||
      msgType === "stickerMessage" ||
      msgType === "buttonsResponseMessage" ||
      msgType === "buttonsMessage" ||
      msgType === "messageContextInfo" ||
      msgType === "locationMessage" ||
      msgType === "liveLocationMessage" ||
      msgType === "contactMessage" ||
      msgType === "voiceMessage" ||
      msgType === "mediaMessage" ||
      msgType === "contactsArrayMessage" ||
      msgType === "reactionMessage" ||
      msgType === "ephemeralMessage" ||
      msgType === "protocolMessage" ||
      msgType === "listResponseMessage" ||
      msgType === "listMessage" ||
      msgType === "viewOnceMessage";

    if (!ifType) {
      logger.warn(`#### Nao achou o type em isValidMsg: ${msgType}
${JSON.stringify(msg?.message)}`);
      Sentry.setExtra("Mensagem", { BodyMsg: msg.message, msg, msgType });
      Sentry.captureException(new Error("Novo Tipo de Mensagem em isValidMsg"));
    }

    return !!ifType;
  } catch (error) {
    Sentry.setExtra("Error isValidMsg", { msg });
    Sentry.captureException(error);
  }
};

const Push = (msg: proto.IWebMessageInfo) => {
  return msg.pushName;
};

const verifyQueue = async (
  wbot: Session,
  msg: proto.IWebMessageInfo,
  ticket: Ticket,
  contact: Contact,
  mediaSent?: Message | undefined
) => {

  const companyId = ticket.companyId;

  const { queues, greetingMessage, maxUseBotQueues, timeUseBotQueues } =
    await ShowWhatsAppService(wbot.id!, ticket.companyId);

  if (queues.length === 1) {
    const sendGreetingMessageOneQueues = await Setting.findOne({
      where: {
        key: "sendGreetingMessageOneQueues",
        companyId: ticket.companyId
      }
    });

    if (
      greetingMessage.length > 1 &&
      sendGreetingMessageOneQueues?.value === "enabled"
    ) {
      const body = formatBody(`${greetingMessage}`, contact);

      await wbot.sendMessage(
        `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
        {
          text: body
        }
      );
    }

    const firstQueue = head(queues);
    let chatbot = false;
    if (firstQueue?.options) {
      chatbot = firstQueue.options.length > 0;
    }

    //inicia integração dialogflow/n8n
    if (
      !msg.key.fromMe &&
      !ticket.isGroup &&
      !isNil(queues[0]?.integrationId)
    ) {
      const integrations = await ShowQueueIntegrationService(
        queues[0].integrationId,
        companyId
      );

      await handleMessageIntegration(
        msg,
        wbot,
        integrations,
        ticket,
        companyId
      );

      await ticket.update({
        useIntegration: true,
        integrationId: integrations.id
      });
      // return;
    }
    //inicia integração openai
    if (!msg.key.fromMe && !ticket.isGroup && !isNil(queues[0]?.promptId)) {
      await handleOpenAi(msg, wbot, ticket, contact, mediaSent);

      await ticket.update({
        useIntegration: true,
        promptId: queues[0]?.promptId
      });
      // return;
    }

    await UpdateTicketService({
      ticketData: { queueId: firstQueue.id, chatbot, status: "pending" },
      ticketId: ticket.id,
      companyId: ticket.companyId
    });

    return;
  }

  const selectedOption = getBodyMessage(msg);
  const choosenQueue = queues[+selectedOption - 1];

  const buttonActive = await Setting.findOne({
    where: {
      key: "chatBotType",
      companyId
    }
  });

  const botText = async () => {
    let options = "";

    queues.forEach((queue, index) => {
      options += `*[ ${index + 1} ]* - ${queue.name}\n`;
    });

    const textMessage = {
      text: formatBody(`\u200e${greetingMessage}\n\n${options}`, contact)
    };

    const sendMsg = await wbot.sendMessage(
      `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
      textMessage
    );

    await verifyMessage(sendMsg, ticket, ticket.contact);
  };

  if (choosenQueue) {
    let chatbot = false;
    if (choosenQueue?.options) {
      chatbot = choosenQueue.options.length > 0;
    }

    await UpdateTicketService({
      ticketData: { queueId: choosenQueue.id, chatbot },
      ticketId: ticket.id,
      companyId: ticket.companyId
    });

    /* Tratamento para envio de mensagem quando a fila está fora do expediente */
    if (choosenQueue.options.length === 0) {
      const queue = await Queue.findByPk(choosenQueue.id);
      const { schedules }: any = queue;
      const now = moment();
      const weekday = now.format("dddd").toLowerCase();
      let schedule;
      if (Array.isArray(schedules) && schedules.length > 0) {
        schedule = schedules.find(
          s =>
            s.weekdayEn === weekday &&
            s.startTime !== "" &&
            s.startTime !== null &&
            s.endTime !== "" &&
            s.endTime !== null
        );
      }

      if (
        queue.outOfHoursMessage !== null &&
        queue.outOfHoursMessage !== "" &&
        !isNil(schedule)
      ) {
        const startTime = moment(schedule.startTime, "HH:mm");
        const endTime = moment(schedule.endTime, "HH:mm");

        if (now.isBefore(startTime) || now.isAfter(endTime)) {
          const body = formatBody(
            `\u200e ${queue.outOfHoursMessage}\n\n*[ # ]* - Voltar ao Menu Principal`,
            ticket.contact
          );
          const sentMessage = await wbot.sendMessage(
            `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
            {
              text: body
            }
          );
          await verifyMessage(sentMessage, ticket, contact);
          await UpdateTicketService({
            ticketData: { queueId: null, chatbot },
            ticketId: ticket.id,
            companyId: ticket.companyId
          });
          return;
        }
      }

      //inicia integração dialogflow/n8n
      if (!msg.key.fromMe && !ticket.isGroup && choosenQueue.integrationId) {
        const integrations = await ShowQueueIntegrationService(
          choosenQueue.integrationId,
          companyId
        );

        await handleMessageIntegration(
          msg,
          wbot,
          integrations,
          ticket,
          companyId
        );

        await ticket.update({
          useIntegration: true,
          integrationId: integrations.id
        });
        // return;
      }

      //inicia integração openai
      if (
        !msg.key.fromMe &&
        !ticket.isGroup &&
        !isNil(choosenQueue?.promptId)
      ) {
        await handleOpenAi(msg, wbot, ticket, contact, mediaSent);

        await ticket.update({
          useIntegration: true,
          promptId: choosenQueue?.promptId
        });
        // return;
      }

      const body = formatBody(
        `\u200e${choosenQueue.greetingMessage}`,
        ticket.contact
      );
      if (choosenQueue.greetingMessage) {
        const sentMessage = await wbot.sendMessage(
          `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
          {
            text: body
          }
        );
        await verifyMessage(sentMessage, ticket, contact);
      }
    }
  } else {
    if (
      maxUseBotQueues &&
      maxUseBotQueues !== 0 &&
      ticket.amountUsedBotQueues >= maxUseBotQueues
    ) {
      // await UpdateTicketService({
      //   ticketData: { queueId: queues[0].id },
      //   ticketId: ticket.id
      // });

      return;
    }

    //Regra para desabilitar o chatbot por x minutos/horas após o primeiro envio
    const ticketTraking = await FindOrCreateATicketTrakingService({
      ticketId: ticket.id,
      companyId
    });
    let dataLimite = new Date();
    let Agora = new Date();

    if (ticketTraking.chatbotAt !== null) {
      dataLimite.setMinutes(
        ticketTraking.chatbotAt.getMinutes() + Number(timeUseBotQueues)
      );

      if (
        ticketTraking.chatbotAt !== null &&
        Agora < dataLimite &&
        timeUseBotQueues !== "0" &&
        ticket.amountUsedBotQueues !== 0
      ) {
        return;
      }
    }
    await ticketTraking.update({
      chatbotAt: null
    });

    if (buttonActive.value === "text") {
      return botText();
    }
  }
};

export const verifyRating = (ticketTraking: TicketTraking) => {
  if (
    ticketTraking &&
    ticketTraking.finishedAt === null &&
    ticketTraking.userId !== null &&
    ticketTraking.ratingAt !== null
  ) {
    return true;
  }
  return false;
};

export const handleRating = async (
  rate: number,
  ticket: Ticket,
  ticketTraking: TicketTraking
) => {
  const io = getIO();

  const { complationMessage } = await ShowWhatsAppService(
    ticket.whatsappId,
    ticket.companyId
  );

  let finalRate = rate;

  if (rate < 1) {
    finalRate = 1;
  }
  if (rate > 5) {
    finalRate = 5;
  }

  await UserRating.create({
    ticketId: ticketTraking.ticketId,
    companyId: ticketTraking.companyId,
    userId: ticketTraking.userId,
    rate: finalRate
  });

  if (complationMessage) {
    const body = formatBody(`\u200e${complationMessage}`, ticket.contact);
    await SendWhatsAppMessage({ body, ticket });
  }

  await ticketTraking.update({
    finishedAt: moment().toDate(),
    rated: true
  });

  await ticket.update({
    queueId: null,
    chatbot: null,
    queueOptionId: null,
    userId: null,
    status: "closed"
  });

  io.to(`company-${ticket.companyId}-open`)
    .to(`queue-${ticket.queueId}-open`)
    .emit(`company-${ticket.companyId}-ticket`, {
      action: "delete",
      ticket,
      ticketId: ticket.id
    });

  io.to(`company-${ticket.companyId}-${ticket.status}`)
    .to(`queue-${ticket.queueId}-${ticket.status}`)
    .to(ticket.id.toString())
    .emit(`company-${ticket.companyId}-ticket`, {
      action: "update",
      ticket,
      ticketId: ticket.id
    });
};

const handleChartbot = async (
  ticket: Ticket,
  msg: WAMessage,
  wbot: Session,
  dontReadTheFirstQuestion: boolean = false
) => {
  const queue = await Queue.findByPk(ticket.queueId, {
    include: [
      {
        model: QueueOption,
        as: "options",
        where: { parentId: null },
        order: [
          ["option", "ASC"],
          ["createdAt", "ASC"]
        ]
      }
    ]
  });

  const messageBody = getBodyMessage(msg);

  if (messageBody == "#") {
    // voltar para o menu inicial
    await ticket.update({ queueOptionId: null, chatbot: false, queueId: null });
    await verifyQueue(wbot, msg, ticket, ticket.contact);
    return;
  }

  // voltar para o menu anterior
  if (!isNil(queue) && !isNil(ticket.queueOptionId) && messageBody == "0") {
    const option = await QueueOption.findByPk(ticket.queueOptionId);
    await ticket.update({ queueOptionId: option?.parentId });

    // escolheu uma opção
  } else if (!isNil(queue) && !isNil(ticket.queueOptionId)) {
    const count = await QueueOption.count({
      where: { parentId: ticket.queueOptionId }
    });
    let option: any = {};
    if (count == 1) {
      option = await QueueOption.findOne({
        where: { parentId: ticket.queueOptionId }
      });
    } else {
      option = await QueueOption.findOne({
        where: {
          option: messageBody || "",
          parentId: ticket.queueOptionId
        }
      });
    }
    if (option) {
      await ticket.update({ queueOptionId: option?.id });
    }

    // não linha a primeira pergunta
  } else if (
    !isNil(queue) &&
    isNil(ticket.queueOptionId) &&
    !dontReadTheFirstQuestion
  ) {
    const option = queue?.options.find(o => o.option == messageBody);
    if (option) {
      await ticket.update({ queueOptionId: option?.id });
    }
  }

  await ticket.reload();

  if (!isNil(queue) && isNil(ticket.queueOptionId)) {
    const queueOptions = await QueueOption.findAll({
      where: { queueId: ticket.queueId, parentId: null },
      order: [
        ["option", "ASC"],
        ["createdAt", "ASC"]
      ]
    });

    const companyId = ticket.companyId;

    const buttonActive = await Setting.findOne({
      where: {
        key: "chatBotType",
        companyId
      }
    });

    // const botList = async () => {
    // const sectionsRows = [];

    // queues.forEach((queue, index) => {
    //   sectionsRows.push({
    //     title: queue.name,
    //     rowId: `${index + 1}`
    //   });
    // });

    // const sections = [
    //   {
    //     rows: sectionsRows
    //   }
    // ];

    //   const listMessage = {
    //     text: formatBody(`\u200e${queue.greetingMessage}`, ticket.contact),
    //     buttonText: "Escolha uma opção",
    //     sections
    //   };

    //   const sendMsg = await wbot.sendMessage(
    //     `${ticket.contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
    //     listMessage
    //   );

    //   await verifyMessage(sendMsg, ticket, ticket.contact);
    // }

    const botButton = async () => {
      const buttons = [];
      queueOptions.forEach((option, i) => {
        buttons.push({
          buttonId: `${option.option}`,
          buttonText: { displayText: option.title },
          type: 4
        });
      });
      buttons.push({
        buttonId: `#`,
        buttonText: { displayText: "Menu inicial *[ 0 ]* Menu anterior" },
        type: 4
      });

      const buttonMessage = {
        text: formatBody(`\u200e${queue.greetingMessage}`, ticket.contact),
        buttons,
        headerType: 4
      };

      const sendMsg = await wbot.sendMessage(
        `${ticket.contact.number}@${
          ticket.isGroup ? "g.us" : "s.whatsapp.net"
        }`,
        buttonMessage
      );

      await verifyMessage(sendMsg, ticket, ticket.contact);
    };

    const botText = async () => {
      let options = "";

      queueOptions.forEach((option, i) => {
        options += `*[ ${option.option} ]* - ${option.title}\n`;
      });
      //options += `\n*[ 0 ]* - Menu anterior`;
      options += `\n*[ # ]* - Menu inicial`;

      const textMessage = {
        text: formatBody(
          `\u200e${queue.greetingMessage}\n\n${options}`,
          ticket.contact
        )
      };

      const sendMsg = await wbot.sendMessage(
        `${ticket.contact.number}@${
          ticket.isGroup ? "g.us" : "s.whatsapp.net"
        }`,
        textMessage
      );

      await verifyMessage(sendMsg, ticket, ticket.contact);
    };

    // if (buttonActive.value === "list") {
    //   return botList();
    // };

    if (buttonActive.value === "button" && QueueOption.length <= 4) {
      return botButton();
    }

    if (buttonActive.value === "text") {
      return botText();
    }

    if (buttonActive.value === "button" && QueueOption.length > 4) {
      return botText();
    }
  } else if (!isNil(queue) && !isNil(ticket.queueOptionId)) {
    const currentOption = await QueueOption.findByPk(ticket.queueOptionId);
    const queueOptions = await QueueOption.findAll({
      where: { parentId: ticket.queueOptionId },
      order: [
        ["option", "ASC"],
        ["createdAt", "ASC"]
      ]
    });

    if (queueOptions.length > -1) {
      const companyId = ticket.companyId;
      const buttonActive = await Setting.findOne({
        where: {
          key: "chatBotType",
          companyId
        }
      });

      const botList = async () => {
        const sectionsRows = [];

        queueOptions.forEach((option, i) => {
          sectionsRows.push({
            title: option.title,
            rowId: `${option.option}`
          });
        });
        sectionsRows.push({
          title: "Menu inicial *[ 0 ]* Menu anterior",
          rowId: `#`
        });
        const sections = [
          {
            rows: sectionsRows
          }
        ];

        const listMessage = {
          text: formatBody(`\u200e${currentOption.message}`, ticket.contact),
          buttonText: "Escolha uma opção",
          sections
        };

        const sendMsg = await wbot.sendMessage(
          `${ticket.contact.number}@${
            ticket.isGroup ? "g.us" : "s.whatsapp.net"
          }`,
          listMessage
        );

        await verifyMessage(sendMsg, ticket, ticket.contact);
      };

      const botButton = async () => {
        const buttons = [];
        queueOptions.forEach((option, i) => {
          buttons.push({
            buttonId: `${option.option}`,
            buttonText: { displayText: option.title },
            type: 4
          });
        });
        buttons.push({
          buttonId: `#`,
          buttonText: { displayText: "Menu inicial *[ 0 ]* Menu anterior" },
          type: 4
        });

        const buttonMessage = {
          text: formatBody(`\u200e${currentOption.message}`, ticket.contact),
          buttons,
          headerType: 4
        };

        const sendMsg = await wbot.sendMessage(
          `${ticket.contact.number}@${
            ticket.isGroup ? "g.us" : "s.whatsapp.net"
          }`,
          buttonMessage
        );

        await verifyMessage(sendMsg, ticket, ticket.contact);
      };

      const botText = async () => {
        let options = "";

        queueOptions.forEach((option, i) => {
          options += `*[ ${option.option} ]* - ${option.title}\n`;
        });
        options += `\n*[ 0 ]* - Menu anterior`;
        options += `\n*[ # ]* - Menu inicial`;
        const textMessage = {
          text: formatBody(
            `\u200e${currentOption.message}\n\n${options}`,
            ticket.contact
          )
        };

        const sendMsg = await wbot.sendMessage(
          `${ticket.contact.number}@${
            ticket.isGroup ? "g.us" : "s.whatsapp.net"
          }`,
          textMessage
        );

        await verifyMessage(sendMsg, ticket, ticket.contact);
      };

      if (buttonActive.value === "list") {
        return botList();
      }

      if (buttonActive.value === "button" && QueueOption.length <= 4) {
        return botButton();
      }

      if (buttonActive.value === "text") {
        return botText();
      }

      if (buttonActive.value === "button" && QueueOption.length > 4) {
        return botText();
      }
    }
  }
};

const flowbuilderIntegration = async (
  msg: proto.IWebMessageInfo,
  wbot: Session,
  companyId: number,
  queueIntegration: QueueIntegrations,
  ticket: Ticket,
  contact: Contact,
  isFirstMsg?: Ticket,
  isTranfered?: boolean
) => {
  const io = getIO();
  const quotedMsg = await verifyQuotedMessage(msg);
  const body = getBodyMessage(msg);

  /*
  const messageData = {
    wid: msg.key.id,
    ticketId: ticket.id,
    contactId: msg.key.fromMe ? undefined : contact.id,
    body: body,
    fromMe: msg.key.fromMe,
    read: msg.key.fromMe,
    quotedMsgId: quotedMsg?.id,
    ack: Number(String(msg.status).replace('PENDING', '2').replace('NaN', '1')) || 2,
    remoteJid: msg.key.remoteJid,
    participant: msg.key.participant,
    dataJson: optimizeMessageJson(msg),
    createdAt: new Date(
      Math.floor(getTimestampMessage(msg.messageTimestamp) * 1000)
    ).toISOString(),
    ticketImported: ticket.imported,
  };


  await CreateMessageService({ messageData, companyId: ticket.companyId });

  */

  if (msg.key.fromMe) {
    return;
  }

  // Ocultar ticket enquanto o flow está em execução
  // O nó "Ticket" dentro do flow é responsável por torná-lo visível na fila
  if (ticket.status !== "closed" || !ticket.flowWebhook) {
    await ticket.update({ status: "closed", flowWebhook: true, queueId: null, userId: null });
    io.of(String(companyId)).emit(`company-${companyId}-ticket`, {
      action: "delete",
      ticketId: ticket.id
    });
  }

  const whatsapp = await ShowWhatsAppService(wbot.id!, companyId);

  const listPhrase = await FlowCampaignModel.findAll({
    where: {
      whatsappId: whatsapp.id
    }
  });

  // Welcome flow
  if (
    !isFirstMsg &&
    listPhrase.filter(item => item.phrase.toLowerCase() === body.toLowerCase()).length === 0
  ) {
    const flow = await FlowBuilderModel.findOne({
      where: {
        id: whatsapp.flowIdWelcome
      }
    });
    if (flow) {
      const nodes: INodes[] = flow.flow["nodes"];
      const connections: IConnections[] = flow.flow["connections"];

      const mountDataContact = {
        number: contact.number,
        name: contact.name,
        email: contact.email
      };

      // const worker = new Worker("./src/services/WebhookService/WorkerAction.ts");

      // // Enviar as variáveis como parte da mensagem para o Worker
      // console.log('DISPARO1')
      // const data = {
      //   idFlowDb: flowUse.flowIdWelcome,
      //   companyId: ticketUpdate.companyId,
      //   nodes: nodes,
      //   connects: connections,
      //   nextStage: flow.flow["nodes"][0].id,
      //   dataWebhook: null,
      //   details: "",
      //   hashWebhookId: "",
      //   pressKey: null,
      //   idTicket: ticketUpdate.id,
      //   numberPhrase: mountDataContact
      // };
      // worker.postMessage(data);
      // worker.on("message", message => {
      //   console.log(`Mensagem do worker: ${message}`);
      // });

      await ActionsWebhookService(
        whatsapp.id,
        whatsapp.flowIdWelcome,
        ticket.companyId,
        nodes,
        connections,
        flow.flow["nodes"][0].id,
        null,
        "",
        "",
        null,
        ticket.id,
        mountDataContact,
        msg
      );
    }
  }

  const dateTicket = new Date(
    isFirstMsg?.updatedAt ? isFirstMsg.updatedAt : ""
  );

  const dateNow = new Date();
  const diferencaEmMilissegundos = Math.abs(
    differenceInMilliseconds(dateTicket, dateNow)
  );
  //const seisHorasEmMilissegundos = 21600000;
  const seisHorasEmMilissegundos = 0;

  // Flow with not found phrase
  if (
    listPhrase.filter(item => item.phrase.toLowerCase() === body.toLowerCase()).length === 0 &&
    diferencaEmMilissegundos >= seisHorasEmMilissegundos &&
    isFirstMsg
  ) {
    console.log("2427", "handleMessageIntegration");

    const flow = await FlowBuilderModel.findOne({
      where: {
        id: whatsapp.flowIdNotPhrase
      }
    });

    if (flow) {
      const nodes: INodes[] = flow.flow["nodes"];
      const connections: IConnections[] = flow.flow["connections"];

      const mountDataContact = {
        number: contact.number,
        name: contact.name,
        email: contact.email
      };

      await ActionsWebhookService(
        whatsapp.id,
        whatsapp.flowIdNotPhrase,
        ticket.companyId,
        nodes,
        connections,
        flow.flow["nodes"][0].id,
        null,
        "",
        "",
        null,
        ticket.id,
        mountDataContact,
        msg
      );
    }
  }

  // Campaign fluxo
  if (listPhrase.filter(item => item.phrase.toLowerCase() === body.toLowerCase()).length !== 0) {

    const flowDispar = listPhrase.filter(item => item.phrase.toLowerCase() === body.toLowerCase())[0];
    const flow = await FlowBuilderModel.findOne({
      where: {
        id: flowDispar.flowId
      }
    });
    const nodes: INodes[] = flow.flow["nodes"];
    const connections: IConnections[] = flow.flow["connections"];

    const mountDataContact = {
      number: contact.number,
      name: contact.name,
      email: contact.email
    };

    //const worker = new Worker("./src/services/WebhookService/WorkerAction.ts");

    //console.log('DISPARO3')
    // Enviar as variáveis como parte da mensagem para o Worker
    // const data = {
    //   idFlowDb: flowDispar.flowId,
    //   companyId: ticketUpdate.companyId,
    //   nodes: nodes,
    //   connects: connections,
    //   nextStage: flow.flow["nodes"][0].id,
    //   dataWebhook: null,
    //   details: "",
    //   hashWebhookId: "",
    //   pressKey: null,
    //   idTicket: ticketUpdate.id,
    //   numberPhrase: mountDataContact
    // };
    // worker.postMessage(data);

    // worker.on("message", message => {
    //   console.log(`Mensagem do worker: ${message}`);
    // });

    await ActionsWebhookService(
      whatsapp.id,
      flowDispar.flowId,
      ticket.companyId,
      nodes,
      connections,
      flow.flow["nodes"][0].id,
      null,
      "",
      "",
      null,
      ticket.id,
      mountDataContact
    );
    return;
  }

  if (ticket.flowWebhook) {
    const webhook = await WebhookModel.findOne({
      where: {
        company_id: ticket.companyId,
        hash_id: ticket.hashFlowId
      }
    });

    if (webhook && webhook.config["details"]) {
      const flow = await FlowBuilderModel.findOne({
        where: {
          id: webhook.config["details"].idFlow
        }
      });
      const nodes: INodes[] = flow.flow["nodes"];
      const connections: IConnections[] = flow.flow["connections"];

      // const worker = new Worker("./src/services/WebhookService/WorkerAction.ts");

      // console.log('DISPARO4')
      // // Enviar as variáveis como parte da mensagem para o Worker
      // const data = {
      //   idFlowDb: webhook.config["details"].idFlow,
      //   companyId: ticketUpdate.companyId,
      //   nodes: nodes,
      //   connects: connections,
      //   nextStage: ticketUpdate.lastFlowId,
      //   dataWebhook: ticketUpdate.dataWebhook,
      //   details: webhook.config["details"],
      //   hashWebhookId: ticketUpdate.hashFlowId,
      //   pressKey: body,
      //   idTicket: ticketUpdate.id,
      //   numberPhrase: ""
      // };
      // worker.postMessage(data);

      // worker.on("message", message => {
      //   console.log(`Mensagem do worker: ${message}`);
      // });

      await ActionsWebhookService(
        whatsapp.id,
        webhook.config["details"].idFlow,
        ticket.companyId,
        nodes,
        connections,
        ticket.lastFlowId,
        ticket.dataWebhook,
        webhook.config["details"],
        ticket.hashFlowId,
        body,
        ticket.id
      );
    } else {
      const flow = await FlowBuilderModel.findOne({
        where: {
          id: ticket.flowStopped
        }
      });

      const nodes: INodes[] = flow.flow["nodes"];
      const connections: IConnections[] = flow.flow["connections"];

      if (!ticket.lastFlowId) {
        return;
      }

      const mountDataContact = {
        number: contact.number,
        name: contact.name,
        email: contact.email
      };

      // const worker = new Worker("./src/services/WebhookService/WorkerAction.ts");

      // console.log('DISPARO5')
      // // Enviar as variáveis como parte da mensagem para o Worker
      // const data = {
      //   idFlowDb: parseInt(ticketUpdate.flowStopped),
      //   companyId: ticketUpdate.companyId,
      //   nodes: nodes,
      //   connects: connections,
      //   nextStage: ticketUpdate.lastFlowId,
      //   dataWebhook: null,
      //   details: "",
      //   hashWebhookId: "",
      //   pressKey: body,
      //   idTicket: ticketUpdate.id,
      //   numberPhrase: mountDataContact
      // };
      // worker.postMessage(data);
      // worker.on("message", message => {
      //   console.log(`Mensagem do worker: ${message}`);
      // });

      await ActionsWebhookService(
        whatsapp.id,
        parseInt(ticket.flowStopped),
        ticket.companyId,
        nodes,
        connections,
        ticket.lastFlowId,
        null,
        "",
        "",
        body,
        ticket.id,
        mountDataContact,
        msg
      );
    }
  }
};

export const handleMessageIntegration = async (
  msg: proto.IWebMessageInfo,
  wbot: Session,
  queueIntegration: QueueIntegrations,
  ticket: Ticket,
  companyId: number,
  isMenu: boolean = null,
  whatsapp: Whatsapp = null,
  contact: Contact = null,
  isFirstMsg: Ticket | null = null,
): Promise<void> => {
  const msgType = getTypeMessage(msg);

  if (queueIntegration.type === "n8n" || queueIntegration.type === "webhook") {
    if (queueIntegration?.urlN8N) {
      const options = {
        method: "POST",
        url: queueIntegration?.urlN8N,
        headers: {
          "Content-Type": "application/json"
        },
        json: msg
      };
      try {
        request(options, function (error, response) {
          if (error) {
            throw new Error(error);
          } else {
            console.log(response.body);
          }
        });
      } catch (error) {
        throw new Error(error);
      }
    }
  } else if (queueIntegration.type === "typebot") {
    console.log("entrou no typebot");
    // await typebots(ticket, msg, wbot, queueIntegration);
    await typebotListener({ ticket, msg, wbot, typebot: queueIntegration });
  } else if(queueIntegration.type === "flowbuilder") {
    if (!isMenu) {

      await flowbuilderIntegration(
        msg,
        wbot,
        companyId,
        queueIntegration,
        ticket,
        contact,
        isFirstMsg
      );
    } else {
      const msgBody = getBodyMessage(msg);
      const isNumericResponse = !isNaN(parseInt(msgBody)) && msgBody?.trim() !== "";

      if (
        isNumericResponse &&
        ticket.status !== "open" &&
        (ticket.status !== "closed" || ticket.flowWebhook)
      ) {
        await flowBuilderQueue(
          ticket,
          msg,
          wbot,
          whatsapp,
          companyId,
          contact,
          isFirstMsg
        );
      } else if (!isNumericResponse) {
        // Resposta não-numérica enquanto aguarda menu: reinicia o flow
        await flowbuilderIntegration(
          msg,
          wbot,
          companyId,
          queueIntegration,
          ticket,
          contact,
          isFirstMsg
        );
      }
    }
  }
};

const flowBuilderQueue = async (
  ticket: Ticket,
  msg: proto.IWebMessageInfo,
  wbot: Session,
  whatsapp: Whatsapp,
  companyId: number,
  contact: Contact,
  isFirstMsg: Ticket
) => {
  const body = getBodyMessage(msg);

  const flow = await FlowBuilderModel.findOne({
    where: {
      id: ticket.flowStopped
    }
  });

  const mountDataContact = {
    number: contact.number,
    name: contact.name,
    email: contact.email
  };

  const nodes: INodes[] = flow.flow["nodes"];
  const connections: IConnections[] = flow.flow["connections"];

  if (!ticket.lastFlowId) {
    return;
  }

  if (
    (ticket.status === "closed" && !ticket.flowWebhook) ||
    ticket.status === "interrupted" ||
    ticket.status === "open"
  ) {
    return;
  }

  // Ocultar ticket enquanto o flow processa a resposta do menu
  if (ticket.status !== "closed" || !ticket.flowWebhook) {
    const io = getIO();
    await ticket.update({ status: "closed", flowWebhook: true, queueId: null, userId: null });
    io.of(String(companyId)).emit(`company-${companyId}-ticket`, {
      action: "delete",
      ticketId: ticket.id
    });
  }

  await ActionsWebhookService(
    whatsapp.id,
    parseInt(ticket.flowStopped),
    ticket.companyId,
    nodes,
    connections,
    ticket.lastFlowId,
    null,
    "",
    "",
    body,
    ticket.id,
    mountDataContact,
    msg
  );

  //const integrations = await ShowQueueIntegrationService(whatsapp.integrationId, companyId);
  //await handleMessageIntegration(msg, wbot, integrations, ticket, companyId, true, whatsapp);
};


const handleMessage = async (
  msg: proto.IWebMessageInfo,
  wbot: Session,
  companyId: number
): Promise<void> => {
  let mediaSent: Message | undefined;

  if (!isValidMsg(msg)) return;

  try {
    // ============================================================================
    // DEBUG: LOG DA MENSAGEM (nível debug - silencioso em produção)
    // ============================================================================
    logger.debug(`[MSG] remoteJid=${msg.key.remoteJid} fromMe=${msg.key.fromMe} participant=${msg.key.participant || '-'} pushName=${msg.pushName || '-'}`);
    // ============================================================================
    
    // ============================================================================
    // CAPTURA AUTOMÁTICA DE MAPEAMENTOS LID ↔ NÚMERO
    // Baseado no sistema do WAHA (https://github.com/devlikeapro/waha)
    // Salva o mapeamento para resolver LIDs futuros
    // ============================================================================
    try {
      const lidMapping = LidMappingService.extractLidMappingsFromMessage(msg);
      if (lidMapping) {
        await LidMappingService.saveLidMapping({
          lid: lidMapping.lid,
          phoneNumber: lidMapping.pn,
          companyId,
          whatsappId: wbot.id
        });
      }
    } catch (err) {
      logger.error(`[LID-MAPPING] Erro ao processar mapeamento: ${err}`);
    }
    // ============================================================================
    
    let msgContact: IMe;
    let groupContact: Contact | undefined;

    const isGroup = msg.key.remoteJid?.endsWith("@g.us");

    const msgIsGroupBlock = await Setting.findOne({
      where: {
        companyId,
        key: "CheckMsgIsGroup"
      }
    });

    const bodyMessage = getBodyMessage(msg);
    const msgType = getTypeMessage(msg);

    const hasMedia =
      msg.message?.audioMessage ||
      msg.message?.imageMessage ||
      msg.message?.videoMessage ||
      msg.message?.documentMessage ||
      msg.message?.documentWithCaptionMessage ||
      msg.message.stickerMessage;
    
    // ============================================================================
    // PREVENÇÃO: Não processar mensagens fromMe com LID como novas conversas
    // Mensagens enviadas por nós (fromMe=true) não devem criar tickets/contatos
    // Especialmente importantes para LIDs, onde resposta pode vir com wbot.user.id
    // ============================================================================
    if (msg.key.fromMe) {
      // CORREÇÃO: Para GRUPOS, sempre processar mensagens fromMe para exibi-las na conversa
      if (isGroup) {
        msgContact = await getContactMessage(msg, wbot);
      } else {
        // Verificar se é LID (para mensagens individuais)
        if (msg.key.remoteJid?.includes('@lid')) {
          // Tentar encontrar ticket existente com este remoteJid
          const existingTicket = await Ticket.findOne({
            where: {
              lastRemoteJid: msg.key.remoteJid,
              companyId: companyId
            },
            include: [{ model: Contact, as: 'contact' }]
          });
          
          if (existingTicket) {
            await verifyMessage(msg, existingTicket, existingTicket.contact);
            return;
          } else {
            logger.warn(`[MSG-FROM-ME] fromMe+LID sem ticket existente, ignorando: ${msg.key.remoteJid}`);
            return;
          }
        }
        
        // Para mensagens fromMe normais (não LID, não grupo), continuar processamento padrão
        if (/\u200e/.test(bodyMessage)) return;

        if (
          !hasMedia &&
          msgType !== "conversation" &&
          msgType !== "extendedTextMessage" &&
          msgType !== "vcard"
        )
          return;
        msgContact = await getContactMessage(msg, wbot);
      }
    } else {
      msgContact = await getContactMessage(msg, wbot);
    }

    // Se o número foi rejeitado por ser inválido, ignora a mensagem
    if (msgContact === null) {
      logger.warn(`[MESSAGE-SKIP] Mensagem ignorada - número de contato inválido`);
      return;
    }

    if (msgIsGroupBlock?.value === "enabled" && isGroup) return;

    if (isGroup) {
      const grupoMeta = await wbot.groupMetadata(msg.key.remoteJid);
      const msgGroupContact = {
        id: grupoMeta.id,
        name: grupoMeta.subject
      };
      groupContact = await verifyContact(msgGroupContact, wbot, companyId, false); // Grupos: sempre fromMe=false
    }

    const whatsapp = await ShowWhatsAppService(wbot.id!, companyId);
    const contact = await verifyContact(msgContact, wbot, companyId, msg.key.fromMe); // 🆕 Passar fromMe

    // ============================================================================
    // CAPTURA DE MAPEAMENTO LID ↔ PN
    // Salva mapeamentos quando disponíveis para uso posterior em envios
    // Baseado na documentação Baileys v7.0.0 - LIDMappingStore
    // ============================================================================
    await captureLIDMapping(msg, contact, companyId);
    // ============================================================================

    // ============================================================================
    // CORREÇÃO: Para mensagens de GRUPO, usar o contactId do GRUPO
    // Isso evita criar tickets individuais para cada participante
    // ============================================================================
    const ticketContact = groupContact || contact;
    const contactIdForUnreads = groupContact ? groupContact.id : contact.id;
    // ============================================================================

    let unreadMessages = 0;

    if (msg.key.fromMe) {
      await cacheLayer.set(`contacts:${contactIdForUnreads}:unreads`, "0");
    } else {
      const unreads = await cacheLayer.get(`contacts:${contactIdForUnreads}:unreads`);
      unreadMessages = +unreads + 1;
      await cacheLayer.set(
        `contacts:${contactIdForUnreads}:unreads`,
        `${unreadMessages}`
      );
    }

    const lastMessage = await Message.findOne({
      where: {
        contactId: contactIdForUnreads,
        companyId
      },
      order: [["createdAt", "DESC"]]
    });

    if (
      unreadMessages === 0 &&
      whatsapp.complationMessage &&
      formatBody(whatsapp.complationMessage, ticketContact).trim().toLowerCase() ===
        lastMessage?.body.trim().toLowerCase()
    ) {
      return;
    }

    const { ticket } = await FindOrCreateTicketService(
      contact,
      wbot.id!,
      unreadMessages,
      companyId,
      groupContact
    );

    await provider(ticket, msg, companyId, contact, wbot as WASocket);

    // voltar para o menu inicial

    if (bodyMessage == "#") {
      await ticket.update({
        queueOptionId: null,
        chatbot: false,
        queueId: null
      });
      await verifyQueue(wbot, msg, ticket, ticket.contact);
      return;
    }

    const ticketTraking = await FindOrCreateATicketTrakingService({
      ticketId: ticket.id,
      companyId,
      whatsappId: whatsapp?.id
    });

    try {
      if (!msg.key.fromMe) {

        if (ticketTraking !== null && verifyRating(ticketTraking)) {
          handleRating(parseFloat(bodyMessage), ticket, ticketTraking);
          return;
        }
      }
    } catch (e) {
      Sentry.captureException(e);
      console.log(e);
    }

    // Atualiza o ticket se a ultima mensagem foi enviada por mim, para que possa ser finalizado.
    try {
      await ticket.update({
        fromMe: msg.key.fromMe
      });
    } catch (e) {
      Sentry.captureException(e);
      console.log(e);
    }

    if (hasMedia) {
      mediaSent = await verifyMediaMessage(msg, ticket, contact);
    } else {
      await verifyMessage(msg, ticket, contact);
    }

    const currentSchedule = await VerifyCurrentSchedule(companyId);
    const scheduleType = await Setting.findOne({
      where: {
        companyId,
        key: "scheduleType"
      }
    });

    try {
      if (!msg.key.fromMe && scheduleType) {
        /**
         * Tratamento para envio de mensagem quando a empresa está fora do expediente
         */
        if (
          scheduleType.value === "company" &&
          !isNil(currentSchedule) &&
          (!currentSchedule || currentSchedule.inActivity === false)
        ) {
          const body = `\u200e ${whatsapp.outOfHoursMessage}`;

          const debouncedSentMessage = debounce(
            async () => {
              await wbot.sendMessage(
                `${ticket.contact.number}@${
                  ticket.isGroup ? "g.us" : "s.whatsapp.net"
                }`,
                {
                  text: body
                }
              );
            },
            3000,
            ticket.id
          );
          debouncedSentMessage();
          return;
        }

        if (scheduleType.value === "queue" && ticket.queueId !== null) {
          /**
           * Tratamento para envio de mensagem quando a fila está fora do expediente
           */
          const queue = await Queue.findByPk(ticket.queueId);

          const { schedules }: any = queue;
          const now = moment();
          const weekday = now.format("dddd").toLowerCase();
          let schedule = null;

          if (Array.isArray(schedules) && schedules.length > 0) {
            schedule = schedules.find(
              s =>
                s.weekdayEn === weekday &&
                s.startTime !== "" &&
                s.startTime !== null &&
                s.endTime !== "" &&
                s.endTime !== null
            );
          }

          if (
            scheduleType.value === "queue" &&
            queue.outOfHoursMessage !== null &&
            queue.outOfHoursMessage !== "" &&
            !isNil(schedule)
          ) {
            const startTime = moment(schedule.startTime, "HH:mm");
            const endTime = moment(schedule.endTime, "HH:mm");

            if (now.isBefore(startTime) || now.isAfter(endTime)) {
              const body = `${queue.outOfHoursMessage}`;
              const debouncedSentMessage = debounce(
                async () => {
                  await wbot.sendMessage(
                    `${ticket.contact.number}@${
                      ticket.isGroup ? "g.us" : "s.whatsapp.net"
                    }`,
                    {
                      text: body
                    }
                  );
                },
                3000,
                ticket.id
              );
              debouncedSentMessage();
              return;
            }
          }
        }
      }
    } catch (e) {
      Sentry.captureException(e);
      console.log(e);
    }

    const flow = await FlowBuilderModel.findOne({
      where: {
        id: ticket.flowStopped
      }
    });

    let isMenu = false;
    let isOpenai = false;
    let isQuestion = false;

    if (flow) {
      isMenu =
        flow.flow["nodes"].find((node: any) => node.id === ticket.lastFlowId)
          ?.type === "menu";
      isOpenai =
        flow.flow["nodes"].find((node: any) => node.id === ticket.lastFlowId)
          ?.type === "openai";
      isQuestion =
        flow.flow["nodes"].find((node: any) => node.id === ticket.lastFlowId)
          ?.type === "question";
    }

    if (!isNil(flow) && isQuestion && !msg.key.fromMe) {
      console.log(
        "|============= QUESTION =============|",
        JSON.stringify(flow, null, 4)
      );
      const body = getBodyMessage(msg);
      if (body) {
        const nodes: INodes[] = flow.flow["nodes"];
        const nodeSelected = flow.flow["nodes"].find(
          (node: any) => node.id === ticket.lastFlowId
        );

        const connections: IConnections[] = flow.flow["connections"];

        const { message, answerKey } = nodeSelected.data.typebotIntegration;
        const oldDataWebhook = ticket.dataWebhook;

        const nodeIndex = nodes.findIndex(node => node.id === nodeSelected.id);

        const lastFlowId = nodes[nodeIndex + 1].id;
        await ticket.update({
          lastFlowId: lastFlowId,
          dataWebhook: {
            variables: {
              [answerKey]: body
            }
          }
        });

        await ticket.save();

        const mountDataContact = {
          number: contact.number,
          name: contact.name,
          email: contact.email
        };

        await ActionsWebhookService(
          whatsapp.id,
          parseInt(ticket.flowStopped),
          ticket.companyId,
          nodes,
          connections,
          lastFlowId,
          null,
          "",
          "",
          "",
          ticket.id,
          mountDataContact,
          msg
        );
      }

      return;
    }

    if (isOpenai && !isNil(flow) && !ticket.queue) {
      const nodeSelected = flow.flow["nodes"].find(
        (node: any) => node.id === ticket.lastFlowId
      );
      let {
        name,
        prompt,
        voice,
        voiceKey,
        voiceRegion,
        maxTokens,
        temperature,
        apiKey,
        queueId,
        maxMessages
      } = nodeSelected.data.typebotIntegration as IOpenAi;

      let openAiSettings = {
        name,
        prompt,
        voice,
        voiceKey,
        voiceRegion,
        maxTokens: parseInt(maxTokens),
        temperature: parseInt(temperature),
        apiKey,
        queueId: parseInt(queueId),
        maxMessages: parseInt(maxMessages)
      };

      await handleOpenAi(
        msg,
        wbot,
        ticket,
        contact,
        mediaSent,
        ticketTraking,
        openAiSettings,
      );

      return;
    }

    //openai na conexao
    if (
      !ticket.queue &&
      !isGroup &&
      !msg.key.fromMe &&
      !ticket.userId &&
      !isNil(whatsapp.promptId)
    ) {
      await handleOpenAi(msg, wbot, ticket, contact, mediaSent);
    }

    //integraçao na conexao
    if (
      !msg.key.fromMe &&
      !ticket.isGroup &&
      !ticket.queue &&
      !ticket.user &&
      ticket.chatbot &&
      !isNil(whatsapp.integrationId) &&
      !ticket.useIntegration
    ) {

      const integrations = await ShowQueueIntegrationService(
        whatsapp.integrationId,
        companyId
      );

      const isFirstMsgIntegration = await Ticket.findOne({
        where: {
          contactId: groupContact ? groupContact.id : contact.id,
          companyId,
          whatsappId: whatsapp.id
        },
        order: [["id", "DESC"]]
      });

      await handleMessageIntegration(
        msg,
        wbot,
        integrations,
        ticket,
        companyId,
        isMenu,
        whatsapp,
        contact,
        isFirstMsgIntegration
      );

      return;
    }

    //openai na fila
    if (
      !isGroup &&
      !msg.key.fromMe &&
      !ticket.userId &&
      !isNil(ticket.promptId) &&
      ticket.useIntegration &&
      ticket.queueId
    ) {
      await handleOpenAi(msg, wbot, ticket, contact, mediaSent);
    }

    if (
      !msg.key.fromMe &&
      !ticket.isGroup &&
      !ticket.userId &&
      ticket.integrationId &&
      ticket.useIntegration &&
      ticket.queue
    ) {
      console.log("entrou no type 1974");
      const integrations = await ShowQueueIntegrationService(
        ticket.integrationId,
        companyId
      );

      const isFirstMsg = await Ticket.findOne({
        where: {
          contactId: groupContact ? groupContact.id : contact.id,
          companyId,
          whatsappId: whatsapp.id
        },
        order: [["id", "DESC"]]
      });

      await handleMessageIntegration(
        msg,
        wbot,
        integrations,
        ticket,
        companyId,
        isMenu,
        whatsapp,
        contact,
        isFirstMsg
      );
    }

    if (
      !ticket.queue &&
      !ticket.isGroup &&
      !msg.key.fromMe &&
      !ticket.userId &&
      whatsapp.queues.length >= 1 &&
      !ticket.useIntegration
    ) {
      await verifyQueue(wbot, msg, ticket, contact);

      if (ticketTraking && ticketTraking.chatbotAt === null) {
        await ticketTraking.update({
          chatbotAt: moment().toDate()
        });
      }
    }

    const isFirstMsg = await Ticket.findOne({
      where: {
        contactId: groupContact ? groupContact.id : contact.id,
        companyId,
        whatsappId: whatsapp.id
      },
      order: [["id", "DESC"]]
    });

    // integração flowbuilder
    if (
      !msg.key.fromMe &&
      !ticket.isGroup &&
      !ticket.queue &&
      !ticket.user &&
      !isNil(whatsapp.integrationId) &&
      !ticket.useIntegration
    ) {

      const integrations = await ShowQueueIntegrationService(
        whatsapp.integrationId,
        companyId
      );

      await handleMessageIntegration(
        msg,
        wbot,
        integrations,
        ticket,
        companyId,
        isMenu,
        whatsapp,
        contact,
        isFirstMsg
      );
    }

    const dontReadTheFirstQuestion = ticket.queue === null;

    await ticket.reload();

    try {
      //Fluxo fora do expediente
      if (!msg.key.fromMe && scheduleType && ticket.queueId !== null) {
        /**
         * Tratamento para envio de mensagem quando a fila está fora do expediente
         */
        const queue = await Queue.findByPk(ticket.queueId);

        const { schedules }: any = queue;
        const now = moment();
        const weekday = now.format("dddd").toLowerCase();
        let schedule = null;

        if (Array.isArray(schedules) && schedules.length > 0) {
          schedule = schedules.find(
            s =>
              s.weekdayEn === weekday &&
              s.startTime !== "" &&
              s.startTime !== null &&
              s.endTime !== "" &&
              s.endTime !== null
          );
        }

        if (
          scheduleType.value === "queue" &&
          queue.outOfHoursMessage !== null &&
          queue.outOfHoursMessage !== "" &&
          !isNil(schedule)
        ) {
          const startTime = moment(schedule.startTime, "HH:mm");
          const endTime = moment(schedule.endTime, "HH:mm");

          if (now.isBefore(startTime) || now.isAfter(endTime)) {
            const body = queue.outOfHoursMessage;
            const debouncedSentMessage = debounce(
              async () => {
                await wbot.sendMessage(
                  `${ticket.contact.number}@${
                    ticket.isGroup ? "g.us" : "s.whatsapp.net"
                  }`,
                  {
                    text: body
                  }
                );
              },
              3000,
              ticket.id
            );
            debouncedSentMessage();
            return;
          }
        }
      }
    } catch (e) {
      Sentry.captureException(e);
      console.log(e);
    }

    if (
      !whatsapp?.queues?.length &&
      !ticket.userId &&
      !isGroup &&
      !msg.key.fromMe
    ) {
      const lastMessage = await Message.findOne({
        where: {
          ticketId: ticket.id,
          fromMe: true
        },
        order: [["createdAt", "DESC"]]
      });

      if (lastMessage && lastMessage.body.includes(whatsapp.greetingMessage)) {
        return;
      }

      if (whatsapp.greetingMessage) {
        const debouncedSentMessage = debounce(
          async () => {
            await wbot.sendMessage(
              `${ticket.contact.number}@${
                ticket.isGroup ? "g.us" : "s.whatsapp.net"
              }`,
              {
                text: whatsapp.greetingMessage
              }
            );
          },
          1000,
          ticket.id
        );
        debouncedSentMessage();
        return;
      }
    }

    if (whatsapp.queues.length == 1 && ticket.queue) {
      if (ticket.chatbot && !msg.key.fromMe) {
        await handleChartbot(ticket, msg as WAMessage, wbot);
      }
    }

    if (whatsapp.queues.length > 1 && ticket.queue) {
      if (ticket.chatbot && !msg.key.fromMe) {
        await handleChartbot(ticket, msg as WAMessage, wbot, dontReadTheFirstQuestion);
      }
    }

  } catch (err) {
    console.log(err);
    Sentry.captureException(err);
    logger.error(`Error handling whatsapp message: Err: ${err}`);
  }
};

const handleMsgAck = async (
  msg: WAMessage,
  chat: number | null | undefined
) => {
  await new Promise(r => setTimeout(r, 500));
  const io = getIO();

  try {
    const messageToUpdate = await Message.findByPk(msg.key.id, {
      include: [
        "contact",
        {
          model: Message,
          as: "quotedMsg",
          include: ["contact"]
        }
      ]
    });

    if (!messageToUpdate) return;
    await messageToUpdate.update({ ack: chat });
    io.to(messageToUpdate.ticketId.toString()).emit(
      `company-${messageToUpdate.companyId}-appMessage`,
      {
        action: "update",
        message: messageToUpdate
      }
    );
  } catch (err) {
    Sentry.captureException(err);
    logger.error(`Error handling message ack. Err: ${err}`);
  }
};

const verifyCampaignMessageAndCloseTicket = async (
  message: proto.IWebMessageInfo,
  companyId: number
) => {
  const io = getIO();
  const body = getBodyMessage(message);
  const isCampaign = /\u200c/.test(body);
  if (message.key.fromMe && isCampaign) {
    const messageRecord = await Message.findOne({
      where: { id: message.key.id!, companyId }
    });
    const ticket = await Ticket.findByPk(messageRecord.ticketId);
    await ticket.update({ status: "closed" });

    io.to(`company-${ticket.companyId}-open`)
      .to(`queue-${ticket.queueId}-open`)
      .emit(`company-${ticket.companyId}-ticket`, {
        action: "delete",
        ticket,
        ticketId: ticket.id
      });

    io.to(`company-${ticket.companyId}-${ticket.status}`)
      .to(`queue-${ticket.queueId}-${ticket.status}`)
      .to(ticket.id.toString())
      .emit(`company-${ticket.companyId}-ticket`, {
        action: "update",
        ticket,
        ticketId: ticket.id
      });
  }
};

const filterMessages = (msg: WAMessage): boolean => {
  if (msg.message?.protocolMessage) return false;

  if (
    [
      WAMessageStubType.REVOKE,
      WAMessageStubType.E2E_DEVICE_CHANGED,
      WAMessageStubType.E2E_IDENTITY_CHANGED,
      WAMessageStubType.CIPHERTEXT
    ].includes(msg.messageStubType as number)
  )
    return false;

  return true;
};

const wbotMessageListener = async (
  wbot: Session,
  companyId: number
): Promise<void> => {
  try {
    wbot.ev.on("messages.upsert", async (messageUpsert: ImessageUpsert) => {
      const messages = messageUpsert.messages
        .filter(filterMessages)
        .map(msg => msg);

      if (!messages) return;

      for (const message of messages) {
        const messageExists = await Message.count({
          where: { id: message.key.id!, companyId }
        });

        if (!messageExists) {
          await handleMessage(message, wbot, companyId);
          await verifyCampaignMessageAndCloseTicket(message, companyId);
        }
      }
    });

    wbot.ev.on("messages.update", (messageUpdate: WAMessageUpdate[]) => {
      if (messageUpdate.length === 0) return;
      messageUpdate.forEach(async (message: WAMessageUpdate) => {
        (wbot as WASocket)!.readMessages([message.key]);
        handleMsgAck(message, message.update.status);
      });
    });

    // wbot.ev.on("messages.set", async (messageSet: IMessage) => {
    //   messageSet.messages.filter(filterMessages).map(msg => msg);
    // });
  } catch (error) {
    Sentry.captureException(error);
    logger.error(`Error handling wbot message listener. Err: ${error}`);
  }
};

export { wbotMessageListener, handleMessage };
