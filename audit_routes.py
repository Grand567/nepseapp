import urllib.request, json

base = 'https://nepseapp.onrender.com'

def check(url):
    try:
        req = urllib.request.Request(base + url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.loads(r.read().decode('utf-8'))
    except Exception as e:
        return {'error': str(e)}

routes = [
    '/api/today-prices',
    '/api/market-summary',
    '/api/market/summary',
    '/api/securities/all',
    '/api/live-market',
    '/api/top-gainers',
    '/api/top-losers',
    '/api/indices',
    '/api/indices/sector',
    '/api/nepse/full-index',
    '/api/floorsheet'
]

for r in routes:
    res = check(r)
    if 'error' in res:
        print(f'{r:25} -> ERROR: {res[" error\]}')
 else:
 d = res.get('data') or res.get('stocks') or res
 count = len(d) if isinstance(d, list) else ('dict' if isinstance(d, dict) else type(d))
 print(f'{r:25} -> OK (count/type: {count})')
