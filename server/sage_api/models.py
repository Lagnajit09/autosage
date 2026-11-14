"""Persistence for Sage, the SageCode agent.

Kept separate from ``autobot_api`` so the web chat's tables (Thread, Message,
Summary, ...) never change shape for the agent. Sage's own records — sessions,
turns, the agent tree, steps, approvals, usage — land here in a later phase.

Intentionally empty for now: no models means no migration, so nothing touches
the (shared) database until a reviewed migration is added.
"""
