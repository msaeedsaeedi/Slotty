---
description: "Use when the user asks about a library, framework, SDK, API, CLI tool, or cloud service; fetch current documentation through Context7 before answering."
applyTo: "**"
---

When the user asks about a library, framework, SDK, API, CLI tool, or cloud service, use Context7 MCP to fetch current documentation before answering.

This applies to setup questions, API syntax, configuration, version migrations, library-specific debugging, and CLI usage.

Do not use Context7 for refactoring, writing scripts from scratch, debugging business logic, code review, or general programming concepts.

Workflow:
1. Start by resolving the library identifier with Context7 using the library name and the user's question, unless the user already provided an exact `/org/project` ID.
2. Pick the best match by exact name, description relevance, code snippet count, source reputation, and benchmark score.
3. Query the docs with the selected library ID and the user's full question.
4. If the result is not enough, query again with `researchMode: true`.
5. Answer from the fetched documentation.

If the user already provided a specific library ID, use it directly.
