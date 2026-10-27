"""Read-only ClamAV acceptance check with synthetic content and harmless EICAR."""
import argparse
import socket
import struct
import time

parser = argparse.ArgumentParser()
parser.add_argument('--host', default='127.0.0.1')
parser.add_argument('--port', type=int, default=3310)
parser.add_argument('--wait-seconds', type=int, default=180)
args = parser.parse_args()

def command(data):
    with socket.create_connection((args.host, args.port), timeout=10) as connection:
        connection.sendall(data)
        response = bytearray()
        while len(response) < 4096:
            part = connection.recv(4096)
            if not part:
                break
            response.extend(part)
            if b'\0' in part:
                break
        return response.rstrip(b'\0').decode()

deadline = time.monotonic() + args.wait_seconds
while True:
    try:
        if command(b'zPING\0') == 'PONG':
            break
    except OSError:
        pass
    if time.monotonic() >= deadline:
        raise SystemExit('Scanner unavailable; check daemon and signature updates.')
    time.sleep(2)

def scan(content):
    return command(b'zINSTREAM\0' + struct.pack('!I', len(content)) + content + struct.pack('!I', 0))

assert scan(b'%PDF-1.4\nSynthetic harmless scanner check\n').endswith(': OK')
assert scan(b'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*').endswith(' FOUND')
print('PASS: scanner accepts clean content and rejects harmless EICAR test content.')
