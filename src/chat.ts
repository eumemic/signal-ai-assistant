import { ChatOpenAI } from "langchain/chat_models/openai";
import {
  AIChatMessage,
  HumanChatMessage,
  SystemChatMessage,
} from "langchain/schema";
import { getEnv } from "./env";
import { SignalEvent, SignalGroup, sendMessage } from "./signal-api";
import TaskQueue from "./task-queue";

export class Chat {
  private taskQueue = new TaskQueue();
  private messages: Message[] = [];
  private pending = false;

  constructor(private chatId: string, private group?: SignalGroup) {}

  static getId({ envelope }: SignalEvent): string | undefined {
    2;
    const { sourceNumber, sourceName, dataMessage, timestamp } = envelope;
    if (!dataMessage || !dataMessage.message) return;
    return dataMessage.groupInfo?.groupId || sourceNumber;
  }

  start() {
    this.taskQueue.runPeriodically(() => this.processEvents(), 1000);
    return this;
  }

  addEvent({ envelope }: SignalEvent) {
    const { sourceNumber, sourceName, dataMessage, timestamp } = envelope;
    this.messages.push({
      sourceNumber,
      sourceName,
      timestamp,
      content: dataMessage!.message!,
    });
    this.pending = true;
  }

  private async processEvents() {
    if (!this.pending) return;
    this.pending = false;

    const { openAIApiKey, agentName, agentPhoneNumber } = getEnv();
    const { chatId, group, messages } = this;

    const chatMessages = [
      new SystemChatMessage(
        `You are a helpful and friendly assistant named ${agentName}. You are on a first name basis with everyone in the chat. You always answer factually to the best of your ability and never make things up. Some of the conversations in the chat do not involve you; if you are not being addressed should respond with exactly this as the entirety of your response: "${NO_RESPONSE}". It costs money when you respond, so use your best judgement.`
      ),
      ...messages
        .sort((a, b) => a.timestamp - b.timestamp)
        .map(({ sourceNumber, sourceName, content }) => {
          const message =
            sourceNumber === agentPhoneNumber
              ? new AIChatMessage(content)
              : new HumanChatMessage(
                  `FROM: ${sourceName}\nMESSAGE: ${content}`
                );
          // message.name = sourceNumber;
          return message;
        }),
      // new HumanChatMessage(formatChatMessage(agentName)),
    ];

    // this.log(
    //   `\n===\n`,
    //   JSON.stringify(
    //     chatMessages.map((msg) => ({
    //       source: msg.name,
    //       message: msg.text,
    //     })),
    //     null,
    //     2
    //   ),
    //   "\n==="
    // );

    const model = new ChatOpenAI({
      openAIApiKey,
      temperature: 0,
      modelName: "gpt-3.5-turbo",
    });

    this.log(`Reflecting on ${chatMessages.length} messages...`);

    const t0 = Date.now();

    let agentMessage: string;

    try {
      const response = await model.call(chatMessages);
      agentMessage = response.text;
    } catch (e) {
      console.error("Error while consulting LLM", e);
      return;
    }

    this.log(`Decided after ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    let timestamp: number | undefined;
    if (agentMessage === NO_RESPONSE) {
      this.log("No response");
      timestamp = Date.now();
    } else {
      timestamp = await sendMessage({
        number: agentPhoneNumber,
        recipients: [group?.id || chatId],
        message: agentMessage,
      });
    }

    if (!timestamp) {
      this.log(`No timestamp receieved`);
      return;
    }

    messages.push({
      sourceNumber: agentPhoneNumber,
      sourceName: agentName,
      timestamp,
      content: agentMessage,
    });

    this.log(`Responded`);
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
