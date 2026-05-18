import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
    checkHealth() {
        console.log("New request")
        return {
            ok: true,
            uptime: process.uptime(),
            timestamp: new Date(),
        };
    }
}
