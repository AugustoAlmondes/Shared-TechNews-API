import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { KeepAliveController } from './keep-alive.controller';

@Module({
  controllers: [HealthController, KeepAliveController],
  providers: [HealthService]
})
export class HealthModule {}
