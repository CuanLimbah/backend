<<<<<<< HEAD
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
=======
import { Controller, Post, Get, Body, Req, HttpCode, HttpStatus } from '@nestjs/common';
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

  @Get('chat/status')
>>>>>>> cc69ae98d34a300ba14efc95ea8bc82cd8f12463
  getStatus() {
    return this.chatService.getStatus();
  }

  @Post('chat')
  @HttpCode(HttpStatus.OK)
<<<<<<< HEAD
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
=======
  async handleChat(
    @Body() body: { message: string },
    @Req() req: Request,
  ) {
    if (!body.message) {
      return { error: 'Message is required.' };
    }

    let userId = 'anonymous';
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
>>>>>>> cc69ae98d34a300ba14efc95ea8bc82cd8f12463
  }
}
