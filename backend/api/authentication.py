from rest_framework.authentication import SessionAuthentication


class CsrfExemptSessionAuthentication(SessionAuthentication):
    """Session authentication without CSRF enforcement.

    Safe because CORS (django-cors-headers) already restricts which origins
    can make credentialed cross-origin requests, making CSRF redundant for
    a SPA deployed on a different domain than the API.
    """

    def enforce_csrf(self, request):
        pass
