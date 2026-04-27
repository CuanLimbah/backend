import { Module } from '@nestjs/common';
<<<<<<< HEAD
=======
import { AuthModule } from '../auth/auth.module';
>>>>>>> cc69ae98d34a300ba14efc95ea8bc82cd8f12463
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
<<<<<<< HEAD
=======
  imports: [AuthModule],
>>>>>>> cc69ae98d34a300ba14efc95ea8bc82cd8f12463
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
