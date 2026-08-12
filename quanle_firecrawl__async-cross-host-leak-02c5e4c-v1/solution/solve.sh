#!/bin/bash
set -euo pipefail

cd /app 2>/dev/null || cd /testbed 2>/dev/null

cat > solution_patch.diff << '__SOLUTION__'
diff --git a/apps/python-sdk/firecrawl/v2/utils/http_client.py b/apps/python-sdk/firecrawl/v2/utils/http_client.py
index 7a75ddbb3e..5602c22002 100644
--- a/apps/python-sdk/firecrawl/v2/utils/http_client.py
+++ b/apps/python-sdk/firecrawl/v2/utils/http_client.py
@@ -10,6 +10,37 @@
 
 version = get_version()
 
+
+def build_url(api_url: str, endpoint: str) -> str:
+    """Resolve ``endpoint`` against ``api_url``, never leaving the configured host.
+
+    Absolute URLs pointing at a different host (e.g. a ``next`` pagination URL
+    returned by a proxied or self-hosted deployment) are rewritten onto the
+    configured ``api_url`` host/scheme so credentials are never sent to a
+    foreign host.
+    """
+    base = urlparse(api_url)
+    ep = urlparse(endpoint)
+
+    # Absolute or protocol-relative (has netloc)
+    if ep.netloc:
+        # Different host: keep path/query but force base host/scheme (no token leakage)
+        path = ep.path or "/"
+        if (ep.hostname or "") != (base.hostname or ""):
+            return urlunparse((base.scheme or "https", base.netloc, path, "", ep.query, ""))
+        # Same host: normalize scheme to base
+        return urlunparse((base.scheme or "https", base.netloc, path, "", ep.query, ""))
+
+    # Relative (including leading slash or not)
+    base_str = api_url if api_url.endswith("/") else f"{api_url}/"
+    # Guard protocol-relative like //host/path slipping through as “relative”
+    if endpoint.startswith("//"):
+        ep2 = urlparse(f"https:{endpoint}")
+        path = ep2.path or "/"
+        return urlunparse((base.scheme or "https", base.netloc, path, "", ep2.query, ""))
+    return urljoin(base_str, endpoint)
+
+
 class HttpClient:
     """HTTP client with retry logic and error handling."""
 
@@ -28,26 +59,7 @@ def __init__(
         self.backoff_factor = backoff_factor
 
     def _build_url(self, endpoint: str) -> str:
-        base = urlparse(self.api_url)
-        ep = urlparse(endpoint)
-
-        # Absolute or protocol-relative (has netloc)
-        if ep.netloc:
-            # Different host: keep path/query but force base host/scheme (no token leakage)
-            path = ep.path or "/"
-            if (ep.hostname or "") != (base.hostname or ""):
-                return urlunparse((base.scheme or "https", base.netloc, path, "", ep.query, ""))
-            # Same host: normalize scheme to base
-            return urlunparse((base.scheme or "https", base.netloc, path, "", ep.query, ""))
-
-        # Relative (including leading slash or not)
-        base_str = self.api_url if self.api_url.endswith("/") else f"{self.api_url}/"
-        # Guard protocol-relative like //host/path slipping through as “relative”
-        if endpoint.startswith("//"):
-            ep2 = urlparse(f"https:{endpoint}")
-            path = ep2.path or "/"
-            return urlunparse((base.scheme or "https", base.netloc, path, "", ep2.query, ""))
-        return urljoin(base_str, endpoint)
+        return build_url(self.api_url, endpoint)
     
     def _prepare_headers(
         self,
diff --git a/apps/python-sdk/firecrawl/v2/utils/http_client_async.py b/apps/python-sdk/firecrawl/v2/utils/http_client_async.py
index 52d14623f8..8bb0dd6c2e 100644
--- a/apps/python-sdk/firecrawl/v2/utils/http_client_async.py
+++ b/apps/python-sdk/firecrawl/v2/utils/http_client_async.py
@@ -2,6 +2,7 @@
 import httpx
 from typing import Optional, Dict, Any
 from .get_version import get_version
+from .http_client import build_url
 
 version = get_version()
 
@@ -35,6 +36,16 @@ def __init__(
     async def close(self) -> None:
         await self._client.aclose()
 
+    def _build_url(self, endpoint: str) -> str:
+        """Resolve ``endpoint`` against ``api_url``, pinning it to the configured host.
+
+        httpx ignores ``base_url`` for absolute URLs, so without this an
+        absolute cross-host endpoint (e.g. a ``next`` pagination URL from a
+        proxied deployment) would be requested as-is — with the client-level
+        Authorization header attached. Mirrors the sync ``HttpClient``.
+        """
+        return build_url(self.api_url, endpoint)
+
     def _headers(self, idempotency_key: Optional[str] = None) -> Dict[str, str]:
         headers: Dict[str, str] = {}
         if idempotency_key:
@@ -66,7 +77,7 @@ async def post(
         for attempt in range(num_attempts):
             try:
                 response = await self._client.post(
-                    endpoint,
+                    self._build_url(endpoint),
                     json=payload,
                     headers={**self._headers(), **(headers or {})},
                     timeout=timeout,
@@ -107,7 +118,7 @@ async def post_multipart(
         for attempt in range(num_attempts):
             try:
                 response = await self._client.post(
-                    endpoint,
+                    self._build_url(endpoint),
                     data=data,
                     files=files,
                     headers={**self._headers(), **(headers or {})},
@@ -147,7 +158,7 @@ async def get(
         for attempt in range(num_attempts):
             try:
                 response = await self._client.get(
-                    endpoint,
+                    self._build_url(endpoint),
                     headers={**self._headers(), **(headers or {})},
                     timeout=timeout,
                 )
@@ -185,7 +196,7 @@ async def delete(
         for attempt in range(num_attempts):
             try:
                 response = await self._client.delete(
-                    endpoint,
+                    self._build_url(endpoint),
                     headers={**self._headers(), **(headers or {})},
                     timeout=timeout,
                 )
@@ -227,7 +238,7 @@ async def patch(
         for attempt in range(num_attempts):
             try:
                 response = await self._client.patch(
-                    endpoint,
+                    self._build_url(endpoint),
                     json=payload,
                     headers={**self._headers(), **(headers or {})},
                     timeout=timeout,
__SOLUTION__

git apply --verbose solution_patch.diff || patch --fuzz=5 -p1 -i solution_patch.diff
