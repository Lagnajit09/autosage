from django.urls import path

from . import views

urlpatterns = [
    path('', views.LibraryListView.as_view(), name='library-list'),
    path('<uuid:pk>/', views.LibraryDetailView.as_view(), name='library-detail'),
    path('<uuid:pk>/fork/', views.LibraryForkView.as_view(), name='library-fork'),
]
