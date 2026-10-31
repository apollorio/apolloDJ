#!/usr/bin/env python3
import logging
import os
import sys

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s %(levelname)s %(name)s: %(message)s')
logger = logging.getLogger('debug-login')

# Ensure auth endpoint matches project constants (use /a/v1 for production compatibility)
os.environ.setdefault('APOLLO_API_BASE', 'https://apollo.rio.br/a/v1')

# Ensure project root is importable when running this script directly
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from apollodj.boot.auth_gate import _load_apollo_client_class

try:
    ApolloClient = _load_apollo_client_class()
    client = ApolloClient()
except Exception as e:
    logger.exception('Failed to load ApolloClient: %s', e)
    sys.exit(2)

username = 'jaque.sena'
password = '123456'

logger.info('BASE_URL (client module): %s', getattr(client, 'BASE_URL', os.environ.get('APOLLO_API_BASE')))
logger.info('Attempting login for: %s', username)

ok, data = False, {}
try:
    ok, data = client.login(username, password)
    logger.info('login returned: %s', ok)
    print('OK:', ok)
    print('DATA:', data)
except Exception as e:
    logger.exception('Exception during login: %s', e)
    print('EXC:', e)
    sys.exit(3)

sys.exit(0 if ok else 1)
