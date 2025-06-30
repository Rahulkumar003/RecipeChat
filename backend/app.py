import asyncio
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from recipe_chatbot import RecipeChatBot
import os
from dotenv import load_dotenv
import uuid

# Load environment variables
load_dotenv()

# Read CORS origins from environment
# allowed_origins = os.getenv("ALLOWED_ORIGINS", "").split(",")
allowed_origins=["http://localhost:3000","http://192.168.1.203:3000"]

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

    # Create a unique ID for this generation task
    message_id = str(uuid.uuid4())

    def run_async_generator():
        try:
            async def stream_words():
                try:
                    async for word in chatbot.ask_question_stream(prompt):
                        socketio.emit('response', {
                            "data": word,
                            "streaming": True,
                            "messageId": message_id
                        })
                        await asyncio.sleep(0.1)

                    socketio.emit('response', {"complete": True, "messageId": message_id})

                except Exception as e:
                    print(f"Error in stream_text: {str(e)}")
                    socketio.emit('response', {"error": str(e), "messageId": message_id})

            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            task = loop.create_task(stream_words())

            try:
                loop.run_until_complete(task)
            finally:
                loop.close()

        except Exception as e:
            print(f"Error in stream_text: {str(e)}")
            socketio.emit('response', {"error": str(e), "messageId": message_id})

    socketio.start_background_task(run_async_generator)
    # Return the message ID to the client immediately
    emit('response', {"messageId": message_id, "status": "started"})

@socketio.on('fetch_recipe_stream')
def fetch_recipe_stream(data):
    video_url = data.get('video_url')
    if not video_url:
        emit('recipe_stream', {"error": "Video URL is required"})
        return

    # Create a unique ID for this recipe fetch task
    message_id = str(uuid.uuid4())

    def run_async_stream():
        try:
            async def stream_recipe():
                try:
                    async for chunk in chatbot.fetch_recipe(video_url=video_url):
                        socketio.emit('recipe_stream', {
                            "data": chunk,
                            "streaming": True,
                            "messageId": message_id
                        })

                        await asyncio.sleep(0.05)

                    socketio.emit('recipe_stream', {"complete": True, "messageId": message_id})

                except Exception as e:
                    print(f"Error in fetch_recipe_stream: {str(e)}")
                    socketio.emit('recipe_stream', {"error": str(e), "messageId": message_id})

            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            task = loop.create_task(stream_recipe())

            try:
                loop.run_until_complete(task)
            finally:
                loop.close()

        except Exception as e:
            print(f"Error in fetch_recipe_stream: {str(e)}")
            socketio.emit('recipe_stream', {"error": str(e), "messageId": message_id})

    socketio.start_background_task(run_async_stream)
    # Return the message ID to the client immediately
    emit('recipe_stream', {"messageId": message_id, "status": "started"})

if __name__ == '__main__':
    # Bind to all network interfaces
    socketio.run(app, debug=True, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)