from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from .models import Workflow
from .serializers import WorkflowSerializer
from server.utils import api_response

class WorkflowListCreateView(generics.ListCreateAPIView):
    """
    List all workflows owned by the user or create a new workflow.
    """
    serializer_class = WorkflowSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Workflow.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        return api_response(
            success=True,
            message="Workflows retrieved successfully.",
            data=response.data,
            status_code=status.HTTP_200_OK
        )

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        return api_response(
            success=True,
            message="Workflow created successfully.",
            data=response.data,
            status_code=status.HTTP_201_CREATED
        )

class WorkflowDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    Retrieve, update or delete a workflow instance.
    """
    serializer_class = WorkflowSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Workflow.objects.filter(user=self.request.user)

    def retrieve(self, request, *args, **kwargs):
        response = super().retrieve(request, *args, **kwargs)
        return api_response(
            success=True,
            message="Workflow retrieved successfully.",
            data=response.data,
            status_code=status.HTTP_200_OK
        )

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        return api_response(
            success=True,
            message="Workflow updated successfully.",
            data=response.data,
            status_code=status.HTTP_200_OK
        )

    def destroy(self, request, *args, **kwargs):
        super().destroy(request, *args, **kwargs)
        return api_response(
            success=True,
            message="Workflow deleted successfully.",
            status_code=status.HTTP_200_OK # Using 200 instead of 204 to match user request for consistency
        )
