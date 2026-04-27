import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ChatService } from './chat.service';

interface ChatRequestBody {
  message?: string;
  userId?: string;
}

interface KnowledgeRequestBody {
  title?: string;
  content?: string;
}

@Controller('api')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('status')
  getStatus() {
    return this.chatService.getStatus();
  }

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async chat(@Body() body: ChatRequestBody, @Req() request: Request) {
    const message = body.message?.trim();

    if (!message) {
      return { error: 'Message is required.' };
    }

    const headerUserId = request.headers['x-user-id'];
    const userId =
      body.userId ||
      (Array.isArray(headerUserId) ? headerUserId[0] : headerUserId) ||
      'anonymous';

    return this.chatService.handleUserMessage(userId, message);
  }

  @Post('knowledge')
  async ingestKnowledge(@Body() body: KnowledgeRequestBody) {
    if (!body.title?.trim() || !body.content?.trim()) {
      return { error: 'title and content are required.' };
    }

    return this.chatService.ingestKnowledge(body.title.trim(), body.content);
  }
}
