export type MessageAttachment = { name: string; mime: string; size: number };
export type UploadedMessageAttachment = MessageAttachment & { storagePath: string };
export type MessagePerson = { userId: string; name: string; imageUrl: string | null; conversationId: string | null };
export type MessageRequest = { requestId: string; userId: string; name: string; imageUrl?: string | null; body?: string; attachments?: MessageAttachment[]; status?: string; createdAt: string; expiresAt?: string };
export type ConversationSummary = { conversationId: string; userId: string; name: string; imageUrl: string | null; lastMessage: string | null; lastMessageAt: string | null; unreadCount: number };
export type DirectMessage = { messageId: string; senderUserId: string; senderName: string; isOwn: boolean; body: string; attachments: MessageAttachment[]; status: "sent"|"redacted"|"removed"; sentAt: string };
export type MessagingInbox = { incomingRequests: MessageRequest[]; outgoingRequests: MessageRequest[]; conversations: ConversationSummary[] };
