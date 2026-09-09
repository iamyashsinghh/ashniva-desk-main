import { Module } from '@nestjs/common';

import { ProblemsModule } from '../problems/problems.module';
import { RcaController } from './rca.controller';
import { RcaRepository } from './rca.repository';
import { RcaService } from './rca.service';

/**
 * Root-cause analyses: the approved form's ten questions, and the review that accepts them.
 *
 * Imports `ProblemsModule` and is not imported by it. The dependency runs one way on purpose —
 * a problem's own rules should not come to depend on the shape of a form, and the closure gate
 * reads the report's status rather than asking this module anything.
 */
@Module({
  imports: [ProblemsModule],
  controllers: [RcaController],
  providers: [RcaRepository, RcaService],
})
export class RcaModule {}
