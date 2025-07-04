GENERAL_PROMPT = """
You are a professional culinary expert with mastery of various cuisines and cooking techniques. Respond to user queries with precise, expert-level information. Avoid offering assistance, asking for clarification, or repeating the question. Provide only the specific answer or instructions required.

Recipe Context:
{recipe_data}

Your Mission:
Deliver professional, authoritative answers with expert-level accuracy. Focus solely on the information requested, avoiding unnecessary commentary or offers of help.

User's Question: {user_question}

Key Approach:
Understand the question thoroughly.
Respond with clarity, precision, and professionalism.
Provide actionable, expert-level advice with clear instructions.
Use an engaging, authoritative tone that conveys expertise.
Include relevant culinary techniques, ingredient substitutions, or time-saving tips when appropriate.
Maintain a respectful, supportive, and encouraging tone.
"""

import warnings
import logging
import asyncio
from youtube_transcript_api import YouTubeTranscriptApi
import re
import os
from dotenv import load_dotenv
from together import Together
import time
import random

# Suppress warnings and logging  cleaner output
warnings.filterwarnings("ignore")
logging.getLogger("transformers").setLevel(logging.ERROR)

# Load environment variables
script_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(script_dir, '.env'))

# Initialize Together AI client
api_key = os.getenv('TOGETHER_API_KEY')
if not api_key:
    raise ValueError("TOGETHER_API_KEY not found in environment variables")

together_client = Together(api_key=api_key)

def clean_subtitle_text(subtitle_data):
    """
    Thoroughly clean and format subtitle text
    
    Args:
        subtitle_data (list or str): Subtitle data from youtube-transcript-api
    
    Returns:
        str: Cleaned, formatted subtitle text
    """
    texts = []

    # Handle list of dictionaries from youtube-transcript-api
    if isinstance(subtitle_data, list):
        for item in subtitle_data:
            if isinstance(item, dict) and 'text' in item:
                texts.append(item['text'])
    # Handle string input
    elif isinstance(subtitle_data, str):
        texts = [subtitle_data]
    else:
        # Fallback for other formats
        texts = [str(subtitle_data)]

    # Combine texts
    full_text = ' '.join(texts)

    # Comprehensive cleaning
    # Remove JSON-like syntax and brackets
    full_text = re.sub(r'[\{\}\[\]\"]', '', full_text)
    
    # Remove timestamps and time-related markers
    full_text = re.sub(r'\d+:\d+:\d+\.\d+ --> \d+:\d+:\d+\.\d+', '', full_text)
    full_text = re.sub(r'"tStartMs":\d+,"dDurationMs":\d+', '', full_text)
    
    # Remove extra whitespace
    full_text = re.sub(r'\s+', ' ', full_text)
    
    # Remove newline characters
    full_text = full_text.replace('\n', ' ')
    
    # Remove extra spaces and trim
    full_text = ' '.join(full_text.split())

    return full_text

def get_youtube_subtitles(url, lang='en', retry_count=3, backoff_factor=1):
    """
    Fetch YouTube subtitles as a clean, formatted string
    
    Args:
        url (str): YouTube video URL
        lang (str): Language code for subtitles (default: 'en')
        retry_count (int): Number of retries (default: 3)
        backoff_factor (int): Exponential backoff factor (default: 1)
    
    Returns:
        dict: A dictionary containing subtitle information
    """
    attempt = 0
    delay = 1
    while attempt < retry_count:
        try:
            # Extract the video ID from different YouTube URL formats
            video_id = None
            if "v=" in url:
                video_id = url.split("v=")[1].split("&")[0]
            elif "youtu.be/" in url:
                video_id = url.split("youtu.be/")[1].split("?")[0]
            elif "embed/" in url:
                video_id = url.split("embed/")[1].split("?")[0]

            if not video_id:
                raise ValueError("Could not extract video ID from URL")

            # Preferred languages for manual and auto transcripts
            manual_priority = ['en', 'hi']
            auto_priority = ['en', 'hi']

            # 1. Try manual transcripts
            try:
                transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
                try:
                    transcript = transcript_list.find_manually_created_transcript(manual_priority)
                    transcript_data = YouTubeTranscriptApi.get_transcript(video_id, languages=[transcript.language_code])
                    full_text = clean_subtitle_text(transcript_data)
                    if full_text and len(full_text) > 10:
                        return {
                            'full_text': full_text,
                            'languages': [transcript.language_code],
                            'type': 'manual'
                        }
                except Exception as e:
                    pass
                # 2. Try auto-generated transcripts
                try:
                    transcript = transcript_list.find_generated_transcript(auto_priority)
                    transcript_data = YouTubeTranscriptApi.get_transcript(video_id, languages=[transcript.language_code])
                    full_text = clean_subtitle_text(transcript_data)
                    if full_text and len(full_text) > 10:
                        return {
                            'full_text': full_text,
                            'languages': [transcript.language_code],
                            'type': 'auto-generated'
                        }
                except Exception as e:
                    pass
                # 3. Try any transcript that script API can fetch
                try:
                    transcript = transcript_list.find_transcript(transcript_list._langs)
                    transcript_data = YouTubeTranscriptApi.get_transcript(video_id, languages=[transcript.language_code])
                    full_text = clean_subtitle_text(transcript_data)
                    if full_text and len(full_text) > 10:
                        return {
                            'full_text': full_text,
                            'languages': [transcript.language_code],
                            'type': 'fallback-any-transcript'
                        }
                except Exception as e:
                    pass
                # If nothing worked, return available langs
                available_languages = [(tr.language_code, 'auto' if tr.is_generated else 'manual') for tr in
                                       transcript_list]
                raise Exception(f"Could not fetch transcript. Available: {available_languages}")
            except Exception as e:
                raise e
        except Exception as e:
            attempt += 1
            if attempt < retry_count:
                delay *= backoff_factor
                delay_with_jitter = delay * (1 + random.uniform(0, 0.1))
                print(f"Error fetching subtitles: {e}. Retrying in {delay_with_jitter} seconds...")
                time.sleep(delay_with_jitter)
            else:
                return {
                    'full_text': '',
                    'languages': [],
                    'error': str(e)
                }

# Step 2: Recipe Extraction Prompt
EXTRACTION_PROMPT = """
You are a professional chef assistant. Extract and format the following details from the provided recipe transcript. Your output must strictly adhere to the specified markdown structure below. Each ingredient and procedure item MUST start with a dash (-) to create proper bullet points.

**Title**: The concise name of the recipe.

**Ingredients**:
- First ingredient with quantity
- Second ingredient with quantity
- Third ingredient with quantity
(Continue this pattern for all ingredients)
  
**Procedure**:
- First step instruction
- Second step instruction
- Third step instruction
(Continue this pattern for all procedure steps)

IMPORTANT: Every single ingredient and procedure step must begin with "- " (dash followed by space) for proper formatting.

Recipe transcript: {transcript}
"""



# Step 3: Query LLAMA for Extraction

def query_llm(prompt, model="meta-llama/Llama-3.3-70B-Instruct-Turbo-Free"):
    try:
        response = together_client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1500  # Add max_tokens to prevent exceeding limits
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        return f"Error querying LLM: {e}"

async def query_llm_stream(prompt, model="meta-llama/Llama-3.3-70B-Instruct-Turbo-Free", websocket=None, stop_callback=None):
    try:
        stream = together_client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            stream=True,
            max_tokens=1500  # Add max_tokens to prevent exceeding limits
        )
        
        full_response = ""
        for chunk in stream:
            if stop_callback and stop_callback():
                print("Stream stopped by callback")
                break
            chunk_text = chunk.choices[0].delta.content or ""
            full_response += chunk_text
            yield chunk_text

    except Exception as e:
        error_msg = f"Error querying LLM: {e}"
        yield error_msg

async def extract_recipe(transcript, stop_callback=None):
    prompt = EXTRACTION_PROMPT.format(transcript=transcript)
    full_response = ""
    async for chunk in query_llm_stream(prompt, stop_callback=stop_callback):
        full_response += chunk
    
    yield full_response

# Recipe ChatBot Class
class RecipeChatBot:
    def __init__(self, model="meta-llama/Llama-3.3-70B-Instruct-Turbo-Free"):
        self.model = model
        self.recipe_data = None
        self.conversation_history = []

    async def fetch_recipe(self, video_url, stop_callback=None):
        """
        Extract and process recipe details from a YouTube video.
        """
        try:
            print("Fetching transcript...")
            transcript_data = get_youtube_subtitles(video_url)
            transcript_text = transcript_data['full_text']

            if 'error' in transcript_data:
                error_msg = f"Transcript extraction failed: {transcript_data['error']}"
                print(error_msg)
                yield error_msg
                return

            if not transcript_text or len(transcript_text) < 50:
                error_msg = f"Error: Could not extract sufficient transcript data from the video. Transcript length: {len(transcript_text)}. Please ensure the video has subtitles available."
                print(error_msg)
                yield error_msg
                return

            print("Extracting recipe...")
            full_response = ""
            async for chunk in extract_recipe(transcript_text, stop_callback=stop_callback):
                if stop_callback and stop_callback():
                    break
                full_response += chunk
                yield chunk

            self.recipe_data = full_response
            print(f"Recipe Summary:\n{self.recipe_data}")  # Print cleaned recipe in log
            print("Recipe extraction completed")

        except Exception as e:
            error_msg = f"Error processing video: {str(e)}"
            print(error_msg)
            yield error_msg


    def introduce_and_display_recipe(self):
        """
        Introduce the bot and display recipe details.
        """
        if not self.recipe_data:
            return "Error: Recipe data is missing. Please provide a valid video URL."

        introduction = (
            "Hi! I'm your Recipe Assistant. I can help you understand, modify, or get insights about recipes.\n"
            "Here’s the recipe I extracted for you:"
        )
        return f"{introduction}\n\n{self.recipe_data}\n\nFeel free to ask me any questions about the recipe!"


    async def ask_question_stream(self, question, stop_callback=None):
        """
        Asynchronous method to generate a streaming response to the user's question (always uses the general prompt).
        """
        if not self.recipe_data:
            yield "Please fetch a recipe first by providing a video URL."
            return
        
        # Improved conversation history management
        history_context = ""
        if self.conversation_history:
            # Limit to last 2 turns to prevent token overflow
            recent_history = self.conversation_history[-2:]
            history_context = "Recent Conversation:\n"
            for turn in recent_history:
                role = "User" if turn["role"] == "user" else "Assistant"
                # Truncate long responses to prevent token overflow
                content = turn['content']
                if len(content) > 300:
                    content = content[:300] + "..."
                history_context += f"{role}: {content}\n"
            history_context += "\n"
        
        # Truncate recipe data if it's too long
        recipe_data = self.recipe_data
        if len(recipe_data) > 2000:
            recipe_data = recipe_data[:2000] + "..."
        
        # Always use GENERAL_PROMPT
        prompt = GENERAL_PROMPT.format(
            recipe_data=recipe_data,
            user_question=f"{history_context}Current Question: {question}"
        )
        
        full_response = ""
        try:
            async for chunk in query_llm_stream(prompt, model=self.model, stop_callback=stop_callback):
                full_response += chunk
                yield chunk
            
            # Only add to history if we got a successful response
            if full_response and not full_response.startswith("Error querying LLM"):
                self.conversation_history.append({"role": "user", "content": question})
                self.conversation_history.append({"role": "assistant", "content": full_response})
                
                # Keep only last 6 turns (3 user + 3 assistant) to prevent   memory buildup
                if len(self.conversation_history) > 6:
                    self.conversation_history = self.conversation_history[-6:]
        
        except Exception as e:
            error_msg = f"Error in conversation: {str(e)}"
            yield error_msg

    def display_conversation(self):
        """
        Display the conversation history.
        """
        for turn in self.conversation_history:
            role = turn["role"].capitalize()
            print(f"{role}: {turn['content']}")

    def reset_conversation(self):
        """
        Reset conversation history for new chats.
        """
        self.conversation_history = []

async def handle_user_question(user_question, stop_callback=None):
    async for chunk in bot.ask_question_stream(user_question, stop_callback=stop_callback):
        print(chunk, end='', flush=True)

async def handle_recipe_genrate(url, stop_callback=None):
    async for chunk in bot.fetch_recipe(url, stop_callback=stop_callback):
        print(chunk,end='',flush=True)
# Main Script
if __name__ == "__main__":
    bot = RecipeChatBot()

    print("Welcome to the Recipe ChatBot!")
    print("Provide a YouTube link to get started.")

    # Step 1: Fetch Recipe
    video_url = input("Enter YouTube video URL: ").strip()
    # recipe_data = bot.fetch_recipe(video_url)
    asyncio.run(handle_recipe_genrate(video_url))
    # print(recipe_data)
    print(bot.introduce_and_display_recipe())

    # Step 2: Ask Questions in a Loop
    while True:
        user_question = input("\nYour Question (or type 'exit' to quit): ").strip()
        if user_question.lower() == "exit":
            print("Thank you for using the Recipe ChatBot! Goodbye.")
            break
        elif user_question.lower() == "new chat":
            bot.reset_conversation()
            print("Conversation history reset. Please start a new conversation.")
            continue

        asyncio.run(handle_user_question(user_question))