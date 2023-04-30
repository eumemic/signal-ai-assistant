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
import { SignalEvent, SignalGroup, sendMessage } from "./signal-api";
import TaskQueue from "./task-queue";

const { openAIApiKey, agentName, agentPhoneNumber } = getEnv();

export class Chat {
  private taskQueue = new TaskQueue();
  private messages: Message[] = [];
  private chain = new ConversationChain({
    memory: new BufferMemory({ returnMessages: true, memoryKey: "history" }),
    prompt: ChatPromptTemplate.fromPromptMessages([
      SystemMessagePromptTemplate.fromTemplate(
        `You are a helpful and friendly assistant named ${agentName}. You are on a first name basis with everyone in the chat. You always answer factually to the best of your ability and never make things up. Some of the conversations in the chat do not involve you; if you are not being addressed should respond with exactly this as the entirety of your response: "${NO_RESPONSE}". It costs money when you respond, so use your best judgement.`
      ),
      new MessagesPlaceholder("history"),
      HumanMessagePromptTemplate.fromTemplate("{input}"),
    ]),
    llm: new ChatOpenAI({
      openAIApiKey: openAIApiKey,
      temperature: 0,
      modelName: "gpt-3.5-turbo",
    }),
  });

  constructor(private chatId: string, private group?: SignalGroup) {}

  static getId({ envelope }: SignalEvent): string | undefined {
    2;
    const { sourceNumber, sourceName, dataMessage, timestamp } = envelope;
    if (!dataMessage || !dataMessage.message) return;
    return dataMessage.groupInfo?.groupId || sourceNumber;
  }

  start() {
    this.log("Starting");
    this.taskQueue.runPeriodically(this.processEvents.bind(this), 1000);
  }

  addEvent({
    envelope: { sourceNumber, sourceName, dataMessage, timestamp },
  }: SignalEvent) {
    const content = dataMessage!.message!;
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
    const { chatId, group, messages, chain } = this;
    if (!messages.length) return;

    this.log("Reflecting...");

    const t0 = Date.now();

    const responses = (await chain.apply(
      messages.map(({ sourceName, content }) => ({
        input: `FROM: ${sourceName}\n---\n${content}`,
      }))
    )) as { response: string }[];

    // this.log("memory", (chain.memory as any).chatHistory.messages);

    for (const { response } of responses) {
      if (response === NO_RESPONSE) {
        this.log("Chose not to respond");
        continue;
      }

      this.log("Responding...");

      await sendMessage({
        number: agentPhoneNumber,
        recipients: [group?.id || chatId],
        message: response,
      });
    }

    messages.length = 0;

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

const NO_RESPONSE = "%__NO_RESPONSE__%";
