# ADR-003 — Ship without login and bind the application to localhost

- **Status:** Accepted
- **Date:** 2026-07-21
- **Deciders:** DF, on their own operating reality; the maintainer on the consequences

## Context

DF is a handful of trusted colleagues sharing one machine in the distribution hall. Asked directly,
they do not want accounts, roles or a sign-in: at a counter with a queue waiting, a login screen is
a delay and a shared password is what would actually happen. No requirement asked for since depends
on telling one staff member from another.

The data is nonetheless sensitive, so "no login" cannot mean "no access control" — it has to mean
the access control is somewhere else.

## Considered options

- **No authentication; bind to localhost on DF's machine** — chosen. Physical access to the machine
  _is_ the access control.
- **Username and password per staff member** — rejected by DF. It adds a user-administration screen,
  a password-reset story and a lockout story to an MVP that has none of those, for an accountability
  gain that a shared password would erase anyway.
- **One shared password on the app** — rejected as the worst of both: the friction of a login with
  none of the accountability, and a credential that would end up on a sticky note.
- **Defer the decision** — rejected. It is not deferrable: it decides whether the audit log has an
  actor column ([ADR-006](006-record-what-when-and-why-in-the-audit-log-never-who.md)) and whether
  the app may listen on a network interface.

## Decision

The application ships with no authentication and no user administration. It is started on DF's
machine with `npm run build && npm start`, reachable at `http://localhost:3000`, and is not exposed
on the network. Physical control of the machine is the access control.

## Consequences

- Staff open a bookmark and are at work. There is no login screen, no password to reset, no account
  to provision when a volunteer joins.
- The system cannot attribute an action to a person, so the audit log records _what, when and why_
  and never _who_ — see [ADR-006](006-record-what-when-and-why-in-the-audit-log-never-who.md).
- The app must never be bound to `0.0.0.0` or put behind a tunnel without revisiting this decision,
  because the whole security argument rests on the listener being local.
- An unlocked, unattended machine is an open register. That is a real residual risk and is recorded
  as one in [chapter 11](../11-risks-and-technical-debt.md); mitigating it is DF's operational
  practice (screen lock, machine location), not the software's.
- Adding login later is additive rather than a rewrite: an actor column on `AuditEntry`, a session,
  and a gate in the layout. Nothing in `domain/` or `application/` changes.
- Revisit if DF ever needs the register on more than one machine, or if anyone asks a question the
  log cannot answer because it has no actor.

## More information

- [Chapter 3 — context and scope](../03-context-and-scope.md)
- [Chapter 7 — deployment view](../07-deployment-view.md)
- Scope decision recorded at the time in `docs/archiv/user_stories_mvp.md` §4; the current non-goals list is
  [chapter 1](../01-introduction-and-goals.md#non-goals)
