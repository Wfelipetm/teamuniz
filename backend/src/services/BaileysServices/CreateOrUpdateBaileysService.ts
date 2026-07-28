import { Chat, Contact } from "@whiskeysockets/baileys";
import Baileys from "../../models/Baileys";
import { isArray } from "lodash";

interface Request {
  whatsappId: number;
  contacts?: Contact[];
  chats?: Chat[];
}

const createOrUpdateBaileysService = async ({
  whatsappId,
  contacts,
  chats
}: Request): Promise<Baileys> => {
  const baileysExists = await Baileys.findOne({
    where: { whatsappId }
  });

  if (baileysExists) {
    const getChats = baileysExists.chats
      ? JSON.parse(JSON.stringify(baileysExists.chats))
      : [];
    const getContacts = baileysExists.contacts
      ? JSON.parse(JSON.stringify(baileysExists.contacts))
      : [];

    // LIMITE: Manter apenas últimos 1000 chats/contatos para evitar overflow
    const MAX_ITEMS = 1000;

    if (chats && isArray(getChats)) {
      getChats.push(...chats);
      // Remover duplicatas
      const uniqueChats = Array.from(new Set(getChats.map(c => JSON.stringify(c))))
        .map(s => JSON.parse(s))
        .slice(-MAX_ITEMS); // Manter apenas últimos 1000
      
      const newBaileys = await baileysExists.update({
        chats: JSON.stringify(uniqueChats),
        contacts: baileysExists.contacts // Manter contacts como está
      });
      return newBaileys;
    }

    if (contacts && isArray(getContacts)) {
      getContacts.push(...contacts);
      // Remover duplicatas
      const uniqueContacts = Array.from(new Set(getContacts.map(c => JSON.stringify(c))))
        .map(s => JSON.parse(s))
        .slice(-MAX_ITEMS); // Manter apenas últimos 1000
      
      const newBaileys = await baileysExists.update({
        chats: baileysExists.chats, // Manter chats como está
        contacts: JSON.stringify(uniqueContacts)
      });
      return newBaileys;
    }

    const newBaileys = await baileysExists.update({
      chats: JSON.stringify(getChats),
      contacts: JSON.stringify(getContacts)
    });

    return newBaileys;
  }

  const baileys = await Baileys.create({
    whatsappId,
    contacts: JSON.stringify(contacts),
    chats: JSON.stringify(chats)
  });

  return baileys;
};

export default createOrUpdateBaileysService;
