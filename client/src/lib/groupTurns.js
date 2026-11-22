// One agent answer can be several saved turns (text → tool → text). This merges consecutive assistant
// messages into a single bubble so the chat reads naturally.
export function groupTurns(messages) {
  const groups = [];
  for (const m of messages) {
    const prev = groups.at(-1);
    if (m.role === 'assistant' && prev?.role === 'assistant') {
      prev.parts = [...prev.parts, ...(m.parts || [])];
      prev.status = m.status;
      prev.streaming = m.streaming;
      prev.error = m.error || prev.error;
    } else {
      groups.push(m.role === 'assistant' ? { ...m, parts: [...(m.parts || [])] } : m);
    }
  }
  return groups;
}
