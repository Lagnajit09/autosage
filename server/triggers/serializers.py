from rest_framework import serializers


class HttpTriggerCreateSerializer(serializers.Serializer):
    node_id = serializers.CharField(max_length=255)
