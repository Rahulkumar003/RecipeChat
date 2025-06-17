import warnings
import logging
# from langchain_community.llms.ollama import Ollama
import asyncio
from youtube_transcript_api import YouTubeTranscriptApi
import re
import json
import os
from dotenv import load_dotenv
from together import Together

NUTRITION_PROMPT = """
You are a dietitian. Analyze the recipe details below to calculate the nutritional values (calories, protein, carbs, fat, fiber, vitamins). Provide per-serving and total values if applicable. Answer only what is asked by the user.

Recipe Details:
{recipe_data}

User Question:
{user_question}
"""

SUBSTITUTION_PROMPT = """
You are an expert chef. Suggest substitutions for missing or allergenic ingredients in the recipe, with brief explanations of why these substitutions work. Answer only what is asked by the user.

Recipe Details:
{recipe_data}

User Question:
{user_question}
"""

PROCEDURE_PROMPT = """
You are a culinary expert. Clarify doubts based on the user's question. Provide step-by-step guidance. Answer only what is asked by the user in detail.

Recipe Details:
{recipe_data}

User Question:
{user_question}
"""

DIETARY_PROMPT = """
You are a specialized nutritionist. Suggest recipe adjustments for the specified dietary requirement (e.g., vegan, keto, gluten-free). Provide relevant substitutions or removals. Clarify doubts based on the user's question. Answer only what is asked by the user.

Recipe Details:
{recipe_data}

User Question:
{user_question}
"""

STORAGE_PROMPT = """
You are a food storage expert. Provide details and clarify the user's question on how to store the dish, its shelf life, freezing options, and reheating instructions. Answer only what is asked by the user.

Recipe Details:
{recipe_data}

User Question:
{user_question}
"""

SAFETY_PROMPT = """
You are a food safety expert. Answer the user's question about food safety, including proper cooking, handling, or ingredient freshness. Answer only what is asked by the user.

Recipe Details:
{recipe_data}

User Question:
{user_question}
"""

FLAVOR_PROMPT = """
You are a flavor expert. Suggest ways to enhance or adjust the flavor of the recipe based on the user's question (e.g., spiciness, sweetness, balancing). Answer only what is asked by the user.

Recipe Details:
{recipe_data}

User Question:
{user_question}
"""

CULTURAL_PROMPT = """
You are a culinary historian. Provide cultural or historical context for the recipe, such as its origin or traditional significance, based on the user's question. Answer only what is asked by the user.

Recipe Details:
{recipe_data}

User Question:
{user_question}
"""

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



# Suppress warnings and logging for cleaner output
warnings.filterwarnings("ignore")
logging.getLogger("transformers").setLevel(logging.ERROR)

# # Load environment variables
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

        # Get subtitles using youtube-transcript-api
        subtitles = YouTubeTranscriptApi.get_transcript(video_id, languages=[lang])

        # Extract and clean the full text
        full_text = clean_subtitle_text(subtitles)

        # Return formatted result
        return {
            'full_text': full_text,
            'languages': [lang]  # We only requested one language
        }

    except Exception as e:
        print(f"Error fetching subtitles: {e}")
        return {
            'full_text': '',
            'languages': []
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
        # full_response += chunk
        print("yee gya chunk ===> ",chunk   )
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
        transcript = get_youtube_subtitles(video_url)
        print(transcript['full_text'])
        if "Error" in transcript:
            print(transcript)
            yield "Error "+transcript
         
        full_response=""
        async for chunk in extract_recipe(transcript):
                    full_response += chunk
                    yield chunk
        self.recipe_data=full_response    

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

    def classify_question(self, question):
        """
        Intelligently classify the user's question using a more nuanced approach.
        
        Args:
            question (str): The user's input question
        
        Returns:
            str: The most appropriate prompt category
        """
        
        
       
        # If no specific category is found, use LLM for intelligent classification
        classification_prompt = f"""
        Classify the following user question into the most appropriate category for a recipe assistant just answer one word of matching category nothing else:

        Question: {question}

        Categories:
        1. nutrition - Questions about calories, nutrients, health
        2. substitution - Ingredient replacements or alternatives
        3. procedure - Cooking methods, steps, techniques, summary
        4. dietary - Diet-specific modifications
        5. storage - Storing, preserving, shelf life
        6. flavor - Taste enhancement, seasoning
        7. safety - Cooking safety, handling
        8. cultural - Recipe origin and history
        9. general - Any other type of question

        Choose the most specific category that matches the question's intent:"""
        
        # Use the LLM to make a final determination
        try:
            classification = query_llm(classification_prompt).lower().strip()
            print("this is we get---->",classification)
            # Map variations to standard categories
            category_mapping = {
                "nutrition": "nutrition",
                "substitute": "substitution",
                "ingredient": "substitution",
                "procedure": "procedure",
                "cooking": "procedure",
                "dietary": "dietary",
                "diet": "dietary",
                "storage": "storage",
                "preserve": "storage",
                "flavor": "flavor",
                "taste": "flavor",
                "safety": "safety",
                "cultural": "cultural",
                "origin": "cultural",
                "general": "general"
            }
            
            # Find the best matching category
            for key, value in category_mapping.items():
                if key in classification:
                    print(value)
                    return "general"
                    
           
            return "general"
    
        except Exception:
            # Fallback to general if LLM classification fails
            return "general"


    async def ask_question_stream(self, question):
        """
        Asynchronous method to generate a streaming response to the user's question.
        
        Args:
            question (str): The user's question about the recipe
        
        Yields:
            str: Chunks of the response as they are generated
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
        # Determine the appropriate prompt
        intent = self.classify_question(question)
        prompt_mapping = {
            "nutrition": NUTRITION_PROMPT,
            "substitution": SUBSTITUTION_PROMPT,
            "procedure": PROCEDURE_PROMPT,
            "dietary": DIETARY_PROMPT,
            "storage": STORAGE_PROMPT,
            "flavor": FLAVOR_PROMPT,
            "cultural": CULTURAL_PROMPT,
            "safety": SAFETY_PROMPT,
            "general": GENERAL_PROMPT,
        }
        modified_prompt = prompt_mapping[intent].format(
        recipe_data=self.recipe_data, 
        user_question=f"{history_context}Current Question: {question}"
      )
        # prompt = prompt_mapping[intent].format(recipe_data=self.recipe_data, user_question=question)

        # Stream the response
        full_response = ""
        async for chunk in query_llm_stream(modified_prompt, model=self.model):
            full_response += chunk
            print("yee gya chunk ===> ",chunk   )
            yield chunk

        # Update conversation history
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
