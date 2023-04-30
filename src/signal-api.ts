import fetch from "node-fetch";

export interface SignalEvent {
  envelope: SignalEnvelope;
  account: string;
}

export interface SignalEnvelope {
  source: string;
  sourceNumber: string;
  sourceUuid: string;
  sourceName: string;
  sourceDevice: number;
  timestamp: number;
  dataMessage?: SignalDataMessage;
  receiptMessage?: SignalReceiptMessage;
}

export interface SignalDataMessage {
  timestamp: number;
  message: string | null;
  expiresInSeconds: number;
  viewOnce: boolean;
  mentions?: SignalMention[];
  quote?: SignalQuote;
  reaction?: SignalReaction;
  previews?: SignalPreview[];
  groupInfo?: SignalGroupMessageInfo;
}

export interface SignalReceiptMessage {
  when: number;
  isDelivery: boolean;
  isRead: boolean;
  isViewed: boolean;
  timestamps: number[];
}

export interface SignalMention {
  name: string;
  number: string;
  uuid: string;
  start: number;
  length: number;
}

export interface SignalReaction {
  emoji: string;
  targetAuthor: string;
  targetAuthorNumber: string;
  targetAuthorUuid: string;
  targetSentTimestamp: number;
  isRemove: boolean;
}

export interface SignalQuote {
  id: number;
  author: string;
  authorNumber: string;
  authorUuid: string;
  text: string;
  attachments: [];
}

export interface SignalPreview {
  url: string;
  title: string;
  description: string;
  image: {
    contentType: string;
    filename: string | null;
    id: string;
    size: number;
  };
}

export interface SignalGroupMessageInfo {
  groupId: string;
  type: string; // "DELIVER" | ???
}

export interface SignalMessage {
  message: string;
  number: string;
  recipients: string[];
}

export interface SignalGroup {
  name: string;
  id: string;
  internal_id: string;
  members: string[];
  blocked: boolean;
  pending_invites: string[];
  pending_requests: string[];
  invite_link: string;
  admins: string[];
}

export async function getSignalEvents(number: string): Promise<SignalEvent[]> {
  try {
    const response = await fetch(`http://localhost:8080/v1/receive/${number}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    return response.json() as Promise<SignalEvent[]>;
  } catch (error) {
    console.error("Error fetching Signal events", error);
    return [];
  }
}

export async function sendMessage(
  message: SignalMessage
): Promise<number | undefined> {
  // console.log("sendMessage", message);
  try {
    const response = await fetch("http://localhost:8080/v2/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const { timestamp }: any = await response.json();
    return timestamp;
  } catch (error) {
    console.error("Error sending Signal message", error);
    return;
  }
}

export async function getSignalGroups(number: string): Promise<SignalGroup[]> {
  try {
    const response = await fetch(`http://localhost:8080/v1/groups/${number}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    return response.json() as Promise<SignalGroup[]>;
  } catch (error) {
    console.error("Error fetching Signal groups", error);
    return [];
  }
}
