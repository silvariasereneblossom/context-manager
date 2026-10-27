- `compressionOmitSystemPrompt: true` leaves the host's system prompt out of
  L1 and merge requests. They carry `setSystemPrompt`'s value, which is the
  latest prompt the host set, not the one in force when the summarized
  messages were written, so after a prompt change older history is
  summarized under the new one. The README and the recall-curve spec's
  "no future leakage" invariant now say so: the as-of boundary is on the
  conversation, and the system prompt and tools are the latest set. Off by
  default; requests are unchanged unless it's set.
