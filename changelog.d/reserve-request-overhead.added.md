- `ContextManager.open({ reserveRequestOverhead: true })` makes a compile's
  `maxTokens` cover the whole request: compile and `previewContext` take out
  the estimated tokens (the store's estimator) of the system prompt given to
  `setSystemPrompt`, the tool definitions given to `setToolDefinitions` and
  the compile's injections, at every position, before the strategy fits
  messages into the budget. Off by default, so a budget still covers the
  messages and `reserveForResponse` only, as before (context-manager#323
  keeps reserving the overhead opt-in, since it shrinks every tool-heavy
  agent's window). The README and `TokenBudget.maxTokens` no longer call
  `maxTokens` the whole window without saying what comes on top of it.
