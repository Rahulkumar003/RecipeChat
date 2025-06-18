import asyncio
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from recipe_chatbot import RecipeChatBot
import os
from dotenv import load_dotenv
import uuid
from threading import Event

# Load environment variables
load_dotenv()

# Read CORS origins from environment
# allowed_origins = os.getenv("ALLOWED_ORIGINS", "").split(",")
allowed_origins=["http://localhost:3000","http://192.168.56.1:3000"]

app = Flask(__name__)
CORS(app, supports_credentials=True, origins=allowed_origins)

# Configure SocketIO for both addresses
socketio = SocketIO(app, cors_allowed_origins=allowed_origins, async_mode='threading')

# Initialize the chatbot
chatbot = RecipeChatBot()


# Task manager to track and cancel streaming tasks
class TaskManager:
    def __init__(self):
        self.tasks = {}  # message_id -> {"task": task, "stop_event": Event}

    def register_task(self, message_id, task, stop_event):
        self.tasks[message_id] = {"task": task, "stop_event": stop_event}

    def stop_task(self, message_id):
        if message_id in self.tasks:
            self.tasks[message_id]["stop_event"].set()
            return True
        return False

    def clean_task(self, message_id):
        if message_id in self.tasks:
            del self.tasks[message_id]


task_manager = TaskManager()


@socketio.on('stop_stream')
def stop_stream(data):
    message_id = data.get('messageId')
    if not message_id:
        emit('stop_acknowledged', {"error": "No message ID provided", "success": False})
        return

    success = task_manager.stop_task(message_id)
    emit('stop_acknowledged', {"success": success, "messageId": message_id})
    print(f"Stop request received for message: {message_id}, success: {success}")


@socketio.on('generate_text')
def generate_text(data):
    print("Received generate_text event")
    prompt = data.get('prompt')
    if not prompt:
        emit('response', {"error": "No prompt provided"})
        return

    # Create a unique ID for this generation task
    message_id = str(uuid.uuid4())
    stop_event = Event()

    def run_async_generator():
        try:
            async def stream_words():
                try:
                    async for word in chatbot.ask_question_stream(prompt):
                        # Check if we should stop
                        if stop_event.is_set():
                            print(f"Stopped generation for {message_id}")
                            socketio.emit('response', {"stopped": True, "messageId": message_id})
                            return

                        socketio.emit('response', {
                            "data": word,
                            "streaming": True,
                            "messageId": message_id
                        })
                        await asyncio.sleep(0.1)

                    # Only emit complete if we weren't stopped
                    if not stop_event.is_set():
                        socketio.emit('response', {"complete": True, "messageId": message_id})

                except asyncio.CancelledError:
                    print(f"Task was cancelled for {message_id}")
                    socketio.emit('response', {"stopped": True, "messageId": message_id})

            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            task = loop.create_task(stream_words())
            task_manager.register_task(message_id, task, stop_event)

            try:
                loop.run_until_complete(task)
            except asyncio.CancelledError:
                print(f"Task cancelled during execution: {message_id}")
            finally:
                loop.close()
                task_manager.clean_task(message_id)

        except Exception as e:
            print(f"Error in stream_text: {str(e)}")
            socketio.emit('response', {"error": str(e), "messageId": message_id})
            task_manager.clean_task(message_id)

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
    stop_event = Event()

    def run_async_stream():
        try:
            async def stream_recipe():
                try:
                    async for chunk in chatbot.fetch_recipe(video_url):
                        # Check if we should stop
                        if stop_event.is_set():
                            print(f"Stopped recipe fetch for {message_id}")
                            socketio.emit('recipe_stream', {"stopped": True, "messageId": message_id})
                            return

                        socketio.emit('recipe_stream', {
                            "data": chunk,
                            "streaming": True,
                            "messageId": message_id
                        })

                        # Small sleep to allow checking the stop flag
                        await asyncio.sleep(0.05)

                    # Only emit complete if we weren't stopped
                    if not stop_event.is_set():
                        socketio.emit('recipe_stream', {"complete": True, "messageId": message_id})

                except asyncio.CancelledError:
                    print(f"Recipe task was cancelled for {message_id}")
                    socketio.emit('recipe_stream', {"stopped": True, "messageId": message_id})

            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            task = loop.create_task(stream_recipe())
            task_manager.register_task(message_id, task, stop_event)

            try:
                loop.run_until_complete(task)
            except asyncio.CancelledError:
                print(f"Recipe task cancelled during execution: {message_id}")
            finally:
                loop.close()
                task_manager.clean_task(message_id)

        except Exception as e:
            print(f"Error in fetch_recipe_stream: {str(e)}")
            socketio.emit('recipe_stream', {"error": str(e), "messageId": message_id})
            task_manager.clean_task(message_id)

    socketio.start_background_task(run_async_stream)
    # Return the message ID to the client immediately
    emit('recipe_stream', {"messageId": message_id, "status": "started"})

if __name__ == '__main__':
    # Bind to all network interfaces
    socketio.run(app, debug=True, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)
