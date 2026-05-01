"""
URL configuration for server project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from django.utils import timezone
from server.views import update_user

def health_check(request):
    return JsonResponse({'status': 'healthy', 'service': 'main-server', 'version': '1.0.0', 'message': 'Main server is healthy!', 'timestamp': timezone.now().isoformat()})

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/workflows/', include('workflows.urls')),
    path('api/triggers/', include('triggers.urls_global')),
    path('api/vault/', include('vault.urls')),
    path('api/scripts/', include('scripts.urls')),
    path('api/execution-engine/', include('execution_engine.urls')),
    path('api/user/update/', update_user, name='user-update'),
    path('api/health/', health_check),
]
