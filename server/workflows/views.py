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
        # if not request.user.is_authenticated:
        #     return api_response(False, "Unauthorized", status=401)
        
        workflows = Workflow.objects.all()
        data = [WorkflowSerializer.to_representation(w) for w in workflows]
        return api_response(True, "Workflows retrieved successfully", data=data)
    except Exception as e:
        return api_response(False, "Internal Server Error", errors=str(e), status=500)

@csrf_exempt
@require_http_methods(["POST"])
def create_workflow(request):
    try:
        # if not request.user.is_authenticated:
        #     return api_response(False, "Unauthorized", status=401)
        
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return api_response(False, "Invalid JSON format", status=400)
            
        form = WorkflowSerializer(data)
        if not form.is_valid():
            return api_response(False, "Validation failed", errors=form.errors, status=400)
            
        cleaned_data = form.cleaned_data
        workflow = Workflow.objects.create(
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
        # if not request.user.is_authenticated:
        #     return api_response(False, "Unauthorized", status=401)
        
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
        
        # Merge existing data with new data for partial updates or full validation
        # Since it's PUT, we might expect full replace, but logic below allows partial if we pass instance?
        # Standard Form doesn't take 'instance'. We'll mix existing data manually if needed, or just validate incoming.
        # However, PUT usually implies replacing/updating. 
        # If the user sends partial data, Form(data) with required=True fields will fail.
        # But for 'name', it is required. 
        # Let's populate form with existing data updated by request data to simulate standard update validation?
        # Or better: check if it's a partial update? Standard PUT is full. 
        # Let's assume the user sends the fields they want to change, but if name is missing?
        # If request.body is passed to Form, and name is missing, Form says "Name is required".
        # This is correct for PUT (replace) or we can allow partial if we treat it as PATCH logic or make fields not required?
        # The user's previous manual logic allowed handling partials using `data.get("name", workflow.name)`.
        # To support that with Forms, we should construct the data dict fully.
        
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
