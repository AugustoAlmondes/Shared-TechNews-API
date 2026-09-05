import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';

@Controller('keep-alive')
export class KeepAliveController {
  @Get()
  @Public()
  @HttpCode(HttpStatus.OK)
  keepAlive() {
    const time = new Date()
    console.log(`Health checked at: ${time.getHours()}:${time.getMinutes()}:${time.getSeconds()}`)
    return { status: 'ok' };
  }
}