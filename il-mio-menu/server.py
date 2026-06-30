"""Mini server per l'anteprima, con header anti-cache (così le modifiche
si vedono sempre subito, senza dover svuotare la cache del browser)."""
import http.server, socketserver, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", 4173), Handler) as httpd:
    print("Server no-cache su http://localhost:4173")
    httpd.serve_forever()
