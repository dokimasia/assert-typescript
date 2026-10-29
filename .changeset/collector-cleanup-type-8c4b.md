---
"@dokimi/assert": minor
---

**Breaking:** Type the function of `Collector.cleanup` as `() => void | Promise<void>`, so a function that returns another value no longer type-checks.
