- A hierarchical compile (`adaptiveResolution` off) places a summary whose
  first message a host removed at its first message still in the store, as
  compression and merge requests already did. It used to place that recall
  pair after every newer one, so the oldest memory rendered as the newest
  (context-manager#321, its second finding). A summary with no message left
  still renders last. The summary's text is unchanged: removing or editing a
  message still doesn't reach a summary written from it.
