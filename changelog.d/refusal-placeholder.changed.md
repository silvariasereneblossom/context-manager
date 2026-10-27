- A chunk the summarizer refuses through its whole ladder (or whose answers
  are incomplete or empty each time) is now covered by a placeholder L1
  written without a model call, instead of staying raw until an operator
  clears its quarantine record. The placeholder says, in the agent's voice,
  how many messages from what time range couldn't be summarized and that the
  messages remain in the archive; the entry is marked
  `placeholder: 'compression-exhausted'`. Compression goes on past the chunk
  and compiles keep fitting, where a summarizer that refused every chunk left
  the middle raw and every compile refused. A chunk quarantined before
  upgrading is covered at its next attempt, with no call. The quarantine
  record, its alert and the repeating alarm stay until cleared: the paid-off
  sweep and the success-clear leave a span a placeholder covers, the status
  names the placeholder (`CompressionQuarantineSpan.placeholderSummaryId`),
  and the alarm line says the span is covered rather than raw. Clearing the
  record leaves the placeholder. `compressionRefusalPlaceholder: false`
  keeps the old behavior.
