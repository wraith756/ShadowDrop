from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from PIL import Image
from cryptography.fernet import Fernet, InvalidToken
import base64
import hashlib
import io
import os
import struct

app = FastAPI(
    title="SecureHide API",
    description="Optimized Steganography API with AES encryption",
    version="2.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173","https://shadow-drop.vercel.app/"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_IMAGE_PIXELS = 12_000_000  # ~12 MP

# =====================================================
# Crypto
# =====================================================

def derive_key(password: str, salt: bytes) -> bytes:
    key = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode(),
        salt,
        100_000,
        dklen=32,
    )
    return base64.urlsafe_b64encode(key)

# =====================================================
# Hide
# =====================================================

@app.post("/api/hide")
async def hide_message(
    image: UploadFile = File(...),
    message: str = Form(...),
    password: str = Form(...),
):
    if not message.strip():
        raise HTTPException(400, "Message cannot be empty")

    if len(password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    raw = await image.read()
    img = Image.open(io.BytesIO(raw)).convert("RGB")

    if img.width * img.height > MAX_IMAGE_PIXELS:
        raise HTTPException(400, "Image too large")

    # ---- Encrypt ----
    salt = os.urandom(16)
    key = derive_key(password, salt)
    f = Fernet(key)
    encrypted = f.encrypt(message.encode())

    # HEADER = salt(16) + length(4)
    header = salt + struct.pack(">I", len(encrypted))
    payload = header + encrypted

    capacity_bits = img.width * img.height * 3
    payload_bits = len(payload) * 8

    if payload_bits > capacity_bits:
        raise HTTPException(
            400, f"Message too large (capacity {capacity_bits // 8} bytes)"
        )

    pixels = img.load()
    bit_i = 0

    for y in range(img.height):
        for x in range(img.width):
            r, g, b = pixels[x, y]
            rgb = [r, g, b]

            for i in range(3):
                if bit_i < payload_bits:
                    byte_i = bit_i // 8
                    bit_pos = 7 - (bit_i % 8)
                    bit = (payload[byte_i] >> bit_pos) & 1
                    rgb[i] = (rgb[i] & ~1) | bit
                    bit_i += 1

            pixels[x, y] = tuple(rgb)
            if bit_i >= payload_bits:
                break
        if bit_i >= payload_bits:
            break

    out = io.BytesIO()
    img.save(out, format="PNG")
    out.seek(0)

    return StreamingResponse(
        out,
        media_type="image/png",
        headers={"Content-Disposition": "attachment; filename=hidden.png"},
    )

# =====================================================
# Extract (FIXED ✅)
# =====================================================

@app.post("/api/extract")
async def extract_message(
    image: UploadFile = File(...),
    password: str = Form(...),
):
    raw = await image.read()
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    pixels = img.load()

    data = bytearray()
    current = 0
    bits = 0

    for y in range(img.height):
        for x in range(img.width):
            for channel in pixels[x, y]:
                current = (current << 1) | (channel & 1)
                bits += 1

                if bits == 8:
                    data.append(current)
                    current = 0
                    bits = 0

                    # Stop once header read and payload length satisfied
                    if len(data) >= 20:
                        salt = data[:16]
                        length = struct.unpack(">I", data[16:20])[0]
                        total = 20 + length
                        if len(data) >= total:
                            break
            else:
                continue
            break
        else:
            continue
        break

    if len(data) < 20:
        raise HTTPException(400, "No hidden message found")

    salt = data[:16]
    encrypted = data[20 : 20 + struct.unpack(">I", data[16:20])[0]]

    key = derive_key(password, salt)
    f = Fernet(key)

    try:
        message = f.decrypt(bytes(encrypted)).decode()
    except InvalidToken:
        raise HTTPException(401, "Wrong password or corrupted message")

    return {"success": True, "message": message}

# =====================================================
# Health
# =====================================================

@app.get("/api/health")
def health():
    return {"status": "healthy"}
