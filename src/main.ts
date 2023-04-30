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

dotenv.config();

main("Jarvis", "+16572017439");

async function main(agentName: string, agentNumber: string) {
  const groupLookup = new Map<string, SignalGroup>();

  while (true) {
    try {
      const [signalGroups, signalEvents] = await Promise.all([
        getSignalGroups(agentNumber),
        getSignalEvents(agentNumber),
      ]);

      for (const group of signalGroups) {
        if (groupLookup.has(group.internal_id)) continue;

        console.log(`Added to group ${group.name}`);
        groupLookup.set(group.internal_id, group);
      }

      // const groupLookup = keyBy(signalGroups, (group) => group.internal_id);

      // if (signalEvents.length) console.log(JSON.stringify(signalEvents, null, 2));

      const updatedChats = new Set<string>();

      for (const { envelope } of signalEvents) {
        const { sourceNumber, sourceName, dataMessage, timestamp } = envelope;
        if (dataMessage) {
          if (dataMessage.message === null) {
            // console.warn(
            //   `Null message in envelope:\n${JSON.stringify(envelope, null, 2)}`
            // );
            continue;
          }

          const chatId = dataMessage.groupInfo?.groupId || sourceNumber;
          updatedChats.add(chatId);

          getMessages(chatId).push({
            sourceNumber,
            sourceName,
            timestamp,
            content: dataMessage.message ?? "",
          });
        }
      }

      if (!updatedChats.size) continue;

      await Promise.all(
        [...updatedChats].map(async (chatId) => {
          const chatMessages = [
            new SystemChatMessage(
              `You are a helpful and friendly assistant named ${agentName}. You are on a first name basis with everyone in the chat. You always answer factually to the best of your ability and never make things up. Some of the conversations in the chat do not involve you; if you are not being addressed should respond with exactly this as the entirety of your response: "${NO_RESPONSE}". It costs money when you respond, so use your best judgement.`
            ),
            ...getMessages(chatId)
              .sort((a, b) => a.timestamp - b.timestamp)
              .map(({ sourceNumber, sourceName, content }) => {
                const message =
                  sourceNumber === agentNumber
                    ? new AIChatMessage(content)
                    : new HumanChatMessage(
                        formatChatMessage(sourceName, content)
                      );
                // message.name = sourceNumber;
                return message;
              }),
            // new HumanChatMessage(formatChatMessage(agentName)),
          ];

          console.log(
            `\n${chatId}\n===\n`,
            JSON.stringify(
              chatMessages.map((msg) => ({
                source: msg.name,
                message: msg.text,
              })),
              null,
              2
            ),
            "\n==="
          );

          const model = new ChatOpenAI({
            temperature: 0,
            modelName: "gpt-3.5-turbo",
          });

          console.log(`[${chatId}] Thinking...`);

          let agentMessage: string;

          try {
            const response = await model.call(chatMessages);
            agentMessage = response.text;
          } catch (e) {
            console.error("Error while consulting LLM", e);
            return;
          }

          console.log(`[${chatId}] Decided on message`);

          let timestamp: number | undefined;
          if (agentMessage === NO_RESPONSE) {
            console.log("No response.");
            timestamp = Date.now();
          } else {
            timestamp = await sendMessage({
              number: agentNumber,
              recipients: [
                groupLookup.get(chatId)?.id || chatId,
                // "group.VHpiT29NL3VDbXJ0Y2R0cmw0Q0pRTUxzbml5UzBvTWd4dXpNVlZPdzE0OD0=",
              ],
              message: agentMessage,
            });
          }

          if (!timestamp) {
            console.log(`[${chatId}] No timestamp receieved`);
            return;
          }

          getMessages(chatId).push({
            sourceNumber: agentNumber,
            sourceName: agentName,
            timestamp,
            content: agentMessage,
          });

          console.log(`[${chatId}] Responded`);
        })
      );
    } finally {
      await sleep(5000);
    }
  }
}

interface Message {
  sourceNumber: string;
  sourceName: string;
  timestamp: number;
  content: string;
}

const chats = new Map<string, Message[]>();

function getMessages(chatId: string) {
  let messages = chats.get(chatId);
  if (!messages) chats.set(chatId, (messages = []));
  return messages;
}

function formatChatMessage(sourceName: string, content = "") {
  return `FROM: ${sourceName}\nMESSAGE: ${content}`;
}

const NO_RESPONSE = "%__NO_RESPONSE__%";
