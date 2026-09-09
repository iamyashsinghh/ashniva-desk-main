import { attachmentFromFile } from './attachments';
import type { SupportClientOptions } from './client';
import { LIMITS, type SupportAttachment, type SupportCapabilities } from './contract';
import { SupportWidget, type WidgetState } from './widget';

export interface MountOptions extends SupportClientOptions {
  /** Where to render. A selector or an element. */
  container: string | HTMLElement;
  /** Shown above the form. Defaults to the product's own name from the server. */
  title?: string;
  /** Work areas to offer as a category. Defaults to whatever the product allows. */
  categories?: string[];
}

export interface MountedWidget {
  widget: SupportWidget;
  open(): Promise<void>;
  destroy(): void;
}

/**
 * A working support form for a page with no framework.
 *
 * Deliberately plain and deliberately unstyled beyond a handful of class names: a customer's site
 * has its own design, and a widget that arrives with opinions about colour is a widget somebody
 * has to fight. Every element carries an `ashniva-support__*` class to style against.
 *
 * This is a reference integration, not the only way to use the SDK. Anything it does — reading
 * capabilities, validating, submitting, showing the unavailable state — is available directly on
 * `SupportWidget` for a host that wants to render its own.
 */
export function mountSupportWidget(options: MountOptions): MountedWidget {
  const root = resolveContainer(options.container);
  const widget = new SupportWidget(options);
  const attachments: SupportAttachment[] = [];

  const unsubscribe = widget.subscribe((state) => {
    root.replaceChildren(render(state));
  });

  function render(state: WidgetState): HTMLElement {
    const panel = element('div', 'ashniva-support');
    if (state.kind === 'idle' || state.kind === 'loading') {
      panel.append(element('p', 'ashniva-support__status', 'Loading support…'));
      return panel;
    }
    if (state.kind === 'unavailable' || state.kind === 'offline') {
      panel.append(element('p', 'ashniva-support__status', state.reason));
      return panel;
    }
    if (state.kind === 'submitted') {
      panel.append(
        element(
          'p',
          'ashniva-support__status',
          `Thank you — your reference is ${state.ticket.key}.`,
        ),
      );
      const again = element('button', 'ashniva-support__again', 'Report something else');
      again.addEventListener('click', () => {
        attachments.length = 0;
        widget.reset();
      });
      panel.append(again);
      return panel;
    }

    // Every remaining state either carries capabilities or has nothing to render a form from.
    const capabilities = 'capabilities' in state ? state.capabilities : undefined;
    if (!capabilities) {
      panel.append(
        element('p', 'ashniva-support__status', 'Support could not be loaded. Please try again.'),
      );
      return panel;
    }

    panel.append(
      element('h2', 'ashniva-support__title', options.title ?? capabilities.productName),
    );
    if (state.kind === 'error') {
      panel.append(element('p', 'ashniva-support__error', state.reason));
    }
    panel.append(buildForm(capabilities, state.kind === 'submitting'));
    if (!capabilities.canRequestCall && capabilities.callUnavailableReason) {
      panel.append(element('p', 'ashniva-support__call-note', capabilities.callUnavailableReason));
    }
    return panel;
  }

  function buildForm(capabilities: SupportCapabilities, busy: boolean): HTMLFormElement {
    const form = document.createElement('form');
    form.className = 'ashniva-support__form';

    const subject = labelled('Subject', input('text', { maxLength: LIMITS.titleMax }));
    const description = labelled('What happened?', textarea(LIMITS.descriptionMax));
    form.append(subject.wrapper, description.wrapper);

    const areas = options.categories ?? capabilities.allowedWorkAreas;
    const category = areas.length > 0 ? labelled('Area', select(areas)) : null;
    if (category) {
      form.append(category.wrapper);
    }

    let files: HTMLInputElement | null = null;
    if (capabilities.attachmentsEnabled) {
      const picker = input('file', {});
      picker.multiple = true;
      files = picker;
      form.append(labelled('Attachments', picker).wrapper);
    }

    const error = element('p', 'ashniva-support__error');
    const submit = element('button', 'ashniva-support__submit', 'Send');
    (submit as HTMLButtonElement).type = 'submit';
    (submit as HTMLButtonElement).disabled = busy;
    form.append(error, submit);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      error.textContent = '';
      void send({
        subject: (subject.field as HTMLInputElement).value,
        description: (description.field as HTMLTextAreaElement).value,
        category: category ? (category.field as HTMLSelectElement).value : undefined,
        picker: files,
        onError: (message) => {
          error.textContent = message;
        },
      });
    });
    return form;
  }

  async function send(input: {
    subject: string;
    description: string;
    category?: string;
    picker: HTMLInputElement | null;
    onError: (message: string) => void;
  }): Promise<void> {
    try {
      attachments.length = 0;
      for (const file of Array.from(input.picker?.files ?? []).slice(0, LIMITS.attachmentsMax)) {
        attachments.push(await attachmentFromFile(file));
      }
      await widget.submit(
        {
          subject: input.subject,
          description: input.description,
          ...(input.category ? { category: input.category } : {}),
          context: location.pathname,
          ...(attachments.length > 0 ? { attachments: [...attachments] } : {}),
        },
        // A key per attempt, so a reporter who presses Send twice on a slow connection gets one
        // ticket rather than two.
        { idempotencyKey: `widget-${Date.now()}-${Math.random().toString(36).slice(2)}` },
      );
    } catch (error) {
      input.onError(error instanceof Error ? error.message : 'That could not be sent');
    }
  }

  return {
    widget,
    open: () => widget.open(),
    destroy: () => {
      unsubscribe();
      root.replaceChildren();
    },
  };
}

function resolveContainer(container: string | HTMLElement): HTMLElement {
  const root = typeof container === 'string' ? document.querySelector(container) : container;
  if (!(root instanceof HTMLElement)) {
    throw new Error(`No element matched ${String(container)}`);
  }
  return root;
}

function element(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function labelled(
  text: string,
  field: HTMLElement,
): { wrapper: HTMLLabelElement; field: HTMLElement } {
  const wrapper = document.createElement('label');
  wrapper.className = 'ashniva-support__label';
  wrapper.append(document.createTextNode(text), field);
  return { wrapper, field };
}

function input(type: string, attrs: { maxLength?: number }): HTMLInputElement {
  const node = document.createElement('input');
  node.type = type;
  if (attrs.maxLength) {
    node.maxLength = attrs.maxLength;
  }
  return node;
}

function textarea(maxLength: number): HTMLTextAreaElement {
  const node = document.createElement('textarea');
  node.maxLength = maxLength;
  node.rows = 5;
  return node;
}

function select(values: readonly string[]): HTMLSelectElement {
  const node = document.createElement('select');
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    node.append(option);
  }
  return node;
}
