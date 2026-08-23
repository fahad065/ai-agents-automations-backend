import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { Chatbot, ChatbotDocument } from './schemas/chatbot.schema';
import { KnowledgeBase, KnowledgeBaseDocument } from './schemas/knowledge-base.schema';
import { Conversation, ConversationDocument } from './schemas/conversation.schema';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { ApiKeyProvider } from '../api-keys/schemas/api-key.schema';

@Injectable()
export class ChatbotsService {
  constructor(
    @InjectModel(Chatbot.name) private chatbotModel: Model<ChatbotDocument>,
    @InjectModel(KnowledgeBase.name) private knowledgeBaseModel: Model<KnowledgeBaseDocument>,
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    private apiKeysService: ApiKeysService,
  ) {}

  async create(userId: string, dto: any): Promise<ChatbotDocument> {
    const embedKey = crypto.randomBytes(16).toString('hex');
    const chatbot = await this.chatbotModel.create({
      ...dto,
      userId: new Types.ObjectId(userId),
      embedKey,
    });
    return chatbot;
  }

  async findAllByUser(userId: string): Promise<ChatbotDocument[]> {
    return this.chatbotModel.find({ userId: new Types.ObjectId(userId) }).sort({ createdAt: -1 });
  }

  async findOne(id: string, userId: string): Promise<ChatbotDocument> {
    const chatbot = await this.chatbotModel.findById(id);
    if (!chatbot) throw new NotFoundException('Chatbot not found');
    if (chatbot.userId.toString() !== userId) throw new ForbiddenException('Access denied');
    return chatbot;
  }

  async update(id: string, userId: string, dto: any): Promise<ChatbotDocument> {
    const chatbot = await this.findOne(id, userId);
    Object.assign(chatbot, dto);
    return chatbot.save();
  }

  async delete(id: string, userId: string): Promise<{ message: string }> {
    const chatbot = await this.findOne(id, userId);
    const chatbotId = chatbot._id as Types.ObjectId;
    await Promise.all([
      this.chatbotModel.findByIdAndDelete(chatbotId),
      this.knowledgeBaseModel.deleteMany({ chatbotId }),
      this.conversationModel.deleteMany({ chatbotId }),
    ]);
    return { message: 'Chatbot deleted' };
  }

  private async getEmbedding(text: string, apiKey: string): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI embeddings error: ${response.status}`);
    }

    const data = await response.json() as any;
    return data.data[0].embedding as number[];
  }

  async addKnowledge(chatbotId: string, userId: string, dto: any): Promise<KnowledgeBaseDocument> {
    // Verify ownership
    await this.findOne(chatbotId, userId);

    let embedding: number[] = [];

    try {
      const apiKey = await this.apiKeysService.getDecryptedKey(userId, ApiKeyProvider.OPENAI);

      let textToEmbed = '';
      if (dto.type === 'faq') {
        textToEmbed = `${dto.question || ''} ${dto.answer || ''}`.trim();
      } else {
        textToEmbed = dto.content || '';
      }

      if (textToEmbed) {
        embedding = await this.getEmbedding(textToEmbed, apiKey);
      }
    } catch {
      // No API key or embedding failed — store without embedding
      embedding = [];
    }

    return this.knowledgeBaseModel.create({
      ...dto,
      chatbotId: new Types.ObjectId(chatbotId),
      embedding,
    });
  }

  async listKnowledge(chatbotId: string, userId: string): Promise<KnowledgeBaseDocument[]> {
    await this.findOne(chatbotId, userId);
    return this.knowledgeBaseModel
      .find({ chatbotId: new Types.ObjectId(chatbotId) })
      .select('-embedding')
      .sort({ createdAt: -1 });
  }

  async deleteKnowledge(chatbotId: string, knowledgeId: string, userId: string): Promise<{ message: string }> {
    await this.findOne(chatbotId, userId);
    const result = await this.knowledgeBaseModel.findOneAndDelete({
      _id: new Types.ObjectId(knowledgeId),
      chatbotId: new Types.ObjectId(chatbotId),
    });
    if (!result) throw new NotFoundException('Knowledge entry not found');
    return { message: 'Knowledge entry deleted' };
  }

  async getConversations(chatbotId: string, userId: string, limit = 20): Promise<ConversationDocument[]> {
    await this.findOne(chatbotId, userId);
    return this.conversationModel
      .find({ chatbotId: new Types.ObjectId(chatbotId) })
      .sort({ createdAt: -1 })
      .limit(Number(limit));
  }

  async getAnalytics(chatbotId: string, userId: string): Promise<any> {
    await this.findOne(chatbotId, userId);

    const conversations = await this.conversationModel.find({
      chatbotId: new Types.ObjectId(chatbotId),
    });

    const totalConversations = conversations.length;
    const totalMessages = conversations.reduce((sum, c) => sum + c.messages.length, 0);
    const avgMessagesPerConversation = totalConversations
      ? Math.round((totalMessages / totalConversations) * 10) / 10
      : 0;
    const handoffs = conversations.filter((c) => c.status === 'handoff').length;

    const byChannel: Record<string, number> = { website: 0, whatsapp: 0, instagram: 0 };
    for (const c of conversations) {
      byChannel[c.channel] = (byChannel[c.channel] || 0) + 1;
    }

    return {
      totalConversations,
      totalMessages,
      avgMessagesPerConversation,
      handoffs,
      byChannel,
    };
  }

  async getEmbedCode(chatbotId: string, userId: string): Promise<{ embedCode: string }> {
    const chatbot = await this.findOne(chatbotId, userId);
    const color = chatbot.channels?.website?.customColor || '#7c3aed';
    const welcome = chatbot.channels?.website?.welcomeMessage || '';
    const welcomeAr = chatbot.channels?.website?.welcomeMessage_ar || '';
    const frontendUrl = process.env.FRONTEND_URL || 'https://www.logicmate.io';
    const apiUrl = process.env.PUBLIC_API_URL || `${process.env.FRONTEND_URL || 'https://www.logicmate.io'}/api/v1`;
    const embedCode = `<!-- LogicMate Chatbot Widget -->
<script>
  window.LMChatbot = {
    embedKey: "${chatbot.embedKey}",
    color: "${color}",
    apiUrl: "${apiUrl}",
    botName: "${chatbot.name.replace(/"/g, '\\"')}"${welcome ? `,\n    welcomeMessage: "${welcome.replace(/"/g, '\\"')}"` : ''}${welcomeAr ? `,\n    welcomeMessageAr: "${welcomeAr.replace(/"/g, '\\"')}"` : ''}
  };
</script>
<script src="${frontendUrl}/chatbot-widget.js" async></script>`;
    return { embedCode };
  }
}
