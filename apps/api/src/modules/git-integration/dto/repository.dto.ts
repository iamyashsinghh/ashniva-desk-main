import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const GIT_PROVIDERS = ['GITHUB', 'GITLAB'] as const;
type GitProviderKey = (typeof GIT_PROVIDERS)[number];

export class GitProviderQueryDto {
  @ApiProperty({ enum: GIT_PROVIDERS })
  @IsIn(GIT_PROVIDERS)
  provider!: GitProviderKey;
}

export class LinkRepositoryDto {
  @ApiProperty({ enum: GIT_PROVIDERS })
  @IsIn(GIT_PROVIDERS)
  provider!: GitProviderKey;

  @ApiProperty({ description: "The provider's own repository id, stable across renames." })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  externalRepoId!: string;

  @ApiProperty({ description: 'Owner (GitHub) or group path (GitLab).' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  owner!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ default: 'main' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  defaultBranch?: string;
}
