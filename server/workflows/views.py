import json
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.shortcuts import get_object_or_404
from .models import Workflow
from .serializers import WorkflowSerializer
from .utils import api_response

@csrf_exempt
@require_http_methods(["GET"])
def list_workflows(request):
    try:
        if not request.user.is_authenticated:
            return api_response(False, "Unauthorized", status=401)
        
        # Filter by current user
        workflows = Workflow.objects.filter(user=request.user)
        data = [WorkflowSerializer.to_representation(w) for w in workflows]
        return api_response(True, "Workflows retrieved successfully", data=data)
    except Exception as e:
        return api_response(False, "Internal Server Error", errors=str(e), status=500)

@csrf_exempt
@require_http_methods(["POST"])
def create_workflow(request):
    try:
        if not request.user.is_authenticated:
            return api_response(False, "Unauthorized", status=401)
        
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return api_response(False, "Invalid JSON format", status=400)
            
        form = WorkflowSerializer(data)
        if not form.is_valid():
            return api_response(False, "Validation failed", errors=form.errors, status=400)
            
        cleaned_data = form.cleaned_data
        workflow = Workflow.objects.create(
            user=request.user,  # Assign the current user
            name=cleaned_data['name'],
            nodes=cleaned_data.get('nodes', []),
            edges=cleaned_data.get('edges', [])
        )
        return api_response(True, "Workflow created successfully", data=WorkflowSerializer.to_representation(workflow), status=201)
        
    except Exception as e:
        return api_response(False, "Internal Server Error", errors=str(e), status=500)

@csrf_exempt
@require_http_methods(["GET"])
def retrieve_workflow(request, pk):
    try:
        if not request.user.is_authenticated:
            return api_response(False, "Unauthorized", status=401)
        
        try:
            workflow = get_object_or_404(Workflow, pk=pk)
        except Exception: 
            return api_response(False, "Workflow not found", status=404)

        return api_response(True, "Workflow retrieved successfully", data=WorkflowSerializer.to_representation(workflow))
    except Exception as e:
        return api_response(False, "Internal Server Error", errors=str(e), status=500)

@csrf_exempt
@require_http_methods(["PUT"])
def update_workflow(request, pk):
    try:
        if not request.user.is_authenticated:
            return api_response(False, "Unauthorized", status=401)
        
        try:
            workflow = get_object_or_404(Workflow, pk=pk)
        except Exception:
            return api_response(False, "Workflow not found", status=404)
        
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return api_response(False, "Invalid JSON format", status=400)
        
        update_data = {
            "name": data.get("name", workflow.name),
            "nodes": data.get("nodes", workflow.nodes),
            "edges": data.get("edges", workflow.edges)
        }
        
        form = WorkflowSerializer(update_data) # Validate the final state
        if not form.is_valid():
             return api_response(False, "Validation failed", errors=form.errors, status=400)
             
        cleaned_data = form.cleaned_data
        workflow.name = cleaned_data['name']
        workflow.nodes = cleaned_data['nodes']
        workflow.edges = cleaned_data['edges']
        workflow.save()
        
        return api_response(True, "Workflow updated successfully", data=WorkflowSerializer.to_representation(workflow))
        
    except Exception as e:
        return api_response(False, "Internal Server Error", errors=str(e), status=500)

@csrf_exempt
@require_http_methods(["DELETE"])
def delete_workflow(request, pk):
    try:
        if not request.user.is_authenticated:
            return api_response(False, "Unauthorized", status=401)
        
        try:
            workflow = get_object_or_404(Workflow, pk=pk)
        except Exception:
             return api_response(False, "Workflow not found", status=404)
             
        workflow.delete()
        return api_response(True, "Workflow deleted successfully", status=200)
        
    except Exception as e:
        return api_response(False, "Internal Server Error", errors=str(e), status=500)
