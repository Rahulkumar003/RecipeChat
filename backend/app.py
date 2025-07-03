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

# Initialize the chatbot instances per client
chatbot_instances = {}

# Track active streaming tasks per user (using IP as user identifier)
active_streams = {}
user_active_streams = {}  # Track all streams per user IP
active_tasks = {}  # Track asyncio tasks for proper cancellation

def get_or_create_chatbot(client_id):
    """Get or create a chatbot instance for the specific client"""
    if client_id not in chatbot_instances:
        chatbot_instances[client_id] = RecipeChatBot()
        print(f"Created new chatbot instance for client: {client_id}")
    return chatbot_instances[client_id]

def stop_user_other_streams(user_ip, current_client_id):
    """Stop all active streams for a user except the current one"""
    if user_ip in user_active_streams:
        for client_id in list(user_active_streams[user_ip]):
            if client_id != current_client_id and client_id in active_streams:
                active_streams[client_id]['stopped'] = True
                print(f"Stopped stream for client {client_id} (user {user_ip}) due to new session")
                
                # Cancel the asyncio task properly
                if client_id in active_tasks:
                    try:
                        active_tasks[client_id].cancel()
                        del active_tasks[client_id]
                        print(f"Cancelled task for client {client_id}")
                    except Exception as e:
                        print(f"Error cancelling task for client {client_id}: {e}")
                
                # Emit stop signal to that client
                socketio.emit('response', {
                    "message": "Stream stopped - new session started in another tab", 
                    "stopped": True,
                    "reason": "new_session"
                }, room=client_id)

def add_user_stream(user_ip, client_id):
    """Add a client to user's active streams"""
    if user_ip not in user_active_streams:
        user_active_streams[user_ip] = set()
    user_active_streams[user_ip].add(client_id)

def remove_user_stream(user_ip, client_id):
    """Remove a client from user's active streams"""
    if user_ip in user_active_streams:
        user_active_streams[user_ip].discard(client_id)
        if not user_active_streams[user_ip]:  # If no more streams for this user
            del user_active_streams[user_ip]

@socketio.on('connect')
def handle_connect():
    """Handle new client connections"""
    client_id = request.sid
    print(f"Client connected: {client_id}")
    # Create a new chatbot instance for this client
    get_or_create_chatbot(client_id)

@socketio.on('disconnect')
def handle_disconnect():
    """Clean up when client disconnects"""
    client_id = request.sid
    print(f"Client disconnected: {client_id}")
    
    # Cancel any active tasks
    if client_id in active_tasks:
        try:
            active_tasks[client_id].cancel()
            del active_tasks[client_id]
            print(f"Cancelled task for disconnected client {client_id}")
        except Exception as e:
            print(f"Error cancelling task for disconnected client {client_id}: {e}")
    
    # Clean up chatbot instance
    if client_id in chatbot_instances:
        del chatbot_instances[client_id]
    # Clean up active streams
    if client_id in active_streams:
        del active_streams[client_id]
    user_ip = request.remote_addr
    remove_user_stream(user_ip, client_id)

@socketio.on('generate_text')
def generate_text(data):
    print("Received generate_text event")
    prompt = data.get('prompt')
    if not prompt:
        emit('response', {"error": "No prompt provided"})
        return

    # Create a unique ID for this generation task
    message_id = str(uuid.uuid4())
    client_id = request.sid
    user_ip = request.remote_addr
    add_user_stream(user_ip, client_id)
    stop_user_other_streams(user_ip, client_id)
    active_streams[client_id] = {'stopped': False}

    def run_async_generator():
        try:
            async def stream_words():
                try:
                    def check_stop():
                        return active_streams.get(client_id, {}).get('stopped', False)
                    
                    chatbot = get_or_create_chatbot(client_id)
                    async for word in chatbot.ask_question_stream(prompt, stop_callback=check_stop):
                        if active_streams.get(client_id, {}).get('stopped', False):
                            break
                        socketio.emit('response', {
                            "data": word,
                            "streaming": True,
                            "messageId": message_id
                        })
                        await asyncio.sleep(0.1)

                    if not active_streams.get(client_id, {}).get('stopped', False):
                        socketio.emit('response', {"complete": True, "messageId": message_id})

                except asyncio.CancelledError:
                    print(f"Stream task cancelled for client: {client_id}")
                    socketio.emit('response', {"stopped": True, "messageId": message_id})
                    raise  # Re-raise to properly handle cancellation
                except Exception as e:
                    print(f"Error in stream_text: {str(e)}")
                    socketio.emit('response', {"error": str(e), "messageId": message_id})

            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            task = loop.create_task(stream_words())
            active_tasks[client_id] = task

            try:
                loop.run_until_complete(task)
            except asyncio.CancelledError:
                print(f"Task properly cancelled for client: {client_id}")
            finally:
                loop.close()
                if client_id in active_streams:
                    del active_streams[client_id]
                if client_id in active_tasks:
                    del active_tasks[client_id]

        except Exception as e:
            print(f"Error in stream_text: {str(e)}")
            socketio.emit('response', {"error": str(e), "messageId": message_id})
            if client_id in active_streams:
                del active_streams[client_id]
            if client_id in active_tasks:
                del active_tasks[client_id]

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
    client_id = request.sid
    user_ip = request.remote_addr
    add_user_stream(user_ip, client_id)
    stop_user_other_streams(user_ip, client_id)
    active_streams[client_id] = {'stopped': False}

    def run_async_stream():
        try:
            async def stream_recipe():
                try:
                    def check_stop():
                        return active_streams.get(client_id, {}).get('stopped', False)
                    
                    chatbot = get_or_create_chatbot(client_id)
                    async for chunk in chatbot.fetch_recipe(video_url=video_url, stop_callback=check_stop):
                        if active_streams.get(client_id, {}).get('stopped', False):
                            break
                        socketio.emit('recipe_stream', {
                            "data": chunk,
                            "streaming": True,
                            "messageId": message_id
                        })

                        await asyncio.sleep(0.05)

                    if not active_streams.get(client_id, {}).get('stopped', False):
                        socketio.emit('recipe_stream', {"complete": True, "messageId": message_id})

                except asyncio.CancelledError:
                    print(f"Recipe stream task cancelled for client: {client_id}")
                    socketio.emit('recipe_stream', {"stopped": True, "messageId": message_id})
                    raise  # Re-raise to properly handle cancellation
                except Exception as e:
                    print(f"Error in fetch_recipe_stream: {str(e)}")
                    socketio.emit('recipe_stream', {"error": str(e), "messageId": message_id})

            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            task = loop.create_task(stream_recipe())
            active_tasks[client_id] = task

            try:
                loop.run_until_complete(task)
            except asyncio.CancelledError:
                print(f"Recipe task properly cancelled for client: {client_id}")
            finally:
                loop.close()
                if client_id in active_streams:
                    del active_streams[client_id]
                if client_id in active_tasks:
                    del active_tasks[client_id]

        except Exception as e:
            print(f"Error in fetch_recipe_stream: {str(e)}")
            socketio.emit('recipe_stream', {"error": str(e), "messageId": message_id})
            if client_id in active_streams:
                del active_streams[client_id]
            if client_id in active_tasks:
                del active_tasks[client_id]

    socketio.start_background_task(run_async_stream)
    # Return the message ID to the client immediately
    emit('recipe_stream', {"messageId": message_id, "status": "started"})

@socketio.on('stop_stream')
def stop_stream():
    """Stop any active streaming for this client"""
    try:
        client_id = request.sid
        if client_id in active_streams:
            active_streams[client_id]['stopped'] = True
            print(f"Stop stream requested for client: {client_id}")
            
            # Cancel the task if it exists
            if client_id in active_tasks:
                try:
                    active_tasks[client_id].cancel()
                    del active_tasks[client_id]
                    print(f"Cancelled task for client {client_id}")
                except Exception as e:
                    print(f"Error cancelling task for client {client_id}: {e}")
            
            # Send confirmation back to client
            emit('response', {"message": "Stream stopped", "stopped": True})
            print(f"Stream stop confirmation sent to client: {client_id}")
        else:
            print(f"No active stream found for client: {client_id}")
            # Still send confirmation even if no active stream
            emit('response', {"message": "No active stream", "stopped": True})
    except Exception as e:
        print(f"Error stopping stream: {str(e)}")
        emit('response', {"error": f"Failed to stop stream: {str(e)}"})

@socketio.on('reset_conversation')
def reset_conversation():
    """Reset the conversation history for new chat sessions"""
    try:
        client_id = request.sid
        chatbot = get_or_create_chatbot(client_id)
        chatbot.reset_conversation()
        print("Conversation history reset")
        # Don't emit a response for this event as it's not needed
    except Exception as e:
        print(f"Error resetting conversation: {str(e)}")
        # Don't emit error response to avoid server issues

if __name__ == '__main__':
    # Bind to all network interfaces
    socketio.run(app, debug=True, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)