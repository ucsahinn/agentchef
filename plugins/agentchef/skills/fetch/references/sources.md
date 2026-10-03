# Fetch Source Record

Checked on 2026-07-28. Use current official documentation again when an API or
product behavior may have changed.

| Source | Type | Supports | Outdated risk |
| --- | --- | --- | --- |
| [OpenAI: Build skills](https://developers.openai.com/codex/skills) | Official product docs | Skill structure, explicit and implicit invocation, progressive disclosure, scripts, references, and plugin distribution | Medium |
| [Playwright: Network](https://playwright.dev/docs/network) | Official project docs | Browser request and response observation, routing, and mock boundaries | Medium |
| [Playwright: Screenshots](https://playwright.dev/docs/screenshots) | Official project docs | Viewport, full-page, element, and buffer screenshot evidence | Low |
| [Playwright: Authentication](https://playwright.dev/docs/auth) | Official project docs | Browser contexts and the sensitivity of persisted authenticated state | High |
| [Playwright: Mock APIs](https://playwright.dev/docs/mock) | Official project docs | Local API mocking and HAR replay behavior | Medium |
| [Chrome DevTools: Network reference](https://developer.chrome.com/docs/devtools/network/reference) | Official browser docs | Network inspection and sanitized HAR export that omits sensitive headers by default | Medium |
| [MDN: Same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy) | Standards-oriented web docs | Browser origin boundaries and why public rendering does not reveal arbitrary cross-origin or server data | Low |
| [OWASP: SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) | Security guidance | URL, DNS, redirect, private-address, and allowlist risks in server-mediated retrieval | Medium |
| [OWASP: LLM Prompt Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html) | Security guidance | Treating remote content as untrusted data rather than executable instructions | Medium |
| [RFC 9309: Robots Exclusion Protocol](https://www.rfc-editor.org/rfc/rfc9309.html) | Internet standard | Robots parsing and the distinction between crawl directives and authorization | Low |

## Interpretation

- Browser tools can observe rendered pages, interactions, requests, responses,
  and screenshots, but they do not expose server source or database logic.
- Authentication state and network archives can contain impersonation-capable
  secrets, so this skill prohibits persisting them by default.
- A high-fidelity reconstruction needs matched browser evidence plus a local
  implementation; downloading initial HTML alone is insufficient for modern
  client-rendered applications.
- HAR replay is useful for isolated test fixtures only after authorization and
  sanitization. It is not a license to retain private production traffic.
