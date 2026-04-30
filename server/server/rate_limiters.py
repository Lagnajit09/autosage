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


class HttpTriggerThrottle(SimpleRateThrottle):
    """Throttle public HTTP trigger calls per trigger_token (no auth user)."""
    scope = 'http_trigger'

    def get_cache_key(self, request, view):
        token = view.kwargs.get('trigger_token') if hasattr(view, 'kwargs') else None
        if not token:
            return None
        return self.cache_format % {'scope': self.scope, 'ident': token}
