from django.urls import path

from . import views

urlpatterns = [
    path('ping/', views.sage_ping, name='sage-ping'),
]
