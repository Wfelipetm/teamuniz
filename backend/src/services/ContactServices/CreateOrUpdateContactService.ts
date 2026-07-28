import { getIO } from "../../libs/socket";
import Contact from "../../models/Contact";
import ContactCustomField from "../../models/ContactCustomField";
import { isNil } from "lodash";
interface ExtraInfo extends ContactCustomField {
  name: string;
  value: string;
}

interface Request {
  name: string;
  number: string;
  isGroup: boolean;
  email?: string;
  profilePicUrl?: string;
  companyId: number;
  extraInfo?: ExtraInfo[];
  whatsappId?: number;
  remoteJid?: string; // ✅ Para identificação única de contatos LID
  addressingMode?: string; // 'lid' ou 'pn'
  alternativeJid?: string;
  fromMe?: boolean; // 🆕 Indica se a mensagem foi enviada por nós (não deve atualizar nome)
}

const CreateOrUpdateContactService = async ({
  name,
  number: rawNumber,
  profilePicUrl,
  isGroup,
  email = "",
  companyId,
  extraInfo = [],
  whatsappId,
  remoteJid: inputRemoteJid, // ✅ Para identificação única de contatos LID
  addressingMode,
  alternativeJid,
  fromMe = false // 🆕 Default false para manter compatibilidade
}: Request): Promise<Contact> => {
  // ⚠️ IMPORTANTE: Preservar identificadores especiais para LIDs (WEB_xxx_READONLY)
  // Apenas remover não-dígitos se for um número de telefone real
  // ✅ CORREÇÃO: rawNumber pode ser null para contatos LID-only
  const isSpecialIdentifier = rawNumber ? (rawNumber.startsWith('WEB_') || rawNumber.startsWith('GROUP_')) : false;
  const number = isGroup || isSpecialIdentifier 
    ? rawNumber 
    : (rawNumber ? rawNumber.replace(/[^0-9]/g, "") : null);

  // Log de entrada
  console.log(`[CONTACT-SERVICE] ========================================`);
  console.log(`[CONTACT-SERVICE] Nome recebido: "${name}"`);
  console.log(`[CONTACT-SERVICE] Número RAW: "${rawNumber}"`);
  console.log(`[CONTACT-SERVICE] Número processado: "${number}" (${number ? number.length : 0} dígitos)`);
  console.log(`[CONTACT-SERVICE] RemoteJid recebido: "${inputRemoteJid}"`);
  console.log(`[CONTACT-SERVICE] AddressingMode: ${addressingMode}`);
  console.log(`[CONTACT-SERVICE] Identificador especial: ${isSpecialIdentifier}`);
  console.log(`[CONTACT-SERVICE] WhatsApp ID: ${whatsappId}`);
  console.log(`[CONTACT-SERVICE] Company ID: ${companyId}`);
  console.log(`[CONTACT-SERVICE] É Grupo: ${isGroup}`);

  const io = getIO();
  let contact: Contact | null;

  // ============================================================================
  // BUSCA DE CONTATO EXISTENTE
  // ============================================================================
  // CORREÇÃO: Quando number é null/vazio (contatos LID), buscar por remoteJid
  // Isso evita conflito entre diferentes contatos LID e grupos
  // ============================================================================
  if (inputRemoteJid && (!number || number === '')) {
    // Busca por remoteJid quando não temos número (contatos LID)
    console.log(`[CONTACT-SERVICE] 🔍 Buscando por remoteJid (number é null): ${inputRemoteJid}`);
    contact = await Contact.findOne({
      where: {
        remoteJid: inputRemoteJid,
        companyId
      }
    });
  } else {
    // Busca padrão por número
    contact = await Contact.findOne({
      where: {
        number,
        companyId
      }
    });
  }

  if (contact) {
    console.log(`[CONTACT-SERVICE] ✅ Contato EXISTENTE encontrado:`);
    console.log(`[CONTACT-SERVICE]    • ID: ${contact.id}`);
    console.log(`[CONTACT-SERVICE]    • Nome atual: "${contact.name}"`);
    console.log(`[CONTACT-SERVICE]    • Novo nome: "${name}"`);
    console.log(`[CONTACT-SERVICE]    • WhatsApp ID atual: ${contact.whatsappId}`);
  } else {
    console.log(`[CONTACT-SERVICE] 🆕 CRIANDO NOVO CONTATO com número: ${number}`);
  }

  if (contact) {
    // Atualiza nome e foto
    const updates: any = { profilePicUrl };
    
    // ============================================================================
    // 🆕 PROTEÇÃO CRÍTICA: NÃO atualizar nome quando fromMe=true
    // Quando fromMe=true, o pushName é o nome que VOCÊ tem salvo no WhatsApp
    // Atualizar com esse nome sobrescreve o nome real do cliente!
    // ============================================================================
    if (fromMe) {
      console.log(`[CONTACT-SERVICE] ⚠️ fromMe=true - NÃO atualizará nome do contato`);
      console.log(`[CONTACT-SERVICE]    Nome que seria usado (incorreto): "${name}"`);
      console.log(`[CONTACT-SERVICE]    Nome preservado: "${contact.name}"`);
      // NÃO adicionar name aos updates quando fromMe=true
    } else {
      // ============================================================================
      // PROTEÇÃO: Não sobrescrever nome válido por número formatado
      // ============================================================================
      // Um nome é considerado "número formatado" se:
      // - Começa com + seguido de dígitos (ex: +5521999999999)
      // - É apenas dígitos
      // - Começa com "Contato " ou "WhatsApp Web"
      // ============================================================================
      const isNewNameFormattedNumber = 
        !name ||
        name.trim() === '' ||
        /^\+?\d[\d\s()-]*$/.test(name) ||  // +55 (21) 99999-9999 ou similar
        name.startsWith('Contato ') ||
        name.startsWith('WhatsApp Web') ||
        name === '.';
      
      const isCurrentNameFormattedNumber = 
        !contact.name ||
        contact.name.trim() === '' ||
        /^\+?\d[\d\s()-]*$/.test(contact.name) ||
        contact.name.startsWith('Contato ') ||
        contact.name.startsWith('WhatsApp Web') ||
        contact.name === '.';
      
      // Atualiza o nome APENAS se:
      // 1. O nome mudou E
      // 2. O novo nome NÃO é número formatado OU o nome atual já é número formatado
      if (contact.name !== name) {
        if (!isNewNameFormattedNumber) {
          // Novo nome é válido (não é número) - SEMPRE atualizar
          console.log(`[CONTACT-SERVICE] 📝 Nome atualizado: "${contact.name}" → "${name}" (nome válido)`);
          updates.name = name;
        } else if (isCurrentNameFormattedNumber) {
          // Ambos são números formatados - atualizar para manter consistência
          console.log(`[CONTACT-SERVICE] 📝 Nome atualizado: "${contact.name}" → "${name}" (ambos formatados)`);
          updates.name = name;
        } else {
          // Novo nome é número formatado MAS atual é nome válido - NÃO ATUALIZAR!
          console.log(`[CONTACT-SERVICE] ⚠️ PROTEGIDO: Não sobrescrever "${contact.name}" por "${name}" (número formatado)`);
          // NÃO adiciona name aos updates
        }
      }
    }
    
    // ✅ Atualiza addressingMode se fornecido e diferente
    if (addressingMode && contact.addressingMode !== addressingMode) {
      console.log(`[CONTACT-SERVICE] 🔧 Atualizando addressingMode: ${contact.addressingMode} → ${addressingMode}`);
      updates.addressingMode = addressingMode;
    }
    
    // ✅ Atualiza alternativeJid se fornecido
    if (alternativeJid && contact.alternativeJid !== alternativeJid) {
      console.log(`[CONTACT-SERVICE] 🔧 Atualizando alternativeJid: ${alternativeJid}`);
      updates.alternativeJid = alternativeJid;
    }
    
    // Garante que remoteJid está preenchido (previne duplicatas)
    // ⚠️ IMPORTANTE: Usar inputRemoteJid se fornecido (contatos LID)
    if (!contact.remoteJid || contact.remoteJid === '') {
      if (inputRemoteJid) {
        updates.remoteJid = inputRemoteJid;
        console.log(`[CONTACT-SERVICE] 🔧 Preenchendo remoteJid (fornecido): ${updates.remoteJid}`);
      } else if (isSpecialIdentifier) {
        // Identificadores especiais não precisam de sufixo
        updates.remoteJid = number;
        console.log(`[CONTACT-SERVICE] 🔧 Preenchendo remoteJid (identificador especial): ${updates.remoteJid}`);
      } else {
        const suffix = isGroup ? '@g.us' : '@s.whatsapp.net';
        updates.remoteJid = `${number}${suffix}`;
        console.log(`[CONTACT-SERVICE] 🔧 Preenchendo remoteJid: ${updates.remoteJid}`);
      }
    }
    
    await contact.update(updates);
    
    // Corrige a verificação do whatsappId
    if (isNil(contact.whatsappId)) {
      console.log(`[CONTACT-SERVICE] 🔗 Atualizando WhatsApp ID para: ${whatsappId}`);
      await contact.update({ whatsappId });
    }
    
    console.log(`[CONTACT-SERVICE] ✅ Contato atualizado com sucesso (ID: ${contact.id})`);
    console.log(`[CONTACT-SERVICE] ========================================\n`);
    
    io.to(`company-${companyId}-mainchannel`).emit(`company-${companyId}-contact`, {
      action: "update",
      contact
    });
  } else {
    // Garante que remoteJid será preenchido no momento da criação
    // ⚠️ IMPORTANTE: Usar inputRemoteJid se fornecido (contatos LID), senão gerar
    let remoteJid: string;
    if (inputRemoteJid) {
      // Usar o remoteJid fornecido (para contatos LID)
      remoteJid = inputRemoteJid;
      console.log(`[CONTACT-SERVICE] 🔧 Usando remoteJid fornecido: ${remoteJid}`);
    } else if (isSpecialIdentifier) {
      // Identificadores especiais não precisam de sufixo
      remoteJid = number;
    } else {
      const suffix = isGroup ? '@g.us' : '@s.whatsapp.net';
      remoteJid = `${number}${suffix}`;
    }
    
    contact = await Contact.create({
      name,
      number,
      profilePicUrl,
      email,
      isGroup,
      extraInfo,
      companyId,
      whatsappId,
      remoteJid,
      addressingMode: addressingMode || null,
      alternativeJid: alternativeJid || null
    });

    console.log(`[CONTACT-SERVICE] ✅ Novo contato criado:`);
    console.log(`[CONTACT-SERVICE]    • ID: ${contact.id}`);
    console.log(`[CONTACT-SERVICE]    • Nome: "${contact.name}"`);
    console.log(`[CONTACT-SERVICE]    • Número: ${contact.number}`);
    console.log(`[CONTACT-SERVICE]    • RemoteJid: ${contact.remoteJid}`);
    console.log(`[CONTACT-SERVICE] ========================================\n`);

    io.to(`company-${companyId}-mainchannel`).emit(`company-${companyId}-contact`, {
      action: "create",
      contact
    });
  }

  return contact;
};

export default CreateOrUpdateContactService;
