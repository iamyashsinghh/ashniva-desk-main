import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { HEALTH_STATUS } from '@ashniva/types';
import type { Response } from 'express';

import { Public } from '../../common/decorators/public.decorator';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  @Public()
  @ApiOperation({ summary: 'Liveness: the process is running' })
  @ApiOkResponse({ description: 'Always 200 while the process is alive' })
  live(): { status: 'up' } {
    return { status: HEALTH_STATUS.UP };
  }

  @Get()
  @Public()
  @ApiOperation({
    summary:
      'Readiness: database, Redis and object storage are reachable, the scheduled background ' +
      'jobs are registered, and Socket.IO is attached',
  })
  @ApiOkResponse({ description: 'All components up' })
  @ApiServiceUnavailableResponse({
    description: 'At least one component is down (body lists which)',
  })
  async ready(@Res({ passthrough: true }) response: Response) {
    const result = await this.healthService.check();
    if (result.status === HEALTH_STATUS.DOWN) {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }
}
