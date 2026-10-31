#!/usr/bin/env python3
import requests
from pprint import pprint

candidates = [
    'https://apollo.rio.br/wp-json/apollo/v1',
    'https://apollo.rio.br/a/v1',
    'https://dj.apollo.rio.br/wp-json/apollo/v1',
    'https://dj.apollo.rio.br/a/v1',
    'https://dj.apollo.rio.br/wp-json/a/v1',
    'https://apollo.rio.br/wp-json/a/v1',
]

for base in candidates:
    print('\n== Testing base:', base)
    try:
        url_verify = base.rstrip('/') + '/app/verify'
        r = requests.get(url_verify, timeout=8)
        print(' GET /app/verify ->', r.status_code)
    except Exception as e:
        print(' GET /app/verify -> exception', e)
    try:
        url_auth = base.rstrip('/') + '/app/auth'
        r2 = requests.post(url_auth, json={'username':'x','password':'y','app_id':'apollodj'}, timeout=8)
        print(' POST /app/auth ->', r2.status_code)
    except Exception as e:
        print(' POST /app/auth -> exception', e)
