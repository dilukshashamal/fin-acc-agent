from rest_framework import viewsets, status, views
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.contrib.auth.models import User
from rest_framework_simplejwt.tokens import RefreshToken
from .models import Organization, Membership, Client, Engagement, Task, AuditLog, Document
from .serializers import ClientSerializer, EngagementSerializer, TaskSerializer, OrganizationSerializer, UserSerializer, DocumentSerializer
import redis
import json
import os
from celery import Celery

redis_client = redis.from_url(os.getenv('REDIS_URL', 'redis://redis:6379/0'))
celery_app = Celery('ai_agent', broker=os.getenv('REDIS_URL', 'redis://redis:6379/0'))


class ClientViewSet(viewsets.ModelViewSet):
    serializer_class = ClientSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Enforced by RLS in DB, but double-filtered in Django ORM for clean application state
        if hasattr(self.request, 'tenant') and self.request.tenant:
            return Client.objects.filter(organization=self.request.tenant)
        return Client.objects.none()

    def perform_create(self, serializer):
        client = serializer.save(organization=self.request.tenant)
        # Log action
        AuditLog.objects.create(
            organization=self.request.tenant,
            user=self.request.user,
            actor_type='human',
            action='CLIENT_CREATED',
            details={'client_id': str(client.id), 'client_name': client.name}
        )


class EngagementViewSet(viewsets.ModelViewSet):
    serializer_class = EngagementSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if hasattr(self.request, 'tenant') and self.request.tenant:
            return Engagement.objects.filter(client__organization=self.request.tenant)
        return Engagement.objects.none()

    def perform_create(self, serializer):
        engagement = serializer.save()
        AuditLog.objects.create(
            organization=self.request.tenant,
            user=self.request.user,
            actor_type='human',
            action='ENGAGEMENT_CREATED',
            details={'engagement_id': str(engagement.id), 'engagement_name': engagement.name}
        )


class TaskViewSet(viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if hasattr(self.request, 'tenant') and self.request.tenant:
            return Task.objects.filter(engagement__client__organization=self.request.tenant)
        return Task.objects.none()

    def perform_create(self, serializer):
        task = serializer.save()
        AuditLog.objects.create(
            organization=self.request.tenant,
            user=self.request.user,
            actor_type='human',
            action='TASK_CREATED',
            details={'task_id': str(task.id), 'task_title': task.title}
        )


class DocumentViewSet(viewsets.ModelViewSet):
    serializer_class = DocumentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if hasattr(self.request, 'tenant') and self.request.tenant:
            return Document.objects.filter(client__organization=self.request.tenant)
        return Document.objects.none()

    def perform_create(self, serializer):
        file_obj = self.request.FILES.get('file')
        filename = file_obj.name if file_obj else "unknown"
        document = serializer.save(filename=filename, status='processing')
        
        celery_app.send_task(
            'tasks.process_document',
            kwargs={
                'tenant_id': str(self.request.tenant.id),
                'document_id': str(document.id),
                'file_path': document.file.path
            }
        )
        
        AuditLog.objects.create(
            organization=self.request.tenant,
            user=self.request.user,
            actor_type='human',
            action='DOCUMENT_UPLOADED',
            details={'document_id': str(document.id), 'filename': filename}
        )



class DeveloperSetupView(views.APIView):
    """Developer onboarding endpoint to auto-seed a B2B SaaS tenant, developer user, and returns JWT tokens."""
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get('username', 'developer')
        password = request.data.get('password', 'dev-password-123')
        org_name = request.data.get('organization', 'Acme Audit Partners')
        
        # 1. Create or get Organization (Tenant)
        org, org_created = Organization.objects.get_or_create(
            name=org_name,
            defaults={'jurisdiction_default': 'US'}
        )
        
        # 2. Create or get Developer User
        user, user_created = User.objects.get_or_create(
            username=username,
            defaults={
                'email': f'{username}@acmeaudit.com',
                'is_staff': True,
                'is_superuser': True
            }
        )
        if user_created:
            user.set_password(password)
            user.save()

        # 3. Associate User with Organization (Tenant)
        membership, member_created = Membership.objects.get_or_create(
            organization=org,
            user=user,
            defaults={'role': 'owner'}
        )

        # 4. If new tenant, seed mock clients, engagements, and tasks
        if org_created or member_created:
            # Client 1: Alpha Corp
            client1 = Client.objects.create(organization=org, name="Alpha Manufacturing Corp", industry="Manufacturing")
            eng1 = Engagement.objects.create(client=client1, name="FY2025 Audit", type="audit")
            Task.objects.create(engagement=eng1, title="Review opening balances", status="done", assignee=user)
            Task.objects.create(engagement=eng1, title="Audit related party transactions", status="in_progress", assignee=user)
            Task.objects.create(engagement=eng1, title="Perform lease assets valuation", status="todo", assignee=user)

            # Client 2: Delta Software
            client2 = Client.objects.create(organization=org, name="Delta Software Labs", industry="SaaS")
            eng2 = Engagement.objects.create(client=client2, name="Q2 Tax Compliance Review", type="tax_filing")
            Task.objects.create(engagement=eng2, title="Map global R&D tax credits eligibility", status="todo", assignee=user)

            AuditLog.objects.create(
                organization=org,
                user=user,
                actor_type='human',
                action='TENANT_INITIALIZED',
                details={'seeded_clients': 2, 'seeded_tasks': 4}
            )

        # 5. Generate Simple JWT tokens
        refresh = RefreshToken.for_user(user)
        # Inject tenant/org info into access token claims
        access_token = refresh.access_token
        access_token['tenant_id'] = str(org.id)
        access_token['tenant_name'] = org.name

        return Response({
            'status': 'success',
            'user': UserSerializer(user).data,
            'tenant': OrganizationSerializer(org).data,
            'tokens': {
                'refresh': str(refresh),
                'access': str(access_token),
            }
        }, status=status.HTTP_200_OK)
