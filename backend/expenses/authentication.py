from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed


class DeviceTokenAuthentication(BaseAuthentication):
    """Authenticates requests using per-device tokens stored in DeviceToken model."""

    def authenticate(self, request):
        auth = get_authorization_header(request).split()
        if not auth or auth[0].lower() != b'token':
            return None
        if len(auth) != 2:
            return None
        try:
            key = auth[1].decode()
        except UnicodeError:
            return None

        from .models import DeviceToken
        try:
            token = DeviceToken.objects.select_related('user').get(key=key)
        except DeviceToken.DoesNotExist:
            raise AuthenticationFailed('Invalid token.')

        if not token.user.is_active:
            raise AuthenticationFailed('User inactive or deleted.')

        return (token.user, token)
