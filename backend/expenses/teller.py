"""
Teller API client.

Teller requires mutual TLS on every request. Two ways to provide the cert:

  Option A — file paths (local dev):
    TELLER_CERT_PATH=/path/to/certificate.pem
    TELLER_PRIVATE_KEY_PATH=/path/to/private_key.pem

  Option B — inline content (Vercel / any env that can't use file paths):
    TELLER_CERT=<paste full PEM content>
    TELLER_PRIVATE_KEY=<paste full PEM content>

Option B takes priority if both are set.
"""
import os
import tempfile
from datetime import date
import requests
from django.conf import settings

TELLER_API = 'https://api.teller.io'

_CERT_TMP = os.path.join(tempfile.gettempdir(), 'teller_cert.pem')
_KEY_TMP = os.path.join(tempfile.gettempdir(), 'teller_key.pem')

# Cache so we only write temp files once per process, not on every API call
_cert_cache: tuple[str, str] | None = None
_cert_written_hash: str = ''


def _cert() -> tuple[str, str]:
    """Return (cert_path, key_path) for requests, writing temp files only when content changes."""
    global _cert_cache, _cert_written_hash

    cert_content = getattr(settings, 'TELLER_CERT', '').strip()
    key_content = getattr(settings, 'TELLER_PRIVATE_KEY', '').strip()

    if cert_content and key_content:
        content_hash = cert_content[-32:] + key_content[-32:]
        if _cert_cache is None or _cert_written_hash != content_hash:
            cert_content = cert_content.replace('\\n', '\n')
            key_content = key_content.replace('\\n', '\n')
            with open(_CERT_TMP, 'w') as f:
                f.write(cert_content)
            with open(_KEY_TMP, 'w') as f:
                f.write(key_content)
            _cert_cache = (_CERT_TMP, _KEY_TMP)
            _cert_written_hash = content_hash
        return _cert_cache

    # Option A: file paths
    cert_path = getattr(settings, 'TELLER_CERT_PATH', '').strip()
    key_path = getattr(settings, 'TELLER_PRIVATE_KEY_PATH', '').strip()

    if cert_path and key_path:
        return (cert_path, key_path)

    raise RuntimeError(
        'Teller cert not configured. Set TELLER_CERT + TELLER_PRIVATE_KEY '
        '(PEM content) or TELLER_CERT_PATH + TELLER_PRIVATE_KEY_PATH (file paths).'
    )


def _raise_for_status(resp: requests.Response):
    """Like raise_for_status but includes Teller's error body in the message."""
    if not resp.ok:
        try:
            detail = resp.json()
        except Exception:
            detail = resp.text
        raise requests.HTTPError(
            f'{resp.status_code} {resp.reason}: {detail}',
            response=resp,
        )


def get_accounts(access_token: str) -> list[dict]:
    resp = requests.get(
        f'{TELLER_API}/accounts',
        auth=(access_token, ''),
        cert=_cert(),
    )
    _raise_for_status(resp)
    return resp.json()


def get_balance(access_token: str, account_id: str) -> dict:
    resp = requests.get(
        f'{TELLER_API}/accounts/{account_id}/balances',
        auth=(access_token, ''),
        cert=_cert(),
    )
    _raise_for_status(resp)
    return resp.json()


def get_transactions_since(access_token: str, account_id: str, since: date) -> list[dict]:
    """Fetch all transactions on or after `since`, paginating as needed.
    Teller returns transactions newest-first, so we stop as soon as we
    see a transaction older than the cutoff.
    """
    all_txns: list[dict] = []
    from_id: str | None = None

    while True:
        params: dict = {}
        if from_id:
            params['from_id'] = from_id

        resp = requests.get(
            f'{TELLER_API}/accounts/{account_id}/transactions',
            auth=(access_token, ''),
            cert=_cert(),
            params=params,
        )
        _raise_for_status(resp)
        page: list[dict] = resp.json()

        if not page:
            break

        stop = False
        for txn in page:
            if date.fromisoformat(txn['date']) >= since:
                all_txns.append(txn)
            else:
                stop = True
                break

        if stop:
            break

        from_id = page[-1]['id']

    return all_txns
