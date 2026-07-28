import Contact from "../../models/Contact";
import { Op } from "sequelize";
import { logger } from "../../utils/logger";

/**
 * Serviço para mapear LIDs (WhatsApp Business IDs) para números reais
 * Baseado na arquitetura do WAHA (https://github.com/devlikeapro/waha)
 */

interface LidMapping {
  lid: string;
  phoneNumber: string;
  companyId: number;
  whatsappId: number;
}

class LidMappingService {
  /**
   * Salva ou atualiza um mapeamento LID → Número
   */
  async saveLidMapping(mapping: LidMapping): Promise<void> {
    logger.info(`[LID-MAPPING] Salvando mapeamento: ${mapping.lid} → ${mapping.phoneNumber}`);
    
    // Buscar contato pelo número real
    const contact = await Contact.findOne({
      where: {
        number: mapping.phoneNumber,
        companyId: mapping.companyId,
        whatsappId: mapping.whatsappId
      }
    });

    if (contact) {
      // Atualizar com o LID
      await contact.update({
        remoteJid: `${mapping.lid}@lid`
      });
      logger.info(`[LID-MAPPING] ✅ Mapeamento salvo no contato ID ${contact.id}`);
    } else {
      logger.warn(`[LID-MAPPING] ⚠️ Contato não encontrado para número ${mapping.phoneNumber}`);
    }
  }

  /**
   * Busca número de telefone real a partir de um LID
   */
  async findPhoneNumberByLid(
    lid: string,
    companyId: number,
    whatsappId: number
  ): Promise<string | null> {
    logger.info(`[LID-MAPPING] Buscando número para LID: ${lid}`);
    
    // Remover @lid se existir
    const cleanLid = lid.replace('@lid', '');
    
    // Buscar contato que tenha esse LID no remoteJid ou no número
    const contact = await Contact.findOne({
      where: {
        [Op.or]: [
          { remoteJid: `${cleanLid}@lid` },
          { remoteJid: { [Op.like]: `%${cleanLid}%` } }
        ],
        companyId,
        whatsappId,
        number: {
          [Op.ne]: null,
          [Op.ne]: ''
        }
      },
      order: [['updatedAt', 'DESC']]
    });

    if (contact && contact.number) {
      logger.info(`[LID-MAPPING] ✅ Encontrado número: ${contact.number}`);
      return contact.number;
    }

    logger.warn(`[LID-MAPPING] ⚠️ Número não encontrado para LID ${lid}`);
    return null;
  }

  /**
   * Busca LID a partir de um número de telefone
   */
  async findLidByPhoneNumber(
    phoneNumber: string,
    companyId: number,
    whatsappId: number
  ): Promise<string | null> {
    logger.info(`[LID-MAPPING] Buscando LID para número: ${phoneNumber}`);
    
    const contact = await Contact.findOne({
      where: {
        number: phoneNumber,
        companyId,
        whatsappId,
        remoteJid: {
          [Op.like]: '%@lid'
        }
      },
      order: [['updatedAt', 'DESC']]
    });

    if (contact && contact.remoteJid) {
      logger.info(`[LID-MAPPING] ✅ Encontrado LID: ${contact.remoteJid}`);
      return contact.remoteJid;
    }

    logger.warn(`[LID-MAPPING] ⚠️ LID não encontrado para número ${phoneNumber}`);
    return null;
  }

  /**
   * Extrai mapeamentos de uma mensagem Baileys
   * Inspirado no handleLidPNUpdates do WAHA
   */
  extractLidMappingsFromMessage(msg: any): {lid: string, pn: string} | null {
    // Verificar se a mensagem tem key.remoteJid e key.remoteJidAlt
    const key = msg.key;
    if (!key) return null;

    let lid: string | undefined;
    let pn: string | undefined;

    // Mensagem direta (não grupo)
    if (!key.participant) {
      if (key.remoteJid?.includes('@lid')) {
        lid = key.remoteJid;
        pn = key.remoteJidAlt; // Baileys pode fornecer o número aqui
      } else if (key.remoteJid?.includes('@s.whatsapp.net')) {
        pn = key.remoteJid;
        lid = key.remoteJidAlt; // Baileys pode fornecer o LID aqui
      }
    }
    // Mensagem de grupo
    else {
      if (key.participant?.includes('@lid')) {
        lid = key.participant;
        pn = key.participantAlt;
      } else if (key.participant?.includes('@s.whatsapp.net')) {
        pn = key.participant;
        lid = key.participantAlt;
      }
    }

    // Se encontrou ambos, retornar
    if (lid && pn) {
      const cleanLid = lid.replace('@lid', '');
      const cleanPn = pn.replace('@s.whatsapp.net', '').split(':')[0];
      
      logger.info(`[LID-MAPPING] ✅ Mapeamento extraído: LID=${cleanLid} PN=${cleanPn}`);
      
      return {
        lid: cleanLid,
        pn: cleanPn
      };
    }

    return null;
  }
}

export default new LidMappingService();
