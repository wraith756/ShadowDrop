from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from PIL import Image
from cryptography.fernet import Fernet
import base64
import hashlib
import io

app = FastAPI(
    title="SecureHide API",
    description="Steganography API with AES encryption",
    version="1.0.0"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def generate_key(password: str) -> bytes:
    """Generate Fernet key from password"""
    digest = hashlib.sha256(password.encode()).digest()
    return base64.urlsafe_b64encode(digest)

def bytes_to_bin(data: bytes) -> str:
    """Convert bytes to binary string"""
    return ''.join(format(byte, '08b') for byte in data)

def bin_to_bytes(binary: str) -> bytes:
    """Convert binary string to bytes"""
    data = bytearray()
    for i in range(0, len(binary), 8):
        byte = binary[i:i+8]
        if byte == "00000000":
            break
        data.append(int(byte, 2))
    return bytes(data)

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "active",
        "service": "SecureHide API",
        "version": "1.0.0"
    }

@app.post("/api/hide")
async def hide_message(
    image: UploadFile = File(...),
    message: str = Form(...),
    password: str = Form(...)
):
    """Hide encrypted message in image"""
    try:
        if not message or len(message) == 0:
            raise HTTPException(status_code=400, detail="Message cannot be empty")
        
        if not password or len(password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        
        if not image.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="File must be an image")
        
        # Read and process image
        image_data = await image.read()
        img = Image.open(io.BytesIO(image_data)).convert("RGB")
        pixels = img.load()
        width, height = img.size
        
        # Encrypt message
        key = generate_key(password)
        f = Fernet(key)
        encrypted = f.encrypt(message.encode())
        encrypted_bin = bytes_to_bin(encrypted) + "00000000"
        
        # Check capacity
        capacity = width * height * 3
        if len(encrypted_bin) > capacity:
            raise HTTPException(
                status_code=400, 
                detail=f"Message too large. Max characters: {capacity // 8 // 2}"
            )
        
        # Hide message in image
        idx = 0
        for y in range(height):
            for x in range(width):
                if idx >= len(encrypted_bin):
                    break
                
                r, g, b = pixels[x, y]
                
                if idx < len(encrypted_bin):
                    r = (r & ~1) | int(encrypted_bin[idx])
                    idx += 1
                if idx < len(encrypted_bin):
                    g = (g & ~1) | int(encrypted_bin[idx])
                    idx += 1
                if idx < len(encrypted_bin):
                    b = (b & ~1) | int(encrypted_bin[idx])
                    idx += 1
                
                pixels[x, y] = (r, g, b)
        
        # Save to bytes
        output = io.BytesIO()
        img.save(output, format='PNG')
        output.seek(0)
        
        return StreamingResponse(
            output,
            media_type="image/png",
            headers={
                "Content-Disposition": "attachment; filename=hidden_message.png"
            }
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing image: {str(e)}")

@app.post("/api/extract")
async def extract_message(
    image: UploadFile = File(...),
    password: str = Form(...)
):
    """Extract and decrypt hidden message from image"""
    try:
        if not password:
            raise HTTPException(status_code=400, detail="Password is required")
        
        if not image.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="File must be an image")
        
        # Read image
        image_data = await image.read()
        img = Image.open(io.BytesIO(image_data)).convert("RGB")
        pixels = img.load()
        width, height = img.size
        
        # Extract bits
        bits = ""
        for y in range(height):
            for x in range(width):
                r, g, b = pixels[x, y]
                bits += str(r & 1)
                bits += str(g & 1)
                bits += str(b & 1)
        
        # Convert to bytes
        encrypted_bytes = bin_to_bytes(bits)
        
        # Decrypt
        key = generate_key(password)
        f = Fernet(key)
        
        try:
            decrypted = f.decrypt(encrypted_bytes)
            message = decrypted.decode()
            return {
                "success": True,
                "message": message
            }
        except Exception:
            raise HTTPException(
                status_code=401, 
                detail="Wrong password or no hidden message found"
            )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error extracting message: {str(e)}")

@app.get("/api/health")
async def health_check():
    """Detailed health check"""
    return {
        "status": "healthy",
        "service": "SecureHide API",
        "endpoints": {
            "hide": "/api/hide",
            "extract": "/api/extract"
        }
    }