/** Live updates for one Room chat over the socket: new messages, typing, seen ticks,
 * deletes, reactions and view-once opens. Returns whether the other person is typing. */
import { useEffect, useRef, useState } from 'react';

export default function useChatSocket(socketService, connectionId, setMessages, onNewMessage) {
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const typingTimer = useRef(null);
  const onNewRef = useRef(onNewMessage);
  onNewRef.current = onNewMessage;

  useEffect(() => {
    const mine = (fn) => (payload) => { if (payload?.connectionId === connectionId) fn(payload); };
    const patch = (id, change) => setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...change } : m)));

    const handlers = {
      new_message: mine(({ message }) => {
        setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
        setIsOtherTyping(false);
        onNewRef.current?.();
      }),
      user_typing: mine(() => {
        setIsOtherTyping(true);
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setIsOtherTyping(false), 3000);
      }),
      // The other person read up to seenAt: my earlier messages flip to seen.
      messages_seen: mine(({ seenAt }) => setMessages((prev) => prev.map((m) => (
        m.is_own && m.created_at <= seenAt ? { ...m, seen: true } : m
      )))),
      message_deleted: mine(({ messageId }) => patch(messageId, { deleted: true, content: '', media_url: null, media_type: null })),
      message_reaction: mine(({ messageId, reactions }) => patch(messageId, { reactions })),
      message_opened: mine(({ messageId }) => patch(messageId, { opened: true })),
    };

    Object.entries(handlers).forEach(([event, fn]) => socketService.on(event, fn));
    return () => {
      Object.entries(handlers).forEach(([event, fn]) => socketService.off(event, fn));
      clearTimeout(typingTimer.current);
    };
  }, [socketService, connectionId, setMessages]);

  return isOtherTyping;
}
