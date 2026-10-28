"""Заглушка Bot API MAX для e2e: принимает запросы бота и хранит их для проверки в тестах.

GET /__requests — все запросы, DELETE /__requests — очистка. Только стандартная библиотека.
"""

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock
from urllib.parse import parse_qs, urlparse

requests: list[dict] = []
lock = Lock()

ME = {"user_id": 1, "first_name": "Тестовый бот", "is_bot": True, "username": "e2e_bot"}


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: object) -> None:
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _record(self) -> dict:
        parsed = urlparse(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        try:
            body = json.loads(raw) if raw else None
        except ValueError:
            body = raw.decode(errors="replace")
        item = {
            "method": self.command,
            "path": parsed.path,
            "query": {key: values[0] for key, values in parse_qs(parsed.query).items()},
            "authorization": self.headers.get("Authorization"),
            "body": body,
        }
        with lock:
            requests.append(item)
        return item

    def do_GET(self) -> None:  # noqa: N802
        if self.path.startswith("/__requests"):
            with lock:
                return self._send(200, list(requests))
        self._record()
        if self.path.startswith("/me"):
            return self._send(200, ME)
        if self.path.startswith("/subscriptions"):
            return self._send(200, {"subscriptions": []})
        self._send(404, {"code": "not.found"})

    def do_DELETE(self) -> None:  # noqa: N802
        if self.path.startswith("/__requests"):
            with lock:
                requests.clear()
            return self._send(200, {"ok": True})
        self._send(404, {"code": "not.found"})

    def do_POST(self) -> None:  # noqa: N802
        self._record()
        if self.path.startswith("/messages"):
            return self._send(200, {"message": {"body": {"mid": "mid.e2e"}}})
        if self.path.startswith("/subscriptions"):
            return self._send(200, {"success": True})
        self._send(404, {"code": "not.found"})

    def log_message(self, *_: object) -> None:
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 9000), Handler).serve_forever()
