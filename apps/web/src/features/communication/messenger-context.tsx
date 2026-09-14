import { CONVERSATION_KIND, type ConversationKind } from '@ashniva/types';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { unlockMessageSound } from './message-sound';

export interface MessengerController {
  inboxOpen: boolean;
  /** The thread in the corner popup, or null when none is open. */
  conversationId: string | null;
  conversationKind: ConversationKind;
  minimized: boolean;
  openInbox: () => void;
  closeInbox: () => void;
  toggleInbox: () => void;
  openConversation: (conversationId: string, kind?: ConversationKind) => void;
  closeConversation: () => void;
  minimizeConversation: () => void;
  restoreConversation: () => void;
  /**
   * True when this conversation is the open, un-minimized popup — the same fact that should
   * suppress a ping and a toast, because the message is already on screen.
   */
  isReading: (conversationId: string) => boolean;
}

const MessengerContext = createContext<MessengerController | null>(null);

export function useMessenger(): MessengerController | null {
  return useContext(MessengerContext);
}

/**
 * Holds the corner messenger's open/minimized state so a toast can open a thread and a ping can
 * stay quiet when that thread is already in view.
 *
 * Mounted in the application shell, not on the messages screen: a message arriving on a task
 * board is exactly the case the corner box is for.
 */
export function MessengerProvider({ children }: { children: ReactNode }) {
  const [inboxOpen, setInboxOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationKind, setConversationKind] = useState<ConversationKind>(
    CONVERSATION_KIND.DIRECT,
  );
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    const unlock = () => unlockMessageSound();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  const openInbox = useCallback(() => {
    unlockMessageSound();
    setInboxOpen(true);
  }, []);
  const closeInbox = useCallback(() => setInboxOpen(false), []);
  const toggleInbox = useCallback(() => {
    unlockMessageSound();
    setInboxOpen((open) => !open);
  }, []);
  const openConversation = useCallback((id: string, kind?: ConversationKind) => {
    unlockMessageSound();
    setConversationId(id);
    if (kind) {
      setConversationKind(kind);
    }
    setMinimized(false);
    setInboxOpen(true);
  }, []);
  const closeConversation = useCallback(() => {
    setConversationId(null);
    setMinimized(false);
  }, []);
  const minimizeConversation = useCallback(() => setMinimized(true), []);
  const restoreConversation = useCallback(() => {
    setMinimized(false);
    setInboxOpen(true);
  }, []);
  const isReading = useCallback(
    (id: string) => conversationId === id && !minimized,
    [conversationId, minimized],
  );

  const value = useMemo<MessengerController>(
    () => ({
      inboxOpen,
      conversationId,
      conversationKind,
      minimized,
      openInbox,
      closeInbox,
      toggleInbox,
      openConversation,
      closeConversation,
      minimizeConversation,
      restoreConversation,
      isReading,
    }),
    [
      inboxOpen,
      conversationId,
      conversationKind,
      minimized,
      openInbox,
      closeInbox,
      toggleInbox,
      openConversation,
      closeConversation,
      minimizeConversation,
      restoreConversation,
      isReading,
    ],
  );

  return <MessengerContext.Provider value={value}>{children}</MessengerContext.Provider>;
}
