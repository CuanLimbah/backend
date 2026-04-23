import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should expose API metadata', () => {
      const response = appController.getApiInfo();

      expect(response.name).toBe('CuanLimbah Backend API');
      expect(response.status).toBe('ok');
      expect(response.stack).toBe('NestJS');
      expect(response.routes.auth).toContain('/auth/login');
    });
  });
});
