from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Organization, Membership, Client, Engagement, Task, AuditLog, Document

class DocumentSerializer(serializers.ModelSerializer):
    client_name = serializers.ReadOnlyField(source='client.name')

    class Meta:
        model = Document
        fields = ['id', 'client', 'client_name', 'filename', 'status', 'file', 'uploaded_at']
        read_only_fields = ['status', 'filename']


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name']


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ['id', 'name', 'jurisdiction_default', 'data_residency_region', 'created_at']


class ClientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = ['id', 'organization', 'name', 'email', 'industry', 'created_at']
        read_only_fields = ['organization']

    def create(self, validated_data):
        # Automatically set organization from the requesting user's tenant
        request = self.context.get('request')
        if request and hasattr(request, 'tenant') and request.tenant:
            validated_data['organization'] = request.tenant
        return super().create(validated_data)


class EngagementSerializer(serializers.ModelSerializer):
    client_name = serializers.ReadOnlyField(source='client.name')

    class Meta:
        model = Engagement
        fields = ['id', 'client', 'client_name', 'name', 'type', 'status', 'start_date', 'end_date', 'created_at']


class TaskSerializer(serializers.ModelSerializer):
    assignee_name = serializers.ReadOnlyField(source='assignee.username')
    engagement_name = serializers.ReadOnlyField(source='engagement.name')

    class Meta:
        model = Task
        fields = ['id', 'engagement', 'engagement_name', 'title', 'description', 'status', 'assignee', 'assignee_name', 'created_at', 'updated_at']
