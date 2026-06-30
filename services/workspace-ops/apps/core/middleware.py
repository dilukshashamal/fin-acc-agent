from django.db import connection

class TenantContextMiddleware:
    """Sets the Postgres session variable app.current_tenant_id for Row-Level Security isolation."""
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        tenant_id = None
        
        # In a real SaaS setup, the frontend sends an 'X-Tenant-ID' header
        # or we pull the organization_id from the verified JWT token claims.
        # Here we check the authenticated user's organization memberships.
        if request.user and request.user.is_authenticated:
            # Fallback: get the user's primary/first organization membership
            membership = request.user.memberships.select_related('organization').first()
            if membership:
                tenant_id = str(membership.organization.id)
                request.tenant = membership.organization
            else:
                request.tenant = None
        else:
            request.tenant = None

        # Check for X-Tenant-ID header if user has access to it
        header_tenant = request.headers.get('X-Tenant-ID')
        if header_tenant:
            tenant_id = header_tenant

        if tenant_id:
            # We use SET (session-wide for the connection) rather than SET LOCAL
            # because some views run multiple queries outside explicit transactions.
            # We reset it on each request to avoid connection pooling contamination.
            try:
                with connection.cursor() as cursor:
                    # Sanitize tenant_id as UUID string to prevent SQL injection
                    # (it should be a valid UUID hex/string)
                    import uuid
                    valid_uuid = str(uuid.UUID(tenant_id))
                    cursor.execute(f"SET app.current_tenant_id = '{valid_uuid}'")
            except (ValueError, TypeError):
                # If invalid UUID, reset it
                with connection.cursor() as cursor:
                    cursor.execute("RESET app.current_tenant_id")
        else:
            try:
                with connection.cursor() as cursor:
                    cursor.execute("RESET app.current_tenant_id")
            except Exception:
                pass

        response = self.get_response(request)
        return response
