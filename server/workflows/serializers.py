from django import forms
from .models import Workflow

class WorkflowSerializer(forms.Form):
    name = forms.CharField(max_length=255, required=True, error_messages={'required': 'Name is required'})
    nodes = forms.JSONField(required=False, initial=list)
    edges = forms.JSONField(required=False, initial=list)

    def clean_nodes(self):
        nodes = self.cleaned_data.get('nodes')
        if nodes is None:
            return []
        if not isinstance(nodes, list):
            raise forms.ValidationError("Nodes must be a list.")
        return nodes

    def clean_edges(self):
        edges = self.cleaned_data.get('edges')
        if edges is None:
            return []
        if not isinstance(edges, list):
            raise forms.ValidationError("Edges must be a list.")
        return edges

    @staticmethod
    def to_representation(workflow):
        return {
            "id": str(workflow.id),
            "name": workflow.name,
            "nodes": workflow.nodes,
            "edges": workflow.edges,
            "created_at": workflow.created_at.isoformat(),
            "modified_at": workflow.modified_at.isoformat(),
        }

    @staticmethod
    def to_list_representation(workflow):
        return {
            "id": str(workflow.id),
            "name": workflow.name,
            "total_nodes": len(workflow.nodes),
            "total_edges": len(workflow.edges),
            "created_at": workflow.created_at.isoformat(),
            "modified_at": workflow.modified_at.isoformat(),
        }
