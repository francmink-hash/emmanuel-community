import http.server
import socketserver
import webbrowser
import os

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

try:
    with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
        print(f"\n{'='*50}")
        print(f"SERVER STARTED SUCCESSFULLY")
        print(f"{'='*50}")
        print(f"Access the project at: http://localhost:{PORT}")
        print(f"Or: http://127.0.0.1:{PORT}")
        print(f"\nPress Ctrl+C to stop the server")
        print(f"{'='*50}\n")
        
        # Try to open browser automatically
        try:
            webbrowser.open(f'http://localhost:{PORT}')
        except:
            pass
        
        httpd.serve_forever()
except KeyboardInterrupt:
    print("\n\nServer stopped.")
except OSError as e:
    print(f"\nError: Port {PORT} is already in use. Try a different port.")
    print(f"Or close the existing server using that port.")
