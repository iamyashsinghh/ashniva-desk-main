import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class LoginDto {
  @ApiProperty({ example: 'developer@example.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Organization to sign in to when the user belongs to several',
  })
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}

export class SwitchOrganizationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  organizationId!: string;
}
