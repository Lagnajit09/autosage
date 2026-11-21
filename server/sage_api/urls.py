from django.urls import path

from . import views

urlpatterns = [
    path('ping/', views.sage_ping, name='sage-ping'),
    path('conversations/', views.conversations, name='sage-conversations'),
    path('conversations/<uuid:conversation_id>/', views.conversation_detail,
         name='sage-conversation-detail'),
    path('conversations/<uuid:conversation_id>/turns/', views.append_turn, name='sage-turns'),
    path('conversations/<uuid:conversation_id>/summaries/', views.add_summary, name='sage-summaries'),
]
