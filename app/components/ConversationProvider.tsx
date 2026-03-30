import {createContext, useContext, type ReactNode} from 'react';
import {useConversation} from '~/hooks/useConversation';

type ConversationContextValue = ReturnType<typeof useConversation>;

const ConversationContext = createContext<ConversationContextValue | null>(null);

export function ConversationProvider({children}: {children: ReactNode}) {
  const conversation = useConversation();

  return (
    <ConversationContext.Provider value={conversation}>
      {children}
    </ConversationContext.Provider>
  );
}

export function useConversationContext(): ConversationContextValue {
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error(
      'useConversationContext must be used within a ConversationProvider',
    );
  }
  return context;
}
