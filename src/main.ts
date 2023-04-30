import dotenv from "dotenv";
import { ChatOpenAI } from "langchain/chat_models/openai";
import {
  AIChatMessage,
  HumanChatMessage,
  SystemChatMessage,
} from "langchain/schema";
import {
  SignalGroup,
  getSignalEvents,
  getSignalGroups,
  sendMessage,
} from "./signal-api";
import { sleep } from "./util";
import { getEnv } from "./env";
import { Chat } from "./chat";

main();

async function main() {
  const { openAIApiKey, agentName, agentPhoneNumber } = getEnv();

  const chats = new Map<string, Chat>();
  const groupLookup = new Map<string, SignalGroup>();

  while (true) {
    try {
      const [signalGroups, signalEvents] = await Promise.all([
        getSignalGroups(agentPhoneNumber),
        getSignalEvents(agentPhoneNumber),
      ]);

      for (const group of signalGroups) {
        if (groupLookup.has(group.internal_id)) continue;
        console.log(`Added to group ${group.name}`);
        groupLookup.set(group.internal_id, group);
      }

      for (const event of signalEvents) {
        const chatId = Chat.getId(event);
        if (!chatId) continue;

        let chat = chats.get(chatId);
        if (!chat) {
          const group = groupLookup.get(chatId);
          chat = new Chat(chatId, group);
          chat.start();
          chats.set(chatId, chat);
        }

        chat.addEvent(event);
      }
    } finally {
      await sleep(1000);
    }
  }
}
