from django.urls import path
from .views import (
    ScriptListCreateView,
    ScriptDetailView,
    ScriptContentView,
    ScriptUpdateView,
    ScriptRenameView
)

urlpatterns = [
    # List all scripts or create a new script
    path('', ScriptListCreateView.as_view(), name='script-list-create'),
    
    # Retrieve or delete a specific script
    path('<int:pk>/', ScriptDetailView.as_view(), name='script-detail'),
    
    # Get script content
    path('<int:pk>/content/', ScriptContentView.as_view(), name='script-content'),
    
    # Update script content
    path('<int:pk>/update/', ScriptUpdateView.as_view(), name='script-update'),
    
    # Rename script
    path('<int:pk>/rename/', ScriptRenameView.as_view(), name='script-rename'),
]
