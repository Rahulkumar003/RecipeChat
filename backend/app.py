import asyncio
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from recipe_chatbot import RecipeChatBot
import os
from dotenv import load_dotenv


# Load environment variables
load_dotenv()

# Read CORS origins from environment
# allowed_origins = os.getenv("ALLOWED_ORIGINS", "").split(",")
allowed_origins=["http://localhost:3000"]

app = Flask(__name__)
CORS(app, supports_credentials=True, origins=allowed_origins)

# Configure SocketIO for both addresses
socketio = SocketIO(app, cors_allowed_origins=allowed_origins, async_mode='threading')

# Initialize the chatbot
chatbot = RecipeChatBot()

@socketio.on('generate_text')
def generate_text(data):
    print("Received generate_text event")
    prompt = data.get('prompt')
    if not prompt:
        emit('response', {"error": "No prompt provided"})
        return

    def run_async_generator():
        try:
            async def stream_words():
                async for word in chatbot.ask_question_stream(prompt):
                    socketio.emit('response', {
                        "data": word, 
                        "streaming": True
                    })
                    await asyncio.sleep(0.8)
            
            asyncio.run(stream_words())
            socketio.emit('response', {"complete": True})

        except Exception as e:
            print(f"Error in stream_text: {str(e)}")
            socketio.emit('response', {"error": str(e)})

    socketio.start_background_task(run_async_generator)

@socketio.on('fetch_recipe_stream')
def fetch_recipe_stream(data):
    video_url = data.get('video_url')
    if not video_url:
        emit('recipe_stream', {"error": "Video URL is required"})
        return

    def run_async_stream():
        try:        
            async def stream_recipe():
                try:
                    async for chunk in chatbot.fetch_recipe(video_url):
                        print(f"Streaming recipe chunk: {chunk}")
                        socketio.emit('recipe_stream', {
                            "data": chunk, 
                            "streaming": True
                        })
                    
                    socketio.emit('recipe_stream', {"complete": True})
                
                except Exception as e:
                    print(f"Error streaming recipe: {str(e)}")
                    socketio.emit('recipe_stream', {"error": str(e)})

            asyncio.run(stream_recipe())

        except Exception as e:
            print(f"Error in fetch_recipe_stream: {str(e)}")
            socketio.emit('recipe_stream', {"error": str(e)})

    socketio.start_background_task(run_async_stream)

if __name__ == '__main__':
    # Bind to all network interfaces
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)
