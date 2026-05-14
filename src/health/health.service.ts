import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
    checkHealth() {
        return {
            ok: true,
            uptime: process.uptime(),
            timestamp: new Date(),
        };
    }
}
