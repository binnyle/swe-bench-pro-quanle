## Bug: Async Python SDK sends API key to cross-host `next` URLs

### Summary

On `firecrawl-py`, the async client follows the `next` URL from a crawl/batch status response even when it points at a different host, and sends the API key there. The sync client rewrites that URL back onto the configured `api_url` host first and does not leak credentials.

The sync path does this deliberately in `apps/python-sdk/firecrawl/v2/utils/http_client.py: _build_url()`:

```python
# _build_url in HttpClient
base = urlparse(self.api_url)
ep = urlparse(endpoint)
if ep.netloc:
    # Different host: keep path/query but force base host/scheme
    path = ep.path or "/"
    if (ep.hostname or "") != (base.hostname or ""):
        return urlunparse((base.scheme or "https", base.netloc, path, "", ep.query, ""))
```

The async client (`apps/python-sdk/firecrawl/v2/utils/http_client_async.py: AsyncHttpClient`) does NOT do this. It passes endpoints straight to `httpx.AsyncClient`:

```python
self._client = httpx.AsyncClient(base_url=api_url, headers={"Authorization": "Bearer ..."})
# ...
await self._client.get(endpoint)  # endpoint may be "https://evil.example.com/v2/crawl/..."
```

`httpx` ignores `base_url` when `endpoint` is an absolute URL, and the `Authorization` header is set at the client level, so a cross-host `next` URL is followed as-is **with the API key attached**. This happens during auto-pagination of `crawl`/`batch` — every `get`, `post`, `delete`, `patch`, and `post_multipart` verb is affected.

### Expected Behavior

The async client must resolve every endpoint against the configured `api_url` exactly like the sync client does, pinning absolute cross-host URLs onto the configured host/scheme and never sending credentials to a foreign host. All five verbs must be fixed and share the same URL logic so the two clients cannot drift again.

Constraints:
- Absolute cross-host URLs (e.g. `https://evil.example.com/v2/crawl/job-1?skip=10`) must be rewritten to `https://<api_url host><path>?<query>` (userinfo/fragment stripped).
- Absolute same-host URLs must be kept but scheme normalized to `api_url`.
- Relative URLs (`/v2/scrape`, `v2/scrape`) and protocol-relative URLs (`//evil.example.com/...`) must also be pinned to the base host.
- No new dependencies.

### Steps to Reproduce

```python
import asyncio, httpx
from firecrawl.v2.utils.http_client_async import AsyncHttpClient

API_URL = "https://api.firecrawl.dev"
client = AsyncHttpClient(api_key="fc-PROBE-SECRET-KEY", api_url=API_URL)

# Install a mock transport to observe the outgoing request
seen = []
old = client._client
def handler(req: httpx.Request) -> httpx.Response:
    seen.append(req)
    return httpx.Response(200, json={"success": True})
client._client = httpx.AsyncClient(base_url=str(old.base_url), headers=old.headers, transport=httpx.MockTransport(handler))

async def run():
    await client.get("https://evil.example.com/v2/crawl/job-1?skip=10")
    await client.close()

asyncio.run(run())
print(seen[0].url.host)  # BUG: prints "evil.example.com" — should be "api.firecrawl.dev"
print(seen[0].url.path)  # should be "/v2/crawl/job-1"
```

Without the fix, the request goes to `evil.example.com` with `Authorization: Bearer fc-PROBE-SECRET-KEY`. With the fix, it is pinned to `api.firecrawl.dev`.

### Files to Change

- `apps/python-sdk/firecrawl/v2/utils/http_client.py` — extract the `_build_url` logic into a reusable `build_url(api_url, endpoint)` helper.
- `apps/python-sdk/firecrawl/v2/utils/http_client_async.py` — import `build_url`, add `_build_url` method, and route all five verbs (`get`, `post`, `patch`, `delete`, `post_multipart`) through it.
