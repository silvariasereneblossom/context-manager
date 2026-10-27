- `summarySystemPrompt`, `summaryUserPrompt`, `chunkOnMessageBoundary` and
  the `diarySystemPrompt`/`diaryUserPrompt` aliases are marked deprecated:
  no request or chunker reads them, though they were documented, and the
  first two have defaults in `DEFAULT_AUTOBIOGRAPHICAL_CONFIG`. Their docs
  now say they're ignored and point to what does apply (the host's system
  prompt, `compressionOmitSystemPrompt`, `getCompressionInstruction`,
  `witnessedInstruction`). Behavior is unchanged.
