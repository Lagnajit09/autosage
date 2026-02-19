from rest_framework.throttling import UserRateThrottle

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
