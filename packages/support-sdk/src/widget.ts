import { SupportClient, type SupportClientOptions } from './client';
import type { IssueInput, SupportCapabilities, TicketReference } from './contract';
import { SupportRequestError } from './transport';
import { SupportValidationError } from './validation';

/**
 * The states a support surface can be in, and what to show in each.
 *
 * Written down as a machine rather than left to each host's `useState` calls, because the states
 * that get forgotten are the awkward ones — "support is closed for this product", "the browser is
 * offline", "the session could not be minted" — and a widget that only handles the happy path
 * shows a spinner forever when a customer most needs to be told something.
 */
export type WidgetState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; capabilities: SupportCapabilities }
  | { kind: 'submitting'; capabilities: SupportCapabilities }
  | { kind: 'submitted'; capabilities: SupportCapabilities; ticket: TicketReference }
  /** Support is reachable but closed for this product or tier. `reason` is meant to be shown. */
  | { kind: 'unavailable'; reason: string }
  /** Nothing came back at all: offline, blocked by CORS, or the session could not be minted. */
  | { kind: 'offline'; reason: string }
  | { kind: 'error'; reason: string; capabilities?: SupportCapabilities };

export type WidgetListener = (state: WidgetState) => void;

/**
 * A headless support widget: the state machine, without a single pixel of opinion.
 *
 * This is what both integrations are built on — the React hook subscribes to it, and the
 * vanilla-JS mount renders it. Keeping the behaviour in one framework-free object is what stops
 * the two from drifting into different ideas of what "unavailable" means.
 */
export class SupportWidget {
  private readonly client: SupportClient;
  private readonly listeners = new Set<WidgetListener>();
  private state: WidgetState = { kind: 'idle' };

  constructor(options: SupportClientOptions | { client: SupportClient }) {
    this.client = 'client' in options ? options.client : new SupportClient(options);
  }

  getState(): WidgetState {
    return this.state;
  }

  /** Subscribes, and immediately delivers the current state so a view never renders blank. */
  subscribe(listener: WidgetListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  /** Loads what support currently offers. Safe to call again whenever the surface is reopened. */
  async open(): Promise<void> {
    this.set({ kind: 'loading' });
    try {
      const capabilities = await this.client.capabilities();
      if (!capabilities.canRaiseTicket) {
        this.set({
          kind: 'unavailable',
          reason: capabilities.unavailableReason ?? 'Support is not open for this product',
        });
        return;
      }
      this.set({ kind: 'ready', capabilities });
    } catch (error) {
      this.set(this.failureState(error));
    }
  }

  /**
   * Submits an issue and moves to `submitted` with the ticket reference.
   *
   * A validation problem does not change the state: the form is still the right thing on screen,
   * and the caller gets the error to put next to the field it belongs to.
   */
  async submit(
    input: IssueInput,
    options: { idempotencyKey?: string } = {},
  ): Promise<TicketReference> {
    const capabilities = this.capabilitiesOrThrow();
    this.set({ kind: 'submitting', capabilities });
    try {
      const ticket = await this.client.submitIssue(input, options);
      this.set({ kind: 'submitted', capabilities, ticket });
      return ticket;
    } catch (error) {
      if (error instanceof SupportValidationError) {
        this.set({ kind: 'ready', capabilities });
        throw error;
      }
      this.set(this.failureState(error, capabilities));
      throw error;
    }
  }

  /** Back to the form, keeping the capabilities already loaded. */
  reset(): void {
    const capabilities = this.currentCapabilities();
    this.set(capabilities ? { kind: 'ready', capabilities } : { kind: 'idle' });
  }

  /** The client, for a host that wants to poll a ticket's status itself. */
  get support(): SupportClient {
    return this.client;
  }

  private capabilitiesOrThrow(): SupportCapabilities {
    const capabilities = this.currentCapabilities();
    if (!capabilities) {
      throw new Error('Call open() before submitting an issue');
    }
    return capabilities;
  }

  private currentCapabilities(): SupportCapabilities | undefined {
    return 'capabilities' in this.state ? this.state.capabilities : undefined;
  }

  /**
   * A failure, sorted into the state that tells the truth about it.
   *
   * The distinction the states exist for: a 403 means support said no and the reason should be
   * shown as it was written; no status at all means the request never arrived, which is an outage
   * on somebody's side and not an answer.
   *
   * `capabilities` is carried into the recoverable `error` state so that a failed submission
   * leaves the form on screen with what the reporter typed, rather than sending them back to a
   * loading spinner to start again.
   */
  private failureState(error: unknown, capabilities?: SupportCapabilities): WidgetState {
    const failed = (reason: string): WidgetState =>
      capabilities ? { kind: 'error', reason, capabilities } : { kind: 'error', reason };

    if (error instanceof SupportRequestError) {
      if (error.status === undefined) {
        return { kind: 'offline', reason: 'Support could not be reached. Please try again.' };
      }
      if (error.status === 403) {
        return { kind: 'unavailable', reason: error.message };
      }
      return failed(error.message);
    }
    if (error instanceof Error) {
      // A session provider that threw. From the reporter's point of view this is an outage.
      return { kind: 'offline', reason: error.message };
    }
    return failed('Something went wrong');
  }

  private set(state: WidgetState): void {
    this.state = state;
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
