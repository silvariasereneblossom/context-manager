- The autobiographical strategy names a budget that can't hold its raw
  windows at the first committing compile at that budget: when
  `recentWindowTokens` plus `headWindowTokens` exceed `maxTokens` less
  `reserveForResponse`, it logs a configuration error on stderr, once per
  budget and window sizes, naming both windows and the budget. Such a
  budget used to pass silently while the conversation was short, then
  refuse every compile once it outgrew the windows (for example the default
  30,000-token recent window under a 32k model's budget). Compiles aren't
  refused any earlier than before; dry compiles and `enforceBudget: false`
  log nothing.
