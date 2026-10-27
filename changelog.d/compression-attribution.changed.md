- L1 and merge instructions keep who said what, by default
  (`compressionAttribution`, on unless set to `false`). Summaries are
  replayed in the agent's own voice, and the default instructions asked for
  first-person memory with no word on sources, so a claim from another
  participant, a tool result or a fetched page could come back as something
  the agent knew first-hand; the attribution rule existed only under
  `compressionMergeSourceOnly`. An L1 instruction now ends by naming where
  the slice's content came from besides the agent, read from the store's
  fields (the other participants, and the tools whose calls or results it
  holds), and an attribution rule; a merge instruction ends with the rule,
  ahead of any identity reminder. The messages go to the summarizer
  unchanged, stored summaries are untouched, witnessed chunks and wholly
  witnessed merges keep their instructions, and source-only merges keep
  their own wording. The default canonical request changes, so request
  hashes and quarantine keys do too: a chunk quarantined under the old
  instruction gets a fresh attempt.
