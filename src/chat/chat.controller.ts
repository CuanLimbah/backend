import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { ChatService } from './chat.service';

@Controller('api')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
  ) {}

  @Get('status')
  getLegacyStatus() {
    return this.chatService.getStatus();
  }

  @Get('chat/status')
  getStatus() {
    return this.chatService.getStatus();
  }

  @Get('chat/history')
  async getChatHistory(@Req() req: Request) {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return { messages: [] };
      const payload = this.jwtService.verify<JwtPayload>(token);
      const messages = await this.chatService.getHistory(payload.sub);
      return { messages };
    } catch {
      return { messages: [] };
    }
  }

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async handleChat(
    @Body() body: { message: string; userId?: string },
    @Req() req: Request,
  ) {
    if (!body.message) {
      return { error: 'Message is required.' };
    }

    let userId =
      body.userId ||
      (req.headers['x-user-id'] as string | undefined) ||
      'anonymous';
    let isAuthenticated = false;

    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token) {
        const payload = this.jwtService.verify<JwtPayload>(token);
        userId = payload.sub;
        isAuthenticated = true;
      }
    } catch {
      // Invalid/expired token — proceed as anonymous
    }

    return this.chatService.handleMessage(userId, body.message, isAuthenticated);
  }

  @Post('knowledge')
  async ingestKnowledge(@Body() body: { title: string; content: string }) {
    if (!body.title || !body.content) {
      return { error: 'title and content are required.' };
    }

    return this.chatService.ingestKnowledge(body.title, body.content);
  }
}
