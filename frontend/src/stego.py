from PIL import Image
from cryptography.fernet import Fernet
import base64
import hashlib

# ------------------------------
# PASSWORD → AES KEY
# ------------------------------
def generate_key(password):
    digest = hashlib.sha256(password.encode()).digest()
    return base64.urlsafe_b64encode(digest)


# ------------------------------
# TEXT → BINARY
# ------------------------------
def bytes_to_bin(data):
    return ''.join(format(byte, '08b') for byte in data)

def bin_to_bytes(binary):
    data = bytearray()
    for i in range(0, len(binary), 8):
        byte = binary[i:i+8]
        if byte == "00000000":
            break
        data.append(int(byte, 2))
    return bytes(data)


# ------------------------------
# HIDE ENCRYPTED TEXT
# ------------------------------
def hide_text(input_image, output_image, message, password):
    key = generate_key(password)
    f = Fernet(key)

    encrypted = f.encrypt(message.encode())
    encrypted_bin = bytes_to_bin(encrypted) + "00000000"

    img = Image.open(input_image).convert("RGB")
    pixels = img.load()

    width, height = img.size
    capacity = width * height * 3

    if len(encrypted_bin) > capacity:
        print("Error: Message too large.")
        return

    idx = 0
    for y in range(height):
        for x in range(width):
            if idx >= len(encrypted_bin):
                img.save(output_image)
                print("Text hidden successfully with password protection.")
                return

            r, g, b = pixels[x, y]

            if idx < len(encrypted_bin):
                r = (r & ~1) | int(encrypted_bin[idx]); idx += 1
            if idx < len(encrypted_bin):
                g = (g & ~1) | int(encrypted_bin[idx]); idx += 1
            if idx < len(encrypted_bin):
                b = (b & ~1) | int(encrypted_bin[idx]); idx += 1

            pixels[x, y] = (r, g, b)

    img.save(output_image)
    print("Done!")


# ------------------------------
# EXTRACT ENCRYPTED TEXT
# ------------------------------
def extract_text(stego_image, password):
    key = generate_key(password)
    f = Fernet(key)

    img = Image.open(stego_image).convert("RGB")
    pixels = img.load()

    width, height = img.size

    bits = ""
    for y in range(height):
        for x in range(width):
            r, g, b = pixels[x, y]
            bits += str(r & 1)
            bits += str(g & 1)
            bits += str(b & 1)

    encrypted_bytes = bin_to_bytes(bits)

    try:
        decrypted = f.decrypt(encrypted_bytes)
        return decrypted.decode()
    except:
        return "❌ Wrong password! Cannot decrypt."


# ------------------------------
# MENU
# ------------------------------
if __name__ == "__main__":
    choice = input("1 = Hide text\n2 = Extract text\nChoose: ")

    if choice == "1":
        inp = input("Input PNG: ")
        out = input("Output PNG: ")
        msg = input("Text to hide: ")
        pwd = input("Set password: ")
        hide_text(inp, out, msg, pwd)

    elif choice == "2":
        stego = input("Stego PNG: ")
        pwd = input("Enter password: ")
        result = extract_text(stego, pwd)
        print("Result:", result)
