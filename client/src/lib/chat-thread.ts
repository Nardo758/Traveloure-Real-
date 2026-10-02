/**
 * A thread is the pair of people in it. `/api/chats` returns every message the session
 * user sent or received; drawing that list inside whichever conversation is open mixes
 * other threads in (roles QA M7 — "hello from spoof" in Aiko's thread, absent from hers).
 */
export function messageBelongsToPair(
  chat: { senderId: string; receiverId?: string | null },
  userId: string,
  otherUserId: string,
): boolean {
  const me = String(userId);
  const other = String(otherUserId);
  if (!me || !other || me === other) return false;
  const sender = String(chat.senderId);
  const receiver = chat.receiverId == null ? "" : String(chat.receiverId);
  return (sender === me && receiver === other) || (sender === other && receiver === me);
}
