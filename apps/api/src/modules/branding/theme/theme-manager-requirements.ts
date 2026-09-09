import type { ThemeMissingRequirement } from '@ashniva/types';

/**
 * The Theme Manager's half of the contract, as specific as it can honestly be made without the
 * documentation.
 *
 * Deliberately not guessed at. An endpoint invented from a plausible-looking pattern would make
 * the remote source *look* finished and fail against the real product — and, because a theme is
 * the first thing a person sees, it would fail on the sign-in page of whoever turned it on. Each
 * entry names what has to be supplied, not what we suppose it is.
 *
 * `GET /admin/branding/theme-source` serves this list, so an administrator sees it next to the
 * switch it governs rather than only in `docs/theme-manager-integration.md`, which is the same
 * list with the reasoning.
 */
export const THEME_MANAGER_REQUIREMENTS: readonly ThemeMissingRequirement[] = [
  {
    key: 'integration-direction',
    what:
      'It is not decided whether Desk pulls the theme, the Theme Manager pushes it, or the ' +
      'tokens ship as a build-time package. Everything else depends on that answer.',
    needs: [
      'Pull: the endpoint, and how often Desk may poll without being rate limited.',
      'Push: the Desk webhook is the cheaper half — HMAC verification, delivery ' +
        'de-duplication and tenant attribution from a payload already exist and are tested — but ' +
        'the Theme Manager has to sign, retry and attribute deliveries.',
      'Build-time package: no runtime integration at all, and no per-tenant theming either.',
    ],
  },
  {
    key: 'document-endpoint',
    what: 'There is no documented path that returns the theme document for a tenant.',
    needs: [
      'The URL path and HTTP method that returns the live theme for one tenant.',
      'How a tenant is identified in that request — a path segment, a header, or the credential.',
      'The success response, and specifically whether the body *is* the document or wraps it.',
      'Which error statuses mean "not published yet" rather than "something is broken", since ' +
        'the two deserve different behaviour and only one is worth retrying.',
    ],
  },
  {
    key: 'authentication',
    what:
      'The authentication scheme is unknown, so the single opaque credential the connection ' +
      'holds may not be enough.',
    needs: [
      'The scheme: a static API key header, HTTP Basic, or OAuth2 client credentials.',
      'The exact header name and value format. Desk currently sends `Authorization: Bearer ` ' +
        'unless the connection overrides it, which is Desk’s own convention, not a ' +
        'documented one.',
      'If OAuth2: the token endpoint, the scopes, and the refresh and expiry behaviour. The ' +
        'connection would then need a client id, a client secret and an expiry.',
      'Whether the API host is per tenant or per region.',
    ],
  },
  {
    key: 'document-schema',
    what:
      "Desk's theme document shape is its own invention, so there is no guarantee the Theme " +
      'Manager publishes anything like it and no translation layer exists.',
    needs: [
      'The token vocabulary the Theme Manager publishes, mapped onto Desk’s colour, ' +
        'typography, spacing, radius, shadow and focus families.',
      'How the Theme Manager expresses a value Desk refuses today — a colour with alpha, a ' +
        'multi-layer shadow, a length in an unsupported unit.',
      'Whether a published theme is complete or a partial override, since Desk treats an absent ' +
        'token as "inherit the default" and the opposite convention would silently reset tokens.',
    ],
  },
  {
    key: 'version-negotiation',
    what:
      'Desk understands exactly one document version and refuses any other; nothing says how the ' +
      'Theme Manager expresses or negotiates one.',
    needs: [
      'Where the version appears in the document, and whether it is a number or a semantic version.',
      'Whether Desk can ask for a version it understands, or only take whatever is published.',
      "What the Theme Manager does when a consumer cannot read the current version — Desk's " +
        'answer is to keep serving the last good document, and both sides should agree on that.',
    ],
  },
  {
    key: 'publishing-lifecycle',
    what:
      'There is no notion of which theme version is live, how a new one is promoted, or how a bad ' +
      'one is rolled back. Desk stores a single untracked JSON blob with no history.',
    needs: [
      'How a theme is promoted from draft to live, and whether that is per tenant or global.',
      'How a rollback is requested, and whether previous versions stay retrievable.',
      'Whether the Theme Manager tells Desk that the live version changed, or Desk finds out by ' +
        'polling — which is the same product decision as the direction above.',
    ],
  },
  {
    key: 'cache-invalidation',
    what:
      'Desk caches the last good document for a fixed TTL, so a newly published theme takes up to ' +
      'that long to appear and nothing can shorten it.',
    needs: [
      'A cache-validation mechanism — an ETag, a Last-Modified, or a version endpoint cheap ' +
        'enough to poll often.',
      'A recommended poll interval, and the rate limit behind it.',
      'Whether an invalidation callback is available, which would make the TTL a safety net ' +
        'rather than the mechanism.',
    ],
  },
  {
    key: 'operational-limits',
    what: 'No rate limits, sandbox or availability expectations are known.',
    needs: [
      'Request rate limits, and what a throttled response looks like.',
      'A sandbox tenant that can be published to without affecting anyone.',
      'The expected availability, so it is clear whether the fallback ladder is a rare path or a ' +
        'daily one.',
    ],
  },
];

/**
 * What Desk does while the list above is unanswered.
 *
 * Worth stating on the screen, because the failure is quiet by design and reads like a bug. It is
 * quiet by design because the alternative is worse: a theme is not worth an error page, and the
 * endpoint that resolves one is the endpoint the sign-in page calls.
 */
export const THEME_BEHAVIOUR_WHEN_UNREADY =
  'Desk serves the last good document it has, then the organization’s stored branding, then ' +
  'the built-in Ashniva Desk theme. No request waits on the Theme Manager and no request fails ' +
  'because of it, so the app looks like itself rather than broken — but a theme published in the ' +
  'Theme Manager does not reach Desk.';
