import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class SecurityGuard implements CanActivate {
  constructor(
    private configService: ConfigService,
    private reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const appKey = request.headers['x-app-key'];
    const userAgent = request.headers['user-agent'];

    const expectedAppKey = this.configService.get<string>('APP_KEY');
    
    if (!expectedAppKey) {
      throw new UnauthorizedException('Server configuration error: APP_KEY not defined');
    }

    if (appKey !== expectedAppKey) {
      throw new UnauthorizedException('Invalid or missing X-App-Key');
    }

    if (userAgent !== 'TechPulse/1.0.0 ReactNative') {
      throw new UnauthorizedException('Invalid or missing User-Agent');
    }

    return true;
  }
}
