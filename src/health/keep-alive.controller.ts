import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';

@Controller('keep-alive')
export class KeepAliveController {
  @Get()
  @Public()
  @HttpCode(HttpStatus.OK)
  keepAlive() {
    return { status: 'ok' };
  }
}