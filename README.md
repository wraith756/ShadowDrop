# 🕶️ ShadowDrop — Secure Image Steganography

ShadowDrop is a fast and secure steganography application that allows users to **encrypt and hide secret messages inside images** using **AES encryption and LSB (Least Significant Bit) techniques**.

---

## 🚀 Features

* 🔐 **AES Encryption (Fernet)** for secure message protection
* 🖼️ **LSB Steganography** to hide data inside images
* ⚡ **High Performance** with NumPy-based image processing
* 🎨 **Modern UI** built with React + TypeScript
* 🌌 **3D Interactive Interface** with particle effects
* 📦 **Downloadable Stego Image** after embedding
* 🔍 **Message Extraction** with password verification

---

## 🛠️ Tech Stack

### Frontend

* React (TypeScript)
* Vite
* Tailwind CSS

### Backend

* FastAPI (Python)
* NumPy
* Pillow (PIL)
* Cryptography (Fernet AES)

### Others

* Uvicorn
* REST API

---

## 📂 Project Structure

```
ShadowDrop/
│
├── backend/
│   ├── app/
│   │   └── main.py
│   ├── venv/
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   └── index.css
│   ├── package.json
│   └── vite.config.ts
│
└── README.md
```

---

## ⚙️ Installation & Setup

### 1️⃣ Clone Repository

```bash
git clone https://github.com/your-username/shadowdrop.git
cd shadowdrop
```

---

### 2️⃣ Backend Setup (FastAPI)

```bash
cd backend
python -m venv venv
venv\Scripts\activate   # Windows
# source venv/bin/activate  # Linux/Mac

pip install -r requirements.txt
```

Run server:

```bash
uvicorn app.main:app --reload
```

Backend runs on:

```
http://localhost:8000
```

---

### 3️⃣ Frontend Setup (React)

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on:

```
http://localhost:5173
```

---

## 🔐 How It Works

### 🔹 Hide Message

1. Upload image
2. Enter secret message
3. Provide password
4. Download stego image

### 🔹 Extract Message

1. Upload stego image
2. Enter password
3. Retrieve hidden message

---

## 🧠 Core Concept

* Message is first **encrypted using AES (Fernet)**
* Converted into **binary bits**
* Embedded into image pixels using **LSB technique**
* Extraction reverses the process

---

## ⚡ Performance Optimizations

* NumPy vectorization for fast pixel processing
* Reduced memory overhead
* Efficient bit manipulation
* Optimized API handling

---

## 🔒 Security

* Password-based encryption
* Impossible to read message without correct key
* Resistant to casual inspection

---

## 📸 Screenshots

> Add your UI screenshots here

---

## 📌 Future Improvements

* Video steganography support
* Multi-layer encryption
* Cloud storage integration
* Drag & drop enhancements

---

## 🤝 Contributing

Pull requests are welcome!
For major changes, please open an issue first.

---

## 📄 License

This project is licensed under the MIT License.

---

## 👨‍💻 Author

**Anurag Sharma**
Full Stack Developer

---

⭐ If you like this project, give it a star on GitHub!
