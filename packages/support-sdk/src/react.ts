import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { SupportClientOptions } from './client';
import type { IssueInput, TicketReference } from './contract';
import { SupportWidget, type WidgetState } from './widget';

/**
 * The React integration.
 *
 * A hook rather than a component, and no JSX anywhere in this package. A component would have to
 * decide what a support form looks like, and a customer's design system has already decided that.
 * What React hosts actually lack is the plumbing — a widget instance that survives re-renders, a
 * subscription that is cleaned up, and state that arrives as a value they can render.
 *
 * `react` is a peer dependency, and this module is a separate entry point, so a plain-JavaScript
 * host never loads it.
 */

export interface UseSupportWidget {
  state: WidgetState;
  /** Loads what support offers. Call it when the surface opens. */
  open: () => Promise<void>;
  submit: (input: IssueInput, options?: { idempotencyKey?: string }) => Promise<TicketReference>;
  reset: () => void;
  widget: SupportWidget;
}

export interface UseSupportWidgetOptions extends SupportClientOptions {
  /** Load capabilities as soon as the hook mounts, rather than waiting for `open()`. */
  openOnMount?: boolean;
}

export function useSupportWidget(options: UseSupportWidgetOptions): UseSupportWidget {
  /**
   * The session provider is held in a ref and read through a stable wrapper.
   *
   * A host will almost always pass an inline arrow function, which is a new value on every render.
   * Putting it in the memo's dependency list would rebuild the widget — and drop its loaded
   * capabilities and any half-typed submission — on every parent re-render. The ref keeps the
   * latest function without making the widget's identity depend on it.
   */
  const session = useRef(options.session);
  session.current = options.session;

  const widget = useMemo(
    () =>
      new SupportWidget({
        baseUrl: options.baseUrl,
        session: () => session.current(),
        ...(options.transport ? { transport: options.transport } : {}),
        ...(options.refreshLeadSeconds !== undefined
          ? { refreshLeadSeconds: options.refreshLeadSeconds }
          : {}),
      }),
    [options.baseUrl, options.transport, options.refreshLeadSeconds],
  );

  const [state, setState] = useState<WidgetState>(() => widget.getState());

  useEffect(() => widget.subscribe(setState), [widget]);

  const openOnMount = options.openOnMount ?? false;
  useEffect(() => {
    if (openOnMount) {
      void widget.open();
    }
  }, [widget, openOnMount]);

  const open = useCallback(() => widget.open(), [widget]);
  const submit = useCallback(
    (input: IssueInput, submitOptions?: { idempotencyKey?: string }) =>
      widget.submit(input, submitOptions ?? {}),
    [widget],
  );
  const reset = useCallback(() => widget.reset(), [widget]);

  return { state, open, submit, reset, widget };
}
