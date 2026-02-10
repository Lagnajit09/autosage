from rest_framework.throttling import UserRateThrottle

class WorkflowBurstThrottle(UserRateThrottle):
    scope = 'workflow_burst'

class WorkflowSustainedThrottle(UserRateThrottle):
    scope = 'workflow_sustained'

class WorkflowCreateThrottle(UserRateThrottle):
    scope = 'workflow_create'
