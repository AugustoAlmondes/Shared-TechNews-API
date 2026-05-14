import { Controller, Get, Head, HttpCode } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {

    constructor(
        private readonly healthService: HealthService,
    ){}

    @Get()
    getHealth() {
        return this.healthService.checkHealth();
    }

    @Head()
    @HttpCode(200)
    keepAlive(){}
}
