import LIDMapping from "../models/LIDMapping";
import { Op } from "sequelize";
import { logger } from "../utils/logger";

interface LIDMappingData {
  lid: string;
  phoneNumber: string;
  companyId: number;
  contactId?: number;
  source?: string;
  metadata?: object;
}

/**
 * LIDMappingService - Gerencia mapeamentos bidirecionais entre LID e Phone Number
 * 
 * Baseado na documentação do Baileys v7.0.0 LIDMappingStore
 * https://github.com/WhiskeySockets/Baileys/blob/master/WAProto/index.ts
 */
class LIDMappingService {
  /**
   * Cria ou atualiza um mapeamento LID ↔ PN
   */
  public async createOrUpdateMapping(data: LIDMappingData): Promise<LIDMapping> {
    const { lid, phoneNumber, companyId, contactId, source = "message", metadata } = data;

    try {
      // Normalizar JIDs (remover @s.whatsapp.net e @lid se necessário para comparação)
      const normalizedLid = this.normalizeLID(lid);
      const normalizedPN = this.normalizePhoneNumber(phoneNumber);

      // Buscar mapeamento existente
      const existing = await LIDMapping.findOne({
        where: {
          lid: normalizedLid,
          companyId
        }
      });

      if (existing) {
        // Atualizar mapeamento existente
        await existing.update({
          phoneNumber: normalizedPN,
          contactId: contactId || existing.contactId,
          lastSeen: new Date(),
          source,
          metadata: metadata || existing.metadata
        });

        logger.info({
          message: "✅ LID Mapping atualizado",
          lid: normalizedLid,
          phoneNumber: normalizedPN,
          companyId,
          source
        });

        return existing;
      }

      // Criar novo mapeamento
      const mapping = await LIDMapping.create({
        lid: normalizedLid,
        phoneNumber: normalizedPN,
        companyId,
        contactId,
        lastSeen: new Date(),
        source,
        metadata
      });

      logger.info({
        message: "✅ LID Mapping criado",
        lid: normalizedLid,
        phoneNumber: normalizedPN,
        companyId,
        source
      });

      return mapping;
    } catch (error) {
      logger.error({
        message: "❌ Erro ao criar/atualizar LID Mapping",
        lid,
        phoneNumber,
        companyId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Busca Phone Number para um LID
   */
  public async getPhoneNumberForLID(lid: string, companyId: number): Promise<string | null> {
    try {
      const normalizedLid = this.normalizeLID(lid);

      const mapping = await LIDMapping.findOne({
        where: {
          lid: normalizedLid,
          companyId
        },
        order: [["lastSeen", "DESC"]]
      });

      if (mapping) {
        // Atualizar lastSeen
        await mapping.update({ lastSeen: new Date() });

        logger.info({
          message: "✅ LID → PN encontrado",
          lid: normalizedLid,
          phoneNumber: mapping.phoneNumber,
          companyId
        });

        return mapping.phoneNumber;
      }

      logger.warn({
        message: "⚠️ LID → PN não encontrado",
        lid: normalizedLid,
        companyId
      });

      return null;
    } catch (error) {
      logger.error({
        message: "❌ Erro ao buscar PN para LID",
        lid,
        companyId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Busca LID para um Phone Number
   */
  public async getLIDForPhoneNumber(phoneNumber: string, companyId: number): Promise<string | null> {
    try {
      const normalizedPN = this.normalizePhoneNumber(phoneNumber);

      const mapping = await LIDMapping.findOne({
        where: {
          phoneNumber: normalizedPN,
          companyId
        },
        order: [["lastSeen", "DESC"]]
      });

      if (mapping) {
        // Atualizar lastSeen
        await mapping.update({ lastSeen: new Date() });

        logger.info({
          message: "✅ PN → LID encontrado",
          phoneNumber: normalizedPN,
          lid: mapping.lid,
          companyId
        });

        return mapping.lid;
      }

      logger.warn({
        message: "⚠️ PN → LID não encontrado",
        phoneNumber: normalizedPN,
        companyId
      });

      return null;
    } catch (error) {
      logger.error({
        message: "❌ Erro ao buscar LID para PN",
        phoneNumber,
        companyId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Busca todos os mapeamentos para um contactId
   */
  public async getMappingsForContact(contactId: number): Promise<LIDMapping[]> {
    try {
      const mappings = await LIDMapping.findAll({
        where: { contactId },
        order: [["lastSeen", "DESC"]]
      });

      return mappings;
    } catch (error) {
      logger.error({
        message: "❌ Erro ao buscar mapeamentos para contato",
        contactId,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Remove mapeamentos antigos (cache expiration)
   * Baileys recomenda 7 dias de cache
   */
  public async cleanOldMappings(daysOld: number = 7): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const deletedCount = await LIDMapping.destroy({
        where: {
          lastSeen: {
            [Op.lt]: cutoffDate
          }
        }
      });

      logger.info({
        message: "🧹 Mapeamentos antigos removidos",
        deletedCount,
        daysOld,
        cutoffDate
      });

      return deletedCount;
    } catch (error) {
      logger.error({
        message: "❌ Erro ao limpar mapeamentos antigos",
        error: error.message
      });
      return 0;
    }
  }

  /**
   * Normaliza LID: garante formato correto e adiciona @lid se necessário
   */
  private normalizeLID(lid: string): string {
    // Remover @s.whatsapp.net se existir (erro comum)
    let normalized = lid.replace("@s.whatsapp.net", "");
    
    // Adicionar @lid se não tiver
    if (!normalized.includes("@lid")) {
      normalized = `${normalized}@lid`;
    }

    return normalized;
  }

  /**
   * Normaliza Phone Number: garante formato correto e adiciona @s.whatsapp.net se necessário
   */
  private normalizePhoneNumber(phoneNumber: string): string {
    // Remover @lid se existir (erro comum)
    let normalized = phoneNumber.replace("@lid", "");
    
    // Adicionar @s.whatsapp.net se não tiver
    if (!normalized.includes("@s.whatsapp.net") && !normalized.includes("@g.us")) {
      normalized = `${normalized}@s.whatsapp.net`;
    }

    return normalized;
  }

  /**
   * Verifica se um JID é um LID
   */
  public isLID(jid: string): boolean {
    return jid?.includes("@lid") || jid?.includes(":") && !jid.includes("@g.us");
  }

  /**
   * Verifica se um JID é um Phone Number
   */
  public isPhoneNumber(jid: string): boolean {
    return jid?.includes("@s.whatsapp.net") && !this.isLID(jid);
  }

  /**
   * Extrai o número/ID base do JID (sem @lid, @s.whatsapp.net, @g.us)
   */
  public extractBaseId(jid: string): string {
    return jid?.split("@")[0] || jid;
  }
}

export default new LIDMappingService();
