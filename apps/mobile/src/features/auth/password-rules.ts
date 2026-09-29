/**
 * The password lengths the API accepts, so a button is never enabled for a password it will refuse.
 *
 * Two minimums, because the API has two: the reset and invitation DTOs ask for 12 characters, the
 * change-password DTO for 10. Mirroring each where it applies keeps the phone from being stricter
 * or looser than the web for the same action.
 */

/** `ResetPasswordDto` and `AcceptInvitationDto`: `@MinLength(12)`. */
export const NEW_ACCOUNT_PASSWORD_MIN = 12;
/** `ChangePasswordDto.newPassword`: `@MinLength(10)`. */
export const CHANGED_PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

/** What is wrong with a new password and its confirmation, or null when it can be sent. */
export function passwordProblem(password: string, confirm: string, min: number): string | null {
  if (password.length < min) {
    return `At least ${min} characters`;
  }
  if (password.length > PASSWORD_MAX) {
    return `No more than ${PASSWORD_MAX} characters`;
  }
  if (password !== confirm) {
    return 'The two passwords do not match';
  }
  return null;
}
