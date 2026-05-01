import { Module } from '@nestjs/common';
import { AllowlistController } from './allowlist.controller';
import { AllowlistService } from './allowlist.service';

@Module({
  controllers: [AllowlistController],
  providers: [AllowlistService]
})
export class AllowlistModule {}
