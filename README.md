# 🎭 Echo - Mental Health Support App

A safe, anonymous platform for mental health support and community connection.

## ✨ Features

- 🔐 Anonymous & authenticated posting
- 💬 Real-time chat and support groups
- 🎨 Dark/Light theme support
- 📱 Cross-platform (iOS, Android, Web)
- 🪙 Coin-based reward system
- 🖼️ Media sharing (images, audio, video)

## 🏗️ Tech Stack

### Backend
- FastAPI (Python)
- MongoDB (Database)
- JWT Authentication
- Cloudinary (Media storage)

### Frontend
- React Native (Expo)
- Redux Toolkit (State management)
- React Navigation
- Lucide Icons

## 🚀 Getting Started

### Prerequisites
- Python 3.12+
- Node.js 18+
- MongoDB
- Cloudinary Account

### Backend Setup

1. Clone the repository
```bash
git clone https://github.com/YOUR_USERNAME/echo-app.git
cd echo-app/backend
```

2. Create virtual environment
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies
```bash
pip install -r requirements.txt
```

4. Setup environment variables
```bash
cp .env.example .env
# Edit .env with your credentials
```

5. Run the server
```bash
uvicorn app.main:app --reload
```

### Frontend Setup

1. Navigate to frontend
```bash
cd frontend
```

2. Install dependencies
```bash
npm install
```

3. Setup environment variables
```bash
cp .env.example .env
# Edit .env with your API URL
```

4. Start the app
```bash
npx expo start
```

## 📱 Available Platforms

- iOS (via Expo Go or build)
- Android (via Expo Go or build)
- Web (runs in browser)

## 🔧 Environment Variables

See `.env.example` files in backend and frontend directories.

## 📄 License

MIT License - feel free to use this project for learning!

## 👥 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 🆘 Support

For support, email support@echo-app.com or open an issue.

## 🙏 Acknowledgments

- FastAPI for the amazing backend framework
- Expo for the mobile development platform
- MongoDB for the database
- Cloudinary for media storage