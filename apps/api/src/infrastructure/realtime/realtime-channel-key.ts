import { createHash } from 'node:crypto';

/**
 * The pub/sub channel prefix the Socket.IO Redis adapter fans events out on.
 *
 * `createAdapter(pub, sub)` defaults to the prefix `socket.io`, which is fine until two
 * deployments share one Redis — a staging and a production stack on the same managed instance, or
 * two tenants of one self-hosted install, both pointed at the operator's `REDIS_URL`. They then
 * subscribe to the same channels and each delivers the other's events to its own sockets: a
 * notification badge and an entity-changed refresh crossing between deployments, with no error
 * anywhere. Redis has no notion of which stack published what; the prefix is the only separation
 * there is.
 *
 * `APP_WEB_URL` is what identifies a deployment. It is the one setting that production requires
 * *and* that is necessarily different between two stacks — two deployments cannot serve the same
 * web app at the same URL — so it is the honest thing to key on. Hashed rather than embedded so
 * the channel names stay short and fixed-length whatever the URL is, and truncated because this
 * separates deployments, it does not authenticate them: anything holding the `REDIS_URL` can
 * subscribe to any channel it likes.
 */
export function realtimeChannelKey(webUrl: string): string {
  const digest = createHash('sha256').update(webUrl).digest('hex').slice(0, 16);
  return `ashniva:${digest}`;
}
