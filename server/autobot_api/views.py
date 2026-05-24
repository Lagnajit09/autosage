import logging

from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from autobot_api.models import LLMConfig
from autobot_api.serializers import LLMConfigRevealSerializer, LLMConfigSerializer
from server.rate_limiters import AutobotBurstThrottle, AutobotSustainedThrottle
from server.utils import api_response

logger = logging.getLogger(__name__)


class LLMConfigListCreateView(generics.ListCreateAPIView):
    """GET  /api/autobot/llm-configs/   — list the caller's configs
    POST /api/autobot/llm-configs/   — create a new config
    """

    serializer_class = LLMConfigSerializer
    permission_classes = [IsAuthenticated]
    throttle_classes = [AutobotBurstThrottle, AutobotSustainedThrottle]

    def get_queryset(self):
        return LLMConfig.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        return api_response(
            success=True,
            message='LLM configs retrieved successfully.',
            data=response.data,
            status_code=status.HTTP_200_OK,
        )

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        return api_response(
            success=True,
            message='LLM config created successfully.',
            data=response.data,
            status_code=status.HTTP_201_CREATED,
        )


class LLMConfigDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET    /api/autobot/llm-configs/<id>/
    PATCH  /api/autobot/llm-configs/<id>/
    DELETE /api/autobot/llm-configs/<id>/
    """

    serializer_class = LLMConfigSerializer
    permission_classes = [IsAuthenticated]
    throttle_classes = [AutobotBurstThrottle, AutobotSustainedThrottle]
    lookup_field = 'pk'

    def get_queryset(self):
        return LLMConfig.objects.filter(user=self.request.user)

    def retrieve(self, request, *args, **kwargs):
        response = super().retrieve(request, *args, **kwargs)
        return api_response(
            success=True,
            message='LLM config retrieved successfully.',
            data=response.data,
            status_code=status.HTTP_200_OK,
        )

    def update(self, request, *args, **kwargs):
        # PATCH (partial) is the typical update path; DRF generic handles
        # full PUT too, but we don't promise that.
        kwargs['partial'] = True
        response = super().update(request, *args, **kwargs)
        return api_response(
            success=True,
            message='LLM config updated successfully.',
            data=response.data,
            status_code=status.HTTP_200_OK,
        )

    def destroy(self, request, *args, **kwargs):
        super().destroy(request, *args, **kwargs)
        return api_response(
            success=True,
            message='LLM config deleted successfully.',
            status_code=status.HTTP_200_OK,
        )


class LLMConfigRevealView(APIView):
    """POST /api/autobot/llm-configs/<id>/reveal/

    Returns the decrypted api_key plus the rest of the config so Autobot
    can issue a chat completion. Verb is POST (not GET) because it's an
    action with side effects we may want to log/audit later, mirroring the
    Vault credential `/reveal/` convention.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [AutobotBurstThrottle, AutobotSustainedThrottle]

    def post(self, request, pk):
        try:
            config = LLMConfig.objects.get(pk=pk, user=request.user)
        except LLMConfig.DoesNotExist:
            return api_response(
                success=False,
                message='LLM config not found or access denied.',
                status_code=status.HTTP_404_NOT_FOUND,
            )

        logger.info(
            'LLMConfig revealed: id=%s user=%s provider=%s',
            config.id, request.user.username, config.provider,
        )

        return api_response(
            success=True,
            message='LLM config revealed.',
            data=LLMConfigRevealSerializer(config).data,
            status_code=status.HTTP_200_OK,
        )
