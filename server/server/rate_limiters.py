from rest_framework.throttling import SimpleRateThrottle, UserRateThrottle

class WorkflowBurstThrottle(UserRateThrottle):
    scope = 'workflow_burst'

class WorkflowSustainedThrottle(UserRateThrottle):
    scope = 'workflow_sustained'

class WorkflowCreateThrottle(UserRateThrottle):
    scope = 'workflow_create'

class ScriptBurstThrottle(UserRateThrottle):
    scope = 'script_burst'

class ScriptSustainedThrottle(UserRateThrottle):
    scope = 'script_sustained'

class ScriptCreateThrottle(UserRateThrottle):
    scope = 'script_create'

class VaultBurstThrottle(UserRateThrottle):
    scope = 'vault_burst'

class VaultSustainedThrottle(UserRateThrottle):
    scope = 'vault_sustained'

class VaultCreateThrottle(UserRateThrottle):
    scope = 'vault_create'

class ExecutionBurstThrottle(UserRateThrottle):
    scope = 'execution_burst'

class ExecutionSustainedThrottle(UserRateThrottle):
    scope = 'execution_sustained'


# ── Autobot (T04+) ────────────────────────────────────────────────────────
# Scopes apply to all /api/autobot/* endpoints. The dedicated
# AutobotMessageCreateThrottle is wired in T13+ when SSE chat lands —
# isolating it lets us tighten message-creation throttle later without
# affecting CRUD on threads / configs / settings.
class AutobotBurstThrottle(UserRateThrottle):
    scope = 'autobot_burst'

class AutobotSustainedThrottle(UserRateThrottle):
    scope = 'autobot_sustained'

class AutobotMessageCreateThrottle(UserRateThrottle):
    scope = 'autobot_message_create'


class HttpTriggerThrottle(SimpleRateThrottle):
    """Throttle public HTTP trigger calls per trigger_token (no auth user)."""
    scope = 'http_trigger'

    def get_cache_key(self, request, view):
        token = view.kwargs.get('trigger_token') if hasattr(view, 'kwargs') else None
        if not token:
            return None
        return self.cache_format % {'scope': self.scope, 'ident': token}


class DocsSearchThrottle(SimpleRateThrottle):
    """Throttle the public docs-search endpoint per client IP (no auth user).

    Defense-in-depth on top of the X-Internal-Secret gate: even a leaked secret
    can't be used to hammer the endpoint. Keyed by IP via the throttle base's
    `get_ident` (honors XFF when configured)."""
    scope = 'docs_search'

    def get_cache_key(self, request, view):
        return self.cache_format % {
            'scope': self.scope,
            'ident': self.get_ident(request),
        }
