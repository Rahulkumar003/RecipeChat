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


# Suppress warnings and logging for cleaner output
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

def get_youtube_subtitles(url, lang='en'):
    """
    Fetch YouTube subtitles as a clean, formatted string
    
    Args:
        url (str): YouTube video URL
        lang (str): Language code for subtitles (default: 'en')
    
    Returns:
        dict: A dictionary containing subtitle information
    """
    try:
        print(f"Processing URL: {url}")

        # Extract the video ID from different YouTube URL formats
        video_id = None
        if "v=" in url:
            video_id = url.split("v=")[1].split("&")[0]
        elif "youtu.be/" in url:
            video_id = url.split("youtu.be/")[1].split("?")[0]
        elif "embed/" in url:
            video_id = url.split("embed/")[1].split("?")[0]

        print(f"Extracted video ID: {video_id}")

        if not video_id:
            raise ValueError("Could not extract video ID from URL")

        print("Searching for English or Hindi transcripts...")

        # Preferred languages for manual and auto transcripts
        manual_priority = ['en', 'hi']
        auto_priority = ['en', 'hi']

        # 1. Try manual transcripts
        try:
            transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
            print(f"Transcript list obtained.")
            try:
                transcript = transcript_list.find_manually_created_transcript(manual_priority)
                print(f"Found manually created transcript for: {transcript.language_code}")
                transcript_data = YouTubeTranscriptApi.get_transcript(video_id, languages=[transcript.language_code])
                full_text = clean_subtitle_text(transcript_data)
                if full_text and len(full_text) > 10:
                    return {
                        'full_text': full_text,
                        'languages': [transcript.language_code],
                        'type': 'manual'
                    }
            except Exception as e:
                print(f"No manual transcript in en/hi: {e}")
            # 2. Try auto-generated transcripts
            try:
                transcript = transcript_list.find_generated_transcript(auto_priority)
                print(f"Found auto-generated transcript for: {transcript.language_code}")
                transcript_data = YouTubeTranscriptApi.get_transcript(video_id, languages=[transcript.language_code])
                full_text = clean_subtitle_text(transcript_data)
                if full_text and len(full_text) > 10:
                    return {
                        'full_text': full_text,
                        'languages': [transcript.language_code],
                        'type': 'auto-generated'
                    }
            except Exception as e:
                print(f"No auto-generated transcript in en/hi: {e}")
            # 3. Try any transcript that script API can fetch
            try:
                transcript = transcript_list.find_transcript(transcript_list._langs)
                print(f"Found other transcript for: {transcript.language_code}")
                transcript_data = YouTubeTranscriptApi.get_transcript(video_id, languages=[transcript.language_code])
                full_text = clean_subtitle_text(transcript_data)
                if full_text and len(full_text) > 10:
                    return {
                        'full_text': full_text,
                        'languages': [transcript.language_code],
                        'type': 'fallback-any-transcript'
                    }
            except Exception as e:
                print(f"No fallback-any transcript in available list: {e}")
            # If nothing worked, return available langs
            available_languages = [(tr.language_code, 'auto' if tr.is_generated else 'manual') for tr in
                                   transcript_list]
            raise Exception(f"Could not fetch transcript. Available: {available_languages}")
        except Exception as e:
            print(f"Transcript API error: {e}")
            raise e
    except Exception as e:
        print(f"Error fetching subtitles: {e}")
        print(f"Error type: {type(e).__name__}")
        return {
            'full_text': '',
            'languages': [],
            'error': str(e)
        }

# Step 2: Recipe Extraction Prompt
EXTRACTION_PROMPT = """
You are a professional chef assistant. Extract and format the following details from the provided recipe transcript. Your output must strictly adhere to the specified structure below. Do not include any additional text, headings, or commentary. Begin the output directly with the recipe title:

\\*\\*Title\\*\\*: The concise name of the recipe.  
\\*\\*Ingredients\\*\\*:  
\\- List all ingredients with their quantities, each preceded by a bullet point (e.g., `\\-`).  
\\*\\*Procedure\\*\\*:  
\\- Step-by-step cooking instructions, each preceded by a bullet point (e.g., `\\-`).  

{transcript}
"""



# Step 3: Query LLAMA for Extraction

def query_llm(prompt, model="meta-llama/Llama-3.3-70B-Instruct-Turbo-Free"):
    """
    Queries the Together AI LLM with the given prompt.
    """
    try:
        response = together_client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}]
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        return f"Error querying LLM: {e}"

async def query_llm_stream(prompt, model="meta-llama/Llama-3.3-70B-Instruct-Turbo-Free", websocket=None):
    """
    Queries the Together AI LLM and streams the response.
    """
    try:
        stream = together_client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            stream=True
        )
        
        full_response = ""
        for chunk in stream:
            chunk_text = chunk.choices[0].delta.content or ""
            full_response += chunk_text
            yield chunk_text

    except Exception as e:
        error_msg = f"Error querying LLM: {e}"
        yield error_msg


async def extract_recipe(transcript):
    """
    Extract structured recipe data using LLM.
    """
    
    prompt = EXTRACTION_PROMPT.format(transcript=transcript)
    async for chunk in query_llm_stream(prompt):
        yield chunk
    # return query_llm(prompt)




# Recipe ChatBot Class
class RecipeChatBot:
    def __init__(self, model="meta-llama/Llama-3.3-70B-Instruct-Turbo-Free"):
        self.model = model
        self.recipe_data = None
        self.conversation_history = []

    async def fetch_recipe(self, video_url):
        """
        Extract and process recipe details from a YouTube video.
        """
        try:
            print("=" * 80)
            print("FETCHING TRANSCRIPT...")
            print("=" * 80)

            transcript_data = get_youtube_subtitles(video_url)
            transcript_text = transcript_data['full_text']

            print(f"Transcript length: {len(transcript_text)} characters")
            print(f"Available languages: {transcript_data.get('languages', [])}")

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

            print("-" * 80)
            print("FULL TRANSCRIPT:")
            print("-" * 80)
            print(transcript_text)
            print("-" * 80)
            print("END OF TRANSCRIPT")
            print("=" * 80)

            print("STARTING RECIPE EXTRACTION...")
            full_response = ""
            async for chunk in extract_recipe(transcript_text):
                full_response += chunk
                yield chunk

            self.recipe_data = full_response
            print("RECIPE EXTRACTION COMPLETED")

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


    async def ask_question_stream(self, question):
        """
        Asynchronous method to generate a streaming response to the user's question (always uses the general prompt).
        """
        if not self.recipe_data:
            yield "Please fetch a recipe first by providing a video URL."
            return
        history_context = ""
        if self.conversation_history:
            history_context = "Conversation History:\n"
            for turn in self.conversation_history[-3:]:  # Limit to last 3 turns to prevent prompt overflow
                role = "User" if turn["role"] == "user" else "Assistant"
                history_context += f"{role}: {turn['content']}\n"
            history_context += "\n"
        # Always use GENERAL_PROMPT
        prompt = GENERAL_PROMPT.format(
            recipe_data=self.recipe_data,
            user_question=f"{history_context}Current Question: {question}"
        )
        full_response = ""
        async for chunk in query_llm_stream(prompt, model=self.model):
            full_response += chunk
            yield chunk
        self.conversation_history.append({"role": "user", "content": question})
        self.conversation_history.append({"role": "assistant", "content": full_response})


    def display_conversation(self):
        """
        Display the conversation history.
        """
        for turn in self.conversation_history:
            role = turn["role"].capitalize()
            print(f"{role}: {turn['content']}")
async def handle_user_question(user_question):
    async for chunk in bot.ask_question_stream(user_question):
        print(chunk, end='', flush=True)

async def handle_recipe_genrate(url):
    async for chunk in bot.fetch_recipe(url):
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
    # if "Error" in recipe_data:
    #     print("Failed to fetch recipe. Please try again with a different video.")
    # else:
    print(bot.introduce_and_display_recipe())

    # Step 2: Ask Questions in a Loop
    while True:
        user_question = input("\nYour Question (or type 'exit' to quit): ").strip()
        if user_question.lower() == "exit":
            print("Thank you for using the Recipe ChatBot! Goodbye.")
            break

        asyncio.run(handle_user_question(user_question))
