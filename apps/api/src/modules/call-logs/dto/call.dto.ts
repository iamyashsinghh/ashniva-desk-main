import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Starting a support call.
 *
 * One field, and it is not the whole consent story: `recordingConsent` is only consulted when the
 * product's policy is `ON_CONSENT`. A product that never records ignores it, and one that always
 * records announces that through the IVR itself. Whoever presses the button cannot turn recording
 * on for a product whose policy is off.
 */
export class InitiateCallDto {
  @ApiPropertyOptional({
    description: 'Whether the caller was told the call may be recorded and agreed',
  })
  @IsOptional()
  @IsBoolean()
  recordingConsent?: boolean;
}
