import { createContext, useContext, type ReactNode } from 'react';

import type { CardTarget } from './card-targets';

/**
 * How a dashboard leaves Home.
 *
 * Held in context rather than threaded through six role dashboards and every list inside them:
 * each of those only ever asks "what happens when this is pressed", and the answer belongs to the
 * screen that owns the navigation. A missing handler means "not pressable", never a dead tap.
 */

export interface ListRequest {
  title?: string;
  query: Record<string, string>;
}

export interface DashboardHandlers {
  onOpenTaskList?: (request: ListRequest) => void;
  onOpenTicketList?: (request: ListRequest) => void;
  /** The tabs, for a tile whose list is unfiltered and so is the tab itself. */
  onOpenTasks?: () => void;
  onOpenTickets?: () => void;
  onOpenProjects?: () => void;
  onOpenApprovals?: () => void;
  onOpenTask?: (id: string) => void;
  onOpenTicket?: (id: string) => void;
}

const DashboardActionsContext = createContext<DashboardHandlers>({});

export function DashboardActionsProvider({
  handlers,
  children,
}: {
  handlers: DashboardHandlers;
  children: ReactNode;
}) {
  return (
    <DashboardActionsContext.Provider value={handlers}>{children}</DashboardActionsContext.Provider>
  );
}

export function useDashboardActions(): DashboardHandlers {
  return useContext(DashboardActionsContext);
}

/** The press handler for a tile's destination, or `undefined` when there is nowhere to go. */
export function pressForTarget(
  handlers: DashboardHandlers,
  target: CardTarget | null,
): (() => void) | undefined {
  if (!target) {
    return undefined;
  }
  const unfiltered = 'query' in target && Object.keys(target.query).length === 0;
  switch (target.kind) {
    case 'tasks': {
      const open = handlers.onOpenTaskList;
      if (open) {
        return () => open({ title: target.title, query: target.query });
      }
      return unfiltered ? handlers.onOpenTasks : undefined;
    }
    case 'tickets': {
      const open = handlers.onOpenTicketList;
      if (open) {
        return () => open({ title: target.title, query: target.query });
      }
      return unfiltered ? handlers.onOpenTickets : undefined;
    }
    case 'projects':
      return handlers.onOpenProjects;
    case 'approvals':
      return handlers.onOpenApprovals;
    default:
      return undefined;
  }
}

export function useTargetPress(target: CardTarget | null): (() => void) | undefined {
  return pressForTarget(useDashboardActions(), target);
}
