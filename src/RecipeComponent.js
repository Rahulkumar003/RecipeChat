import React, { useState } from 'react';
import { fetchRecipe, askQuestion } from './apiService';

const RecipeComponent = () => {
  const [videoUrl, setVideoUrl] = useState('');
  const [question, setQuestion] = useState('');
  const [recipeData, setRecipeData] = useState(null);
  const [response, setResponse] = useState(null);

  const handleFetchRecipe = async () => {
    try {
      const data = await fetchRecipe(videoUrl);
      setRecipeData(data.recipe_data);
    } catch (error) {
      console.error('Failed to fetch recipe:', error);
    }
  };

  const handleAskQuestion = async () => {
    try {
      const data = await askQuestion(question);
      setResponse(data.response);
    } catch (error) {
      console.error('Failed to get response:', error);
    }
  };

  return (
    <div>
      <input
        type="text"
        value={videoUrl}
        onChange={(e) => setVideoUrl(e.target.value)}
        placeholder="Enter YouTube video URL"
      />
      <button onClick={handleFetchRecipe}>Fetch Recipe</button>

      {recipeData && <div>{recipeData}</div>}

      <input
        type="text"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Ask a question"
      />
      <button onClick={handleAskQuestion}>Ask Question</button>

      {response && <div>{response}</div>}
    </div>
  );
};

export default RecipeComponent;
