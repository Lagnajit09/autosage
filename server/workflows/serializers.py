from rest_framework import serializers
from workflows.models import Workflow
import random

class WorkflowSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workflow
        fields = ['id', 'name', 'description', 'nodes', 'edges', 'created_at', 'modified_at']
        read_only_fields = ['id', 'created_at', 'modified_at']

    def to_representation(self, instance):
        """
        Custom representation to include dynamic fields if needed.
        Check if we are in a list context or detail context.
        """
        from execution_engine.models import WorkflowRun
        ret = super().to_representation(instance)
        
        # If the context is 'list', use the list representation
        if self.context.get('request') and self.context['request'].method == 'GET' and 'pk' not in self.context.get('view', {}).kwargs:
             ret['total_nodes'] = len(instance.nodes)
             ret['total_edges'] = len(instance.edges)

             # Real data from Execution-engine
             runs_qs = WorkflowRun.objects.filter(workflow=instance)
             ret['runs'] = runs_qs.count()
             
             last_run_obj = runs_qs.order_by('-created_at').first()
             if last_run_obj:
                 ret['last_run'] = last_run_obj.created_at.isoformat()
             else:
                 ret['last_run'] = "Never"
                 
             # Remove nodes/edges from list view as they are too large
             ret.pop('nodes', None)
             ret.pop('edges', None)
        
        return ret
