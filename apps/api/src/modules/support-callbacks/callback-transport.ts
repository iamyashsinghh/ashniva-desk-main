import { Injectable } from '@nestjs/common';

import { SafeHttpService } from '../../infrastructure/http/safe-http.service';

/** The token the module injects, so the mock and the real one are interchangeable. */
export const CALLBACK_TRANSPORT = Symbol('CALLBACK_TRANSPORT');

export interface CallbackRequest {
  url: string;
  body: string;
  headers: Record<string, string>;
}

export interface CallbackResponse {
  status: number;
}

export interface CallbackTransport {
  deliver(request: CallbackRequest): Promise<CallbackResponse>;
}

/** A receiver that took longer than this is a receiver holding a queue worker open. */
const TIMEOUT_MS = 10_000;

/**
 * The real transport.
 *
 * `SafeHttpService`, never `fetch`. The URL is one an operator typed in, which makes every
 * delivery a request the server makes to an address somebody else chose — exactly the shape the
 * destination guard exists for. Without it, configuring a callback would be a way to make the API
 * call a database on its own loopback interface or the cloud metadata endpoint, and the guard also
 * re-checks every redirect hop for the same reason.
 */
@Injectable()
export class HttpCallbackTransport implements CallbackTransport {
  constructor(private readonly http: SafeHttpService) {}

  async deliver(request: CallbackRequest): Promise<CallbackResponse> {
    const response = await this.http.fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
      timeoutMs: TIMEOUT_MS,
      // A receiver's answer is not read beyond its status. Capping the buffer stops an endpoint
      // that streams without end from costing a worker all of its memory.
      maxBytes: 64 * 1024,
    });
    return { status: response.status };
  }
}

/**
 * The transport the tests and the local preview use.
 *
 * Follows the mock/real `useFactory` switch in `messaging.module.ts`, and for the same reason
 * stated there: a test run must never be able to reach a real endpoint, whatever a developer
 * happens to have configured. It records the exact bytes and headers of every delivery, so a test
 * can assert on the raw JSON body rather than on a re-serialised copy of it.
 */
@Injectable()
export class MockCallbackTransport implements CallbackTransport {
  readonly delivered: CallbackRequest[] = [];

  private alwaysStatus: number | null = null;
  private failWith: Error | null = null;

  async deliver(request: CallbackRequest): Promise<CallbackResponse> {
    this.delivered.push(request);
    if (this.failWith) {
      throw this.failWith;
    }
    return { status: this.alwaysStatus ?? 200 };
  }

  /**
   * Answer every delivery with this status until it is cleared.
   *
   * Deliberately not a queue of statuses. The application's own worker is running alongside the
   * test and drains real deliveries through this same object, so a queue would be consumed by
   * whichever delivery happened to arrive first and the test would assert on a status it never
   * asked for.
   */
  respondWith(status: number | null): void {
    this.alwaysStatus = status;
  }

  /** Make every delivery throw, standing in for a transport-level failure. */
  throwOnDelivery(error: Error | null): void {
    this.failWith = error;
  }

  reset(): void {
    this.delivered.length = 0;
    this.alwaysStatus = null;
    this.failWith = null;
  }
}
