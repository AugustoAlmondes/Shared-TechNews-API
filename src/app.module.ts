import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { SecurityGuard } from './common/guards/security.guard';
import { NewsModule } from './news/news.module';
import { HealthModule } from './health/health.module';
@Module({
  imports: [
    // Importar o módulo de saúde
    HealthModule,
    // Importar o módulo de notícias
    NewsModule,
    // Configuração global do módulo de configuração
    ConfigModule.forRoot({
      isGlobal: true
    }),
    // Timeout de 10 segundos e máximo de 5 redirecionamentos
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5
    }),
    // Cache para armazenar as notícias por 15 minutos
    CacheModule.register({
      isGlobal: true,
      ttl: 1000 * 60 * 15
    }),
    // Limitar o número de requisição por IP
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 30
    }]),
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: SecurityGuard,
    },
  ],
})
export class AppModule { }
