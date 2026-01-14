import { ConversationChain } from "langchain/chains";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { BufferMemory } from "langchain/memory";
import {
  ChatPromptTemplate,
  HumanMessagePromptTemplate,
  MessagesPlaceholder,
  SystemMessagePromptTemplate,
} from "langchain/prompts";
import { last } from "lodash";
import { getEnv } from "./env";
import {
  SignalEvent,
  SignalGroup,
  SignalMention,
  sendMessage,
} from "./signal-api";
import TaskQueue from "./task-queue";

const { openAIApiKey, agentName, agentPhoneNumber, openAIModel } = getEnv();

export class Chat {
  private taskQueue = new TaskQueue();
  private messages: Message[] = [];
  private chain = new ConversationChain({
    memory: new BufferMemory({ returnMessages: true, memoryKey: "history" }),
    prompt: ChatPromptTemplate.fromPromptMessages([
      SystemMessagePromptTemplate.fromTemplate(
        `
You are an assistant named ${agentName}. You are on a first name basis with everyone in the chat. You should adapt your tone and formality to that of the other participants in the chat.

ABSOLUTELY DO NOT USE ANY OF THE FOLLOWING PHRASES, or anything similar:
"Is there anything else I can assist you with?"
"I'm here to assist you with any questions or concerns you may have"
"If you have any further questions or concerns, please let me know and I will do my best to assist you."
"As an AI language model, ..."
`.trim()
      ),
      new MessagesPlaceholder("history"),
      HumanMessagePromptTemplate.fromTemplate("CHAT EXCERPT:\n\n{input}"),
      HumanMessagePromptTemplate.fromTemplate(
        `Now give your response to the last chat excerpt. Don't prefix it with "FROM:", just provide the text of your response`
      ),
    ]),
    llm: new ChatOpenAI({
      openAIApiKey: openAIApiKey,
      temperature: 0,
      modelName: openAIModel,
    }),
  });
  private phoneNumberToName = new Map<string, string>();

  constructor(private chatId: string, private group?: SignalGroup) {
    this.phoneNumberToName.set(agentPhoneNumber, agentName);
  }

  static getId({ envelope }: SignalEvent): string | undefined {
    const { sourceNumber, sourceName, dataMessage, timestamp } = envelope;
    if (!dataMessage || !dataMessage.message) return;
    return dataMessage.groupInfo?.groupId || sourceNumber;
  }

  start() {
    this.log("Starting");
    this.taskQueue.runPeriodically(this.processEvents.bind(this), 1000);
  }

  addEvent({
    envelope: { sourceNumber, sourceName, timestamp, dataMessage },
  }: SignalEvent) {
    this.phoneNumberToName.set(sourceNumber, sourceName);
    const { message, mentions } = dataMessage!;
    let content = message!;
    if (mentions) {
      const group = this.group!;
      for (const { start, length, name, number } of mentions) {
        content =
          content.substring(0, start) +
          formatMention(this.phoneNumberToName.get(number) || name) +
          content.substring(start + length);
      }
    }
    const lastMessage = last(this.messages);
    if (lastMessage && lastMessage.sourceNumber === sourceNumber) {
      lastMessage.content += `\n${content}`;
    } else {
      this.messages.push({
        sourceNumber,
        sourceName,
        timestamp,
        content,
      });
    }
  }

  private async processEvents() {
    const { chatId, group, chain } = this;

    let numMessagesToSend: number;
    if (this.group) {
      numMessagesToSend = 0;
      for (let i = this.messages.length - 1; i >= 0; i--) {
        if (this.messages[i].content.includes(formatMention(agentName))) {
          numMessagesToSend = i + 1;
          break;
        }
      }
    } else {
      numMessagesToSend = this.messages.length;
    }
    if (numMessagesToSend === 0) return;

    const input = this.messages
      .splice(0, numMessagesToSend)
      .map(({ sourceName, content }) => `FROM: ${sourceName}\n---\n${content}`)
      .join("\n\n");

    this.log("Reflecting...");

    const t0 = Date.now();

    const { response } = await chain.call({ input });

    // this.log("memory", (chain.memory as any).chatHistory.messages);

    this.log("Responding...");

    await sendMessage({
      number: agentPhoneNumber,
      recipients: [group?.id || chatId],
      message: response,
    });

    this.log(`Finished after ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  private log(...params: any[]) {
    console.log(`[${this.chatId}]`, ...params);
  }
}

interface Message {
  sourceNumber: string;
  sourceName: string;
  timestamp: number;
  content: string;
}

function formatMention(name: string) {
  return `@{${name}}`;
}
