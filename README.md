# Recipe Chat🍳

An intelligent chatbot that extracts recipes from YouTube cooking videos and provides interactive cooking assistance using AI. Transform any cooking video into a structured recipe with real-time guidance.

## ✨ Features

- **Video to Recipe**: Extract complete recipes from any YouTube cooking video
- **AI Cooking Assistant**: Get help with techniques, substitutions, and modifications
- **Interactive Guidance**: Step-by-step cooking instructions with voice support
- **Smart Kitchen Knowledge**:
  - Nutritional information
  - Ingredient substitutions
  - Technique explanations
  - Storage recommendations
  - Food safety tips
  - Cultural context
  - Flavor variations
  - Dietary adaptations

## 🧰 Tech Stack

### Frontend
- React 18
- TailwindCSS & DaisyUI
- Socket.IO Client
- React Markdown

### Backend
- Flask
- Flask-SocketIO
- LLAMA AI (via Ollama)
- YouTube Data Processing (youtube-transcript-api, yt-dlp)

## 📂 Project Structure

```
//frontend
│   ├── src/
│   │   ├── components/           # React components
│   │   │   ├── ChatMessage.js    # Individual message component
│   │   │   ├── Modal.js          # Modal dialog component  
│   │   │   ├── NewChatView.js    # Main chat interface
│   │   │   ├── SideBar.js        # Navigation sidebar
│   │   │   └── Setting.js        # Settings component
│   │   ├── context/
│   │   │   └── chatContext.js    # Chat state management
│   │   ├── hooks/                # Custom React hooks
│   │   ├── assets/               # Images and static files
│   │   └── App.js               # Root component
│   └── package.json
│
├── backend/
│   ├── app.py                    # Flask server + Socket.IO setup
│   ├── recipe_chatbot.py         # Core chatbot logic
│   └── requirements.txt          # Python dependencies
│
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- Node.js (v14+)
- Python 3.8+
- Ollama with LLAMA model installed

### Frontend Setup

```bash
# Navigate to frontend directory (RecipeChat)
# Install dependencies
npm install

# update backend url in  newchatview file(src/components) () after running the backend 

# Start development server
npm start
```

### Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create and activate virtual environment(optional)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install requirements
pip install -r requirements.txt

update the url in app.py with frontend url( ALLOWED_ORIGINS=https://example.com,http://localhost:3000)
# Start Flask server
python app.py


```

Your app will be available at:
- Frontend: http://localhost:3000
- Backend: http://localhost:5000

## 🔄 How It Works

1. **Video Submission**:
   - User enters YouTube URL of cooking video
   - Backend fetches video metadata and transcripts

2. **Recipe Extraction**:
   - AI processes transcript to identify ingredients, quantities, and steps
   - Structured recipe is generated and streamed back to frontend

3. **Interactive Assistance**:
   - User can ask questions about the recipe
   - AI analyzes question context and provides tailored responses
   - Cooking steps are presented in an interactive format

4. **Knowledge Enhancement**:
   - AI enriches recipes with additional context
   - Provides modifications based on dietary preferences
   - Suggests alternative techniques or equipment

## 💬 Socket Events

| Event Name | Direction | Purpose |
|------------|-----------|---------|
| `fetch_recipe_stream` | Client → Server | Request recipe extraction from URL |
| `generate_text` | Client → Server | Send user questions to AI |
| `recipe_stream` | Server → Client | Stream extracted recipe data |
| `response` | Server → Client | Return AI assistant responses |
| `processing_status` | Server → Client | Update extraction progress |



## 🙏 Acknowledgements

- [Ollama](https://ollama.ai/) for local LLAMA model hosting
- [YouTube Data API](https://developers.google.com/youtube/v3) for video metadata
- All the amazing chefs who share their recipes on YouTube!
