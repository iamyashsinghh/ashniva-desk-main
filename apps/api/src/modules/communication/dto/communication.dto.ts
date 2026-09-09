import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CONVERSATION_KIND,
  DEFAULT_MENTIONABLE_LIMIT,
  INTERNAL_CALL_FALLBACK,
  MAX_MENTIONABLE_LIMIT,
  MAX_MENTIONABLE_QUERY_LENGTH,
  MIN_MENTIONABLE_QUERY_LENGTH,
  MAX_MESSAGE_ATTACHMENTS,
  MAX_MESSAGE_LENGTH,
  MAX_MESSAGE_PAGE,
  RECORDING_PLAYBACK_SCOPE,
  RECORDING_POLICY,
  type ConversationKind,
  type InternalCallFallback,
  type RecordingPlaybackScope,
  type RecordingPolicy,
} from '@ashniva/types';
import { Transform, type TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * A boolean query parameter, read from the request rather than from the converted value.
 *
 * `?unreadOnly=false` used to filter the list *down to* unread conversations — the exact opposite
 * of what it asked for — because the global pipe runs with `enableImplicitConversion`, whose rule
 * for a boolean property is `Boolean(value)`, and `Boolean('false')` is `true`.
 *
 * The usual `@Transform(({ value }) => value === 'true')` does not fix it, because class-
 * transformer applies the implicit conversion *before* the custom transform: by the time the
 * transform runs, `'false'` has already become `true` and the string it wanted to test is gone.
 * So this reads the untouched value off the source object instead. `undefined` is returned
 * unchanged so that `@IsOptional` still sees an absent parameter as absent rather than as `false`.
 */
function rawBoolean({ obj, key }: TransformFnParams): boolean | undefined {
  const raw = (obj as Record<string, unknown>)[key];
  return raw === undefined ? undefined : raw === true || raw === 'true';
}

/**
 * Trims a string before the validators see it, so a length rule measures what will be stored.
 *
 * Both message paths trim the body on the way to the database, which meant `@MinLength(1)` was
 * measuring a string nobody keeps: `"   "` is one character long to the validator and zero
 * characters long in the row. Anything but a string is passed through untouched so `@IsString`
 * still produces the type error rather than this transform throwing one.
 */
function trimmed({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

const KINDS = Object.values(CONVERSATION_KIND);
const POLICIES = Object.values(RECORDING_POLICY);
const SCOPES = Object.values(RECORDING_PLAYBACK_SCOPE);
const FALLBACKS = Object.values(INTERNAL_CALL_FALLBACK);

/**
 * Starting a conversation.
 *
 * Which of the identifiers matters depends on the kind, and the service checks that rather than
 * the validator: a `TASK` conversation resolves its project *from* the task, so accepting a
 * `projectId` alongside one would be accepting an answer the caller does not get to give.
 */
export class CreateConversationDto {
  @ApiProperty({ enum: KINDS })
  @IsIn(KINDS)
  kind!: ConversationKind;

  @ApiPropertyOptional({ format: 'uuid', description: 'For a PROJECT or DIRECT conversation' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'For a TASK conversation' })
  @IsOptional()
  @IsUUID()
  taskId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'For a TICKET conversation' })
  @IsOptional()
  @IsUUID()
  ticketId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'The one other person, for DIRECT' })
  @IsOptional()
  @IsUUID()
  withUserId?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;
}

export class SendMessageDto {
  /**
   * The words, trimmed before validating so a length rule measures what will be stored.
   *
   * **Optional, because a message may be a file instead.** Both composers offer Send with an
   * attachment and no text, and both send `body: ''` when somebody uses it — so `@MinLength(1)`
   * here made that button post a request the API always refused. What replaces it is *"a message
   * must carry something"*, which is a rule about two fields at once and therefore belongs where
   * this module already puts them: `MessagesService.send`, next to the anchor rules that
   * `CreateConversationDto` leaves to `ConversationAnchorService` for the same reason. A validator
   * on one property cannot say "unless the other one is filled in" without giving up the length
   * check on this one.
   *
   * `@MaxLength` stays here and unconditional, so an oversized body is refused whether or not a
   * file came with it.
   */
  @ApiPropertyOptional({
    maxLength: MAX_MESSAGE_LENGTH,
    description: 'The words. May be empty or absent only when the message carries an attachment.',
  })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(MAX_MESSAGE_LENGTH)
  body?: string;

  @ApiPropertyOptional({
    isArray: true,
    format: 'uuid',
    description: 'Files already uploaded through the files module. Never a second upload path.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MESSAGE_ATTACHMENTS)
  // Any version, not v4: every id in this product is a UUIDv7, so `@IsUUID('4')` rejected every
  // real file id. Nothing noticed because nothing had ever passed one.
  @IsUUID(undefined, { each: true })
  attachmentIds?: string[];

  @ApiPropertyOptional({
    maxLength: 64,
    description: 'The sender’s own id for this send. A retry with the same value posts once.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientMessageId?: string;
}

/**
 * Rewriting one of your own messages. Only the body: nothing else about a message is editable.
 *
 * The body is trimmed *before* `@MinLength(1)` runs, because the moderation service trims it again
 * on the way to the row. Without that, `{ "body": "   " }` validated, stored as `''`, and gave an
 * ordinary sender a self-withdraw by the back door — emptying their own message inside the edit
 * window through the very endpoint that refuses `DELETE` with "a message cannot be withdrawn once
 * it is sent". A body that is legitimately padded still succeeds and is still stored trimmed.
 */
export class EditMessageDto {
  @ApiProperty({ maxLength: MAX_MESSAGE_LENGTH })
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_MESSAGE_LENGTH)
  body!: string;
}

export class ListMessagesQueryDto {
  /**
   * `@IsInt` with no `@Type(() => Number)` and no `@Transform`, and that is correct here rather
   * than an omission: the global pipe in `app.setup.ts` runs with `enableImplicitConversion`, so
   * class-transformer converts the query string to the reflected `Number` before the validator
   * sees it. It is the house pattern — `PaginationQueryDto` does the same — and it is covered by
   * a test in `communication.e2e-spec.ts` so nobody has to take this comment's word for it.
   */
  @ApiPropertyOptional({ maximum: MAX_MESSAGE_PAGE, default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_MESSAGE_PAGE)
  limit?: number;

  @ApiPropertyOptional({ description: 'Id of the oldest message already held, for the next page' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string;
}

/**
 * Asking who may be mentioned here.
 *
 * `q` is bounded on both sides and `limit` is capped, because this endpoint opens on a keystroke:
 * the picker fires it while somebody is still typing a name, and an unbounded page or an unbounded
 * term would make every one of those keystrokes a scan.
 */
export class MentionableQueryDto {
  @ApiPropertyOptional({
    maxLength: MAX_MENTIONABLE_QUERY_LENGTH,
    description: `Part of a name or email. Below ${MIN_MENTIONABLE_QUERY_LENGTH} characters the audience is returned in name order rather than searched.`,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_MENTIONABLE_QUERY_LENGTH)
  q?: string;

  @ApiPropertyOptional({ maximum: MAX_MENTIONABLE_LIMIT, default: DEFAULT_MENTIONABLE_LIMIT })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_MENTIONABLE_LIMIT)
  limit?: number;

  @ApiPropertyOptional({ format: 'uuid', description: 'Id of the last person already held' })
  @IsOptional()
  @IsUUID()
  cursor?: string;
}

export class ListConversationsQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ enum: KINDS })
  @IsOptional()
  @IsIn(KINDS)
  kind?: ConversationKind;

  @ApiPropertyOptional({ default: false, description: 'Only conversations with unread messages' })
  @IsOptional()
  @Transform(rawBoolean)
  @IsBoolean()
  unreadOnly?: boolean;

  @ApiPropertyOptional({ maximum: 100, default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class SaveCommunicationSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  chatEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Off by default: telephony reaches people’s phones.' })
  @IsOptional()
  @IsBoolean()
  callingEnabled?: boolean;

  @ApiPropertyOptional({ enum: POLICIES })
  @IsOptional()
  @IsIn(POLICIES)
  recordingPolicy?: RecordingPolicy;

  @ApiPropertyOptional({ enum: SCOPES })
  @IsOptional()
  @IsIn(SCOPES)
  recordingPlaybackScope?: RecordingPlaybackScope;

  @ApiPropertyOptional({
    enum: FALLBACKS,
    description:
      'What happens when the intended participant cannot be reached. Never a support agent.',
  })
  @IsOptional()
  @IsIn(FALLBACKS)
  internalCallFallback?: InternalCallFallback;
}

export class StartConversationCallDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Who to ring. Required for a project, task or ticket conversation.',
  })
  @IsOptional()
  @IsUUID()
  withUserId?: string;

  @ApiPropertyOptional({
    description: 'Whether the people on the call agreed to it being recorded',
  })
  @IsOptional()
  @IsBoolean()
  recordingConsent?: boolean;
}
